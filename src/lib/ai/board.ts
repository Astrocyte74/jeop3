/**
 * Answer-first board generation for one content span, with overgeneration +
 * judging (curate, don't just generate) and A+ fallback.
 *
 * Flow:
 *   1. extract 8-10 specific answer-candidates / category (overgenerate)
 *   2. filter generic + exact/near duplicates (incl. cross-span)
 *   3. clues for the FIXED answers (generator does NOT assign difficulty)
 *   4. judge every clue/answer pair (specificity, source-support, clarity,
 *      jeopardy-style, duplicate-risk, difficulty)
 *   5. select the best 5 per category, ordered by JUDGED difficulty -> $200-$1000
 *   6. if a category is still short, patch the gaps from a single-pass fallback
 *      (keep the good clues, never ship a partial board)
 *
 * Each clue is tagged provenance: "answer_first" (judged/selected) | "fallback".
 */
import { filterAnswerBoard, nearDupKey } from './answers';
import { retrieveExemplars } from './exemplars';
import { searchAndFetchCategorySource } from './service';
import type { AICategory, AIContext, AIDifficulty, AIPromptType, Clue } from './types';

type Generate = (promptType: AIPromptType, context: AIContext, difficulty: AIDifficulty) => Promise<any>;

export interface ContentSpanInput {
  referenceMaterial: string;
  theme?: string;
  titles?: string[];
  count: number;
  difficulty: AIDifficulty;
  existingAnswers?: string[];
  sourceMaterial?: string;
  sourceUrl?: string;
  /** Called before each pipeline step so the UI can show staged progress. */
  onStage?: (stage: string) => void;
}

export interface ContentSpanResult {
  categories: AICategory[];
  patched: boolean;
  /**
   * Per-category grounding record for topic-mode spans. Map key is the
   * category title (normalized matching is the caller's job). Absent for
   * content-mode spans (which have a single paste/URL source already).
   */
  categorySources?: Array<{ title: string; sourceType: 'retrieved' | 'ai_synthesized'; url?: string }>;
}

const VALUES = [200, 400, 600, 800, 1000];
const norm = (s: string): string =>
  (s || '').toLowerCase().trim().replace(/^(the|a|an)\s+/, '').replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ');
const withSource = (cats: AICategory[], sm?: string, su?: string): AICategory[] =>
  cats.map(c => ({ ...c, sourceMaterial: sm, sourceUrl: su }));

interface Score {
  specificity: number; sourceSupport: number; clarity: number;
  jeopardyStyle: number; duplicateRisk: number; difficulty: number;
}
const overall = (s: Score): number => s.specificity + s.sourceSupport + s.clarity + s.jeopardyStyle - s.duplicateRisk;
const passes = (s: Score | undefined): s is Score =>
  !!s && s.sourceSupport >= 4 && s.specificity >= 4 && s.duplicateRisk <= 3;

interface ValuedClue { clue: string; response: string; value?: number; }
interface JudgedCat { title: string; clues: ValuedClue[]; scores: Map<string, Score>; }

/** Select up to 5 clues for a category: reject failures, drop near-dups (keep best),
 *  then order by judged difficulty and assign $200-$1000. Mutates `spanNear`. */
function pickBestFive(clues: ValuedClue[], scores: Map<string, Score>, spanNear: Set<string>): Clue[] {
  const scored = clues
    .map(cl => ({ cl, s: scores.get(norm(cl.response)) }))
    .filter((x): x is { cl: ValuedClue; s: Score } => passes(x.s));
  scored.sort((a, b) => overall(b.s) - overall(a.s)); // best first (wins near-dup ties)
  const picked: typeof scored = [];
  for (const x of scored) {
    if (picked.length >= 5) break;
    const nk = nearDupKey(x.cl.response);
    if (spanNear.has(nk) || spanNear.has(norm(x.cl.response))) continue;
    spanNear.add(nk); spanNear.add(norm(x.cl.response));
    picked.push(x);
  }
  picked.sort((a, b) => a.s.difficulty - b.s.difficulty); // easiest -> hardest
  return picked.map((x, i) => ({
    value: VALUES[Math.min(i, VALUES.length - 1)],
    clue: x.cl.clue,
    response: x.cl.response,
    provenance: 'answer_first',
  }));
}

