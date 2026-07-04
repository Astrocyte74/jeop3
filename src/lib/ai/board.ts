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
}

export interface ContentSpanResult {
  categories: AICategory[];
  patched: boolean;
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
  const { referenceMaterial, theme, titles, count, difficulty, existingAnswers = [], sourceMaterial, sourceUrl } = opts;
  const spanNear = new Set<string>(existingAnswers.map(norm));
  const catTitles = titles && titles.length
    ? titles.slice(0, count)
    : Array.from({ length: count }, (_, i) => `Category ${i + 1}`);

  // 1-4. extract (overgenerate) -> filter -> clues (value-less) -> judge
  let judged: JudgedCat[] = [];
  try {
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
      const clueRes = await generate('clues-from-answers', { answerBoard: board, theme } as AIContext, difficulty);
      const clueCats = (clueRes?.categories || []) as Array<{ title: string; clues: ValuedClue[] }>;
      if (clueCats.length) {
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