/** Fill a category to 5: keep the (already-valued) pipeline clues, add fallback
 *  clues for the empty value slots, deduped against `spanNear`. */
function fillCategory(title: string, pipelineClues: Clue[], fallbackClues: Clue[], spanNear: Set<string>): { category: AICategory; usedFallback: boolean } {
  let usedFallback = false;
  const chosen: Clue[] = [...pipelineClues];
  const usedVals = new Set(chosen.map(c => c.value));
  for (const fc of fallbackClues) {
    if (chosen.length >= 5) break;
    const nk = nearDupKey(fc.response);
    if (spanNear.has(nk) || spanNear.has(norm(fc.response))) continue;
    spanNear.add(nk); spanNear.add(norm(fc.response));
    let v = fc.value ?? VALUES.find(x => !usedVals.has(x)) ?? VALUES[0];
    if (usedVals.has(v)) { const nv = VALUES.find(x => !usedVals.has(x)); if (nv !== undefined) v = nv; }
    usedVals.add(v);
    chosen.push({ ...fc, value: v, provenance: 'fallback' });
    usedFallback = true;
  }
  chosen.sort((a, b) => a.value - b.value);
  return { category: { title, clues: chosen } as AICategory, usedFallback };
}

export async function generateContentSpan(generate: Generate, opts: ContentSpanInput): Promise<ContentSpanResult> {
  const { referenceMaterial, theme, titles, count, difficulty, existingAnswers = [], sourceMaterial, sourceUrl, onStage } = opts;
  const spanNear = new Set<string>(existingAnswers.map(norm));
  const catTitles = titles && titles.length
    ? titles.slice(0, count)
    : Array.from({ length: count }, (_, i) => `Category ${i + 1}`);

  // 1-4. extract (overgenerate) -> filter -> clues (value-less) -> judge
  let judged: JudgedCat[] = [];
  try {
    onStage?.('Finding specific answers…');
    const extracted = await generate(
      'extract-board-answers',
      { referenceMaterial, count, topicList: titles, theme } as AIContext, difficulty
    );
    const raw = (extracted?.categories || []).map((c: any) => ({
      title: c.title,
      answers: (c.answers || []).filter((a: any) => a?.answer && a?.fact),
    }));
    const { board } = filterAnswerBoard(raw, 5, existingAnswers);
    if (board.length && board.some(c => c.answers.length > 0)) {
      onStage?.('Writing clues for locked answers…');
      // Few-shot: retrieve real-Jeopardy exemplars matching the board's topics
      // so the model imitates authentic Jeopardy voice. Up to 4 across the
      // board, query biased by the game theme + the categories being written.
      const query = [theme, ...board.map(c => c.title)].filter(Boolean).join(' · ');
      const exemplars = retrieveExemplars(query, 4);
      const clueRes = await generate('clues-from-answers', { answerBoard: board, theme, exemplars } as AIContext, difficulty);
      const clueCats = (clueRes?.categories || []) as Array<{ title: string; clues: ValuedClue[] }>;
      if (clueCats.length) {
        onStage?.('Judging clue quality…');
        const judgeRes = await generate(
          'judge-clues',
          { answerBoard: clueCats, referenceMaterial, theme } as AIContext, difficulty
        );
        const judgeCats = (judgeRes?.categories || []) as Array<{ title: string; scored: any[] }>;
        judged = clueCats.map((cc, i) => {
          const scores = new Map<string, Score>();
          for (const s of (judgeCats[i]?.scored || [])) {
            if (s?.answer) scores.set(norm(s.answer), {
              specificity: +s.specificity, sourceSupport: +s.sourceSupport, clarity: +s.clarity,
              jeopardyStyle: +s.jeopardyStyle, duplicateRisk: +s.duplicateRisk, difficulty: +s.difficulty,
            });
          }
          return { title: cc.title, clues: cc.clues || [], scores };
        });
      }
    }
  } catch {
    judged = [];
  }

  // 5. pick best 5/category by judge scores (assigns $200-$1000 by difficulty)
  let pickedPerCat: Clue[][] = catTitles.map((t, i) => {
    const jc = judged.find(c => norm(c.title) === norm(t)) || judged[i];
    return jc ? pickBestFive(jc.clues, jc.scores, spanNear) : [];
  });

  // 6. patch gaps with a single-pass fallback (keep good clues, fill to 5)
  let patched = false;
  const needsPatch = pickedPerCat.some(cs => cs.length < 5);
  if (needsPatch) {
    patched = true;
    let singleCats: AICategory[] = [];
    try {
      onStage?.('Filling gaps from fallback…');
      const single = await generate(
        'categories-generate-from-content',
        { theme: theme || 'random', count, referenceMaterial, suggestedCategoryTitles: titles, existingAnswers } as AIContext,
        difficulty
      );
      singleCats = ((single?.categories || []) as AICategory[]).slice(0, count);
    } catch {
      singleCats = [];
    }
    pickedPerCat = catTitles.map((t, i) => {
      if (pickedPerCat[i].length >= 5) return pickedPerCat[i];
      const res = fillCategory(t, pickedPerCat[i], (singleCats[i]?.clues || []) as Clue[], spanNear);
      if (res.usedFallback) patched = true;
      return res.category.clues;
    });
  }

  const categories: AICategory[] = catTitles.map((title, i) => ({ title, clues: pickedPerCat[i] }) as AICategory);
  return { categories: withSource(categories, sourceMaterial, sourceUrl), patched };
}

export interface TopicSpanInput {
  topic: string;
  titles?: string[];
  count: number;
  difficulty: AIDifficulty;
  existingAnswers?: string[];
  /** Clerk token for the /search-wikipedia + /fetch-article endpoints. */
  authToken?: string | null;
  /** Called before each pipeline step so the UI can show staged progress. */
  onStage?: (stage: string) => void;
}

/**
 * Topic-mode parity: bring a bare topic ("Ancient Rome") onto the answer-first
 * pipeline. Real grounding is preferable to AI synthesis — so for each category
 * title we first try to retrieve a Wikipedia article and fall back to the AI
 * fact-sheet only when retrieval fails or is thin. This breaks the
 * self-referential loop where the model invents a fact-sheet and then grades
 * clues against its own invention.
 *
 * Per-category retrieval runs against the curated category titles (already
 * produced by the wizard's category-names-draft pass). Each retrieved/synthesized
 * section is concatenated into the same sectioned format the fact-sheet used to
 * produce, then the existing extract → clues → judge → select pipeline runs
 * unchanged.
 *
 * Per-category provenance is recorded in `categorySources` so the UI can later
 * distinguish "grounded in Wikipedia" from "AI fact-sheet" categories.
 */
export async function generateTopicSpan(
  generate: Generate,
  opts: TopicSpanInput
): Promise<ContentSpanResult> {
  const { topic, titles, count, difficulty, existingAnswers = [], authToken = null, onStage } = opts;
  const catTitles = titles && titles.length
    ? titles.slice(0, count)
    : Array.from({ length: count }, (_, i) => `${topic} ${i + 1}`);

  // 1. Per-category retrieval (Wikipedia). The fetches are independent HTTP
  //    calls with no cross-category dependency, so run them in parallel — this
  //    cuts ~2-3s off a 6-category game vs sequential awaits. Map back to
  //    category order afterwards. (Distinct from cross-span parallelism, which
  //    we correctly defer: spans share an existingAnswers dedup chain;
  //    categories within one span don't.)
  onStage?.('Researching categories…');
  const retrieved = await Promise.all(
    catTitles.map(title => searchAndFetchCategorySource(title, authToken))
  );
  const sections: Array<{ title: string; body: string }> = [];
  // categorySources is finalized after synthesis — a category's sourceType is
  // only 'ai_synthesized' if synthesis actually produced confident content.
  const categorySources: ContentSpanResult['categorySources'] = [];
  const retrievedByTitle = new Map<string, { url: string }>();
  const needFactSheet: string[] = [];
  catTitles.forEach((title, i) => {
    const r = retrieved[i];
    if (r) {
      sections.push({ title, body: r.text });
      retrievedByTitle.set(title, { url: r.url });
    } else {
      needFactSheet.push(title);
    }
  });

  // 2. AI fact-sheet fallback for any categories retrieval couldn't ground.
  //    The fact-sheet prompt marks each section "high" or "low" confidence and
  //    is told to return EMPTY facts (rather than fabricate) for sections it
  //    doesn't truly know. We honor that: low-confidence sections are dropped,
  //    never filled with invented material. This is what stops made-up topics
  //    ("A Very Obscure Made-Up Topic") from producing confident fiction.
  const synthesizedTitles = new Set<string>();
  if (needFactSheet.length) {
    onStage?.('Filling gaps from AI research…');
    let synthSections: Array<{ title: string; confidence: 'high' | 'low'; facts: string[] }> = [];
    try {
      const sheet = await generate(
        'topic-fact-sheet',
        { theme: topic, count: needFactSheet.length, topicList: needFactSheet } as AIContext,
        difficulty
      );
      synthSections = (sheet?.sections || []) as Array<{ title: string; confidence: 'high' | 'low'; facts: string[] }>;
    } catch { synthSections = []; }
    for (let i = 0; i < needFactSheet.length; i++) {
      const title = needFactSheet[i];
      const sec = synthSections[i];
      const facts = sec?.facts || [];
      // Only accept the model's facts when it marked itself confident. A
      // low-confidence section (or one with no facts) is left out rather
      // than padded with a generic placeholder that the pipeline would then
      // mine as if it were real grounding.
      if (sec?.confidence === 'high' && facts.length) {
        sections.push({ title, body: facts.map(f => `- ${f}`).join('\n') });
        synthesizedTitles.add(title);
      }
      // else: leave the category absent from `sections`. If every category
      // ends up absent, the bail check below fires and the caller's
      // last-resort single-pass runs instead of shipping invented facts.
    }
  }

  // Finalize per-category provenance. Categories with no confident grounding
  // are omitted — they'll surface downstream as fallback/patched clues via
  // the pipeline's gap-fill, which is honest (not falsely "synthesized").
  for (const title of catTitles) {
    if (retrievedByTitle.has(title)) {
      categorySources.push({ title, sourceType: 'retrieved', url: retrievedByTitle.get(title)!.url });
    } else if (synthesizedTitles.has(title)) {
      categorySources.push({ title, sourceType: 'ai_synthesized' });
    }
    // else: no entry — category has no grounding source.
  }

  // 3. If no category ended up with usable grounding — retrieval missed
  //    everywhere AND the fact-sheet was non-confident/empty everywhere — bail
  //    so the caller's last-resort single-pass runs rather than producing a
  //    board from fabricated sources.
  if (!sections.some(s => s.body && s.body.length > 50)) {
    throw new Error('topic grounding failed (no Wikipedia results, fact-sheet not confident)');
  }

  // 4. Concat into one sectioned reference string the existing pipeline mines
  //    exactly like pasted content, and hand off to the unchanged pipeline.
  const referenceMaterial = sections.map(s => `${s.title}\n${s.body}`).join('\n\n');
  const result = await generateContentSpan(generate, {
    referenceMaterial,
    theme: topic,
    titles: catTitles,
    count,
    difficulty,
    existingAnswers,
    // No sourceMaterial/sourceUrl: topics have no original paste/URL to attach.
    onStage,
  });
  return { ...result, categorySources };
}

