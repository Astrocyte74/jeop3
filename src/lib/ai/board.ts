import { checkAbort, isAbort, progress, type GenerationOptions } from './progress';
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
 *      (keep the good clues, then independently verify every candidate)
 *   7. remove false/uncertain/off-topic pairs; use checked runner-ups
 *   8. research/repair only deficient categories once, verify replacements or fail
 *
 * Each clue is tagged provenance: "answer_first" | "fallback" | "repair".
 */
import { filterAnswerBoard, nearDupKey } from './answers';
import { retrieveExemplars } from './exemplars';
import { researchCategorySources } from './service';
import { categoryDocuments, materialFor } from './evidence';
import { repairCategories } from './repair';
import { verifyCategories, VerificationError, type Verifier } from './verification';
import type { AICategory, AIContext, AIDifficulty, AIPromptType, Clue, SourceDocument, SourcePolicy } from './types';

export type Generate = (promptType: AIPromptType, context: AIContext, difficulty: AIDifficulty, options?: GenerationOptions) => Promise<any>;

export interface ContentSpanInput extends GenerationOptions {
  referenceMaterial: string;
  theme?: string;
  titles?: string[];
  count: number;
  difficulty: AIDifficulty;
  existingAnswers?: string[];
  sourceMaterial?: string;
  sourceUrl?: string;
  categoryGrounding?: AICategory[];
  reviewMode?: AICategory['reviewMode'];
  /** One bounded repair pass by default; zero is useful for controlled evals. */
  retryLimit?: 0 | 1;
  refreshSources?: (category: AICategory, rejected: import('./types').VerificationFailure['clues']) => Promise<SourceDocument[]>;
  /** false is for controlled offline evaluation only; production defaults to verification. */
  verify?: Verifier | false;
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
  /**
   * Judged-but-unpicked clues retained per category, so "regenerate" can swap
   * in a known-good alternative instead of firing a fresh (lower-quality)
   * single-clue call. Absent when no candidates survived the judge bar.
   * Keyed by category title.
   */
  alternatives?: Array<{ title: string; clues: AlternativeClue[] }>;
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

/** A judged-but-unpicked clue retained for "regenerate" to pull from instead
 *  of a fresh AI call. Only clues that PASSED the judge bar are kept — these
 *  are strong runner-ups that lost a near-dup tiebreak or ranked 6th+, not
 *  quality failures. The score lets a future UI rank alternatives. */
export interface AlternativeClue {
  clue: string;
  response: string;
  provenance: 'answer_first';
  verification?: Clue['verification'];
  score: Score;
}
const overall = (s: Score): number => s.specificity + s.sourceSupport + s.clarity + s.jeopardyStyle - s.duplicateRisk;
const passes = (s: Score | undefined): s is Score =>
  !!s && s.sourceSupport >= 4 && s.specificity >= 4 && s.duplicateRisk <= 3;

interface ValuedClue { clue: string; response: string; value?: number; }
interface JudgedCat { title: string; clues: ValuedClue[]; scores: Map<string, Score>; }

/** Select up to 5 clues for a category: reject failures, drop near-dups (keep best),
 *  then order by judged difficulty and assign $200-$1000. Mutates `spanNear`.
 *
 *  Also returns the judged-but-unpicked clues as `alternatives` — strong
 *  runner-ups that passed the quality bar but lost a near-dup tiebreak or
 *  ranked 6th+. These are retained so "regenerate" can swap one in instead of
 *  firing a fresh AI call. */
function pickBestFive(clues: ValuedClue[], scores: Map<string, Score>, spanNear: Set<string>): { picked: Clue[]; alternatives: AlternativeClue[] } {
  const scored = clues
    .map(cl => ({ cl, s: scores.get(norm(cl.response)) }))
    .filter((x): x is { cl: ValuedClue; s: Score } => passes(x.s));
  scored.sort((a, b) => overall(b.s) - overall(a.s)); // best first (wins near-dup ties)
  const picked: typeof scored = [];
  const leftOver: typeof scored = [];
  for (const x of scored) {
    if (picked.length >= 5) {
      // Past the pick window — keep as an alternative unless it's a near-dup
      // of something already on the board (would duplicate a live answer).
      const nk = nearDupKey(x.cl.response);
      if (spanNear.has(nk) || spanNear.has(norm(x.cl.response))) continue;
      leftOver.push(x);
      continue;
    }
    const nk = nearDupKey(x.cl.response);
    if (spanNear.has(nk) || spanNear.has(norm(x.cl.response))) continue;
    spanNear.add(nk); spanNear.add(norm(x.cl.response));
    picked.push(x);
  }
  picked.sort((a, b) => a.s.difficulty - b.s.difficulty); // easiest -> hardest
  const pickedClues: Clue[] = picked.map((x, i) => ({
    value: VALUES[Math.min(i, VALUES.length - 1)],
    clue: x.cl.clue,
    response: x.cl.response,
    provenance: 'answer_first',
  }));
  // Alternatives ranked best-first by overall score (highest-quality swap first).
  const alternatives: AlternativeClue[] = leftOver
    .sort((a, b) => overall(b.s) - overall(a.s))
    .map(x => ({ clue: x.cl.clue, response: x.cl.response, provenance: 'answer_first', score: x.s }));
  return { picked: pickedClues, alternatives };
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
    let v = VALUES.includes(fc.value) ? fc.value : VALUES.find(x => !usedVals.has(x)) ?? VALUES[0];
    if (usedVals.has(v)) { const nv = VALUES.find(x => !usedVals.has(x)); if (nv !== undefined) v = nv; }
    usedVals.add(v);
    chosen.push({ ...fc, value: v, provenance: 'fallback' });
    usedFallback = true;
  }
  chosen.sort((a, b) => a.value - b.value);
  return { category: { title, clues: chosen } as AICategory, usedFallback };
}

export async function generateContentSpan(generate: Generate, opts: ContentSpanInput): Promise<ContentSpanResult> {
  const { referenceMaterial: inputMaterial, theme, titles, count, difficulty, existingAnswers = [], sourceMaterial = inputMaterial, sourceUrl, onStage } = opts;
  const providedDocuments = categoryDocuments({ title: 'Provided material', clues: [], sourceMaterial, sourceUrl });
  const referenceMaterial = opts.categoryGrounding ? inputMaterial : materialFor(providedDocuments);
  if (!opts.categoryGrounding && sourceMaterial.length > 72000) progress(opts, 'retrieval', 'Using the first 72,000 characters of supplied material', { warnings: ['Supplied material exceeds the evidence window; remaining text was not used.'] });
  const spanNear = new Set<string>(existingAnswers.map(norm));
  const catTitles = titles && titles.length
    ? titles.slice(0, count)
    : Array.from({ length: count }, (_, i) => `Category ${i + 1}`);

  const call: Generate = async (type, context, level) => {
    checkAbort(opts.signal);
    const result = await generate(type, { ...context, reviewMode: opts.reviewMode || 'provided-material' }, level, opts);
    checkAbort(opts.signal);
    return result;
  };
  const stage = (id: import('./types').GenerationStage, message: string) => {
    progress(opts, id, message, { completed: 0, total: count });
    onStage?.(message);
  };
  const complete = (id: import('./types').GenerationStage, cats: Array<{title: string}>) => catTitles.forEach((title, i) => {
    const ok = cats.some(c => norm(c.title) === norm(title));
    progress(opts, id, `${ok ? 'Completed' : 'Missing'} ${title}`, { categoryIndex: i, categoryTitle: title, completed: i + 1, total: count, status: ok ? 'complete' : 'failed' });
  });
  // 1-4. extract (overgenerate) -> filter -> clues (value-less) -> judge
  let judged: JudgedCat[] = [];
  try {
    stage('answers', 'Finding specific answers…');
    const extracted = await call(
      'extract-board-answers',
      { referenceMaterial, count, topicList: titles, theme } as AIContext, difficulty
    );
    complete('answers', extracted?.categories || []);
    const raw = (extracted?.categories || []).map((c: any) => ({
      title: c.title,
      answers: (c.answers || []).filter((a: any) => a?.answer && a?.fact),
    }));
    const { board } = filterAnswerBoard(raw, 5, existingAnswers);
    if (board.length && board.some(c => c.answers.length > 0)) {
      stage('clues', 'Writing clues for locked answers…');
      // Few-shot: retrieve real-Jeopardy exemplars matching the board's topics
      // so the model imitates authentic Jeopardy voice. Up to 4 across the
      // board, query biased by the game theme + the categories being written.
      const query = [theme, ...board.map(c => c.title)].filter(Boolean).join(' · ');
      const exemplars = retrieveExemplars(query, 4);
      const clueRes = await call('clues-from-answers', { answerBoard: board, theme, exemplars } as AIContext, difficulty);
      const clueCats = (clueRes?.categories || []) as Array<{ title: string; clues: ValuedClue[] }>;
      complete('clues', clueCats);
      if (clueCats.length) {
        stage('judging', 'Judging clue quality…');
        const judgeRes = await call(
          'judge-clues',
          { answerBoard: clueCats, referenceMaterial, theme } as AIContext, difficulty
        );
        const judgeCats = (judgeRes?.categories || []) as Array<{ title: string; scored: any[] }>;
        complete('judging', judgeCats);
        judged = clueCats.map(cc => {
          const scores = new Map<string, Score>();
          for (const s of (judgeCats.find(jc => norm(jc.title) === norm(cc.title))?.scored || [])) {
            if (s?.answer) scores.set(norm(s.answer), {
              specificity: +s.specificity, sourceSupport: +s.sourceSupport, clarity: +s.clarity,
              jeopardyStyle: +s.jeopardyStyle, duplicateRisk: +s.duplicateRisk, difficulty: +s.difficulty,
            });
          }
          return { title: cc.title, clues: cc.clues || [], scores };
        });
      }
    }
  } catch (error) {
    if (isAbort(error, opts.signal)) throw error;
    judged = [];
  }

  // 5. pick best 5/category by judge scores (assigns $200-$1000 by difficulty)
  const alternativesByTitle: Array<{ title: string; clues: AlternativeClue[] }> = [];
  let pickedPerCat: Clue[][] = catTitles.map((t, i) => {
    const jc = judged.find(c => norm(c.title) === norm(t)) || (!titles?.length ? judged[i] : undefined);
    if (!jc) return [];
    const { picked, alternatives } = pickBestFive(jc.clues, jc.scores, spanNear);
    if (alternatives.length) alternativesByTitle.push({ title: t, clues: alternatives });
    return picked;
  });

  // 6. patch gaps with a single-pass fallback (keep good clues, fill to 5)
  let patched = false;
  const needsPatch = pickedPerCat.some(cs => cs.length < 5);
  if (needsPatch) {
    patched = true;
    let singleCats: AICategory[] = [];
    try {
      stage('clues', 'Filling gaps from fallback…');
      const single = await call(
        'categories-generate-from-content',
        { theme: theme || 'random', count, referenceMaterial, suggestedCategoryTitles: titles, existingAnswers } as AIContext,
        difficulty
      );
      singleCats = ((single?.categories || []) as AICategory[]).slice(0, count);
    } catch (error) {
      if (isAbort(error, opts.signal)) throw error;
      singleCats = [];
    }
    pickedPerCat = catTitles.map((t, i) => {
      if (pickedPerCat[i].length >= 5) return pickedPerCat[i];
      const res = fillCategory(t, pickedPerCat[i], ((titles?.length ? singleCats.find(c => norm(c.title) === norm(t)) : singleCats[i])?.clues || []) as Clue[], spanNear);
      if (res.usedFallback) patched = true;
      return res.category.clues;
    });
  }

  let categories: AICategory[] = withSource(catTitles.map((title, i) => ({ title, clues: pickedPerCat[i] })), sourceMaterial, sourceUrl);
  categories = categories.map(cat => {
    const grounding = opts.categoryGrounding?.find(g => norm(g.title) === norm(cat.title));
    const sourced = grounding ? { ...grounding, ...cat, sourceMaterial: grounding.sourceMaterial, sourceUrl: grounding.sourceUrl, sourceType: grounding.sourceType } : { ...cat, reviewMode: opts.reviewMode || 'provided-material' as const };
    return { ...sourced, sources: grounding ? categoryDocuments(sourced) : providedDocuments };
  });
  if (opts.verify !== false) {
    onStage?.('Independently checking facts and topic…');
    // Include runner-ups in the same check, so replacing a rejected clue cannot
    // bypass the factual gate. No unchecked fallback runs after this point.
    const candidates = categories.map(cat => ({ ...cat, clues: [
      ...cat.clues,
      ...(alternativesByTitle.find(a => a.title === cat.title)?.clues || []).map(cl => ({ ...cl, value: 0 })),
    ] }));
    const checked = await verifyCategories(candidates, theme || 'random', opts.verify, { ...opts, requireEvidence: true });
    const used = new Set(existingAnswers.map(nearDupKey));
    alternativesByTitle.length = 0;
    categories = checked.categories.map(cat => {
      const local = new Set<string>();
      const accepted = cat.clues.filter(cl => {
        const key = nearDupKey(cl.response);
        if (used.has(key) || local.has(key)) return false;
        local.add(key);
        return true;
      });
      const selected = accepted.slice(0, 5);
      selected.forEach(cl => used.add(nearDupKey(cl.response)));
      const occupied = new Set(selected.filter(cl => VALUES.includes(cl.value)).map(cl => cl.value));
      const slots = VALUES.filter(v => !occupied.has(v));
      const clues = selected.map(cl => ({ ...cl, value: cl.value || slots.shift()! })).sort((a, b) => a.value - b.value);
      const remaining = accepted.slice(5).filter(cl => 'score' in cl) as unknown as AlternativeClue[];
      if (remaining.length) alternativesByTitle.push({ title: cat.title, clues: remaining });
      return { ...cat, clues };
    });
    alternativesByTitle.forEach(a => { a.clues = a.clues.filter(cl => !used.has(nearDupKey(cl.response))); });
    let rejected = checked.rejected;
    if (opts.retryLimit !== 0 && categories.some(cat => cat.clues.length < 5)) {
      const repaired = await repairCategories(generate, categories, rejected, { ...opts, verify: opts.verify });
      categories = repaired.categories;
      rejected = repaired.rejected;
      patched = true;
      const finalAnswers = new Set(categories.flatMap(c => c.clues.map(q => nearDupKey(q.response))));
      alternativesByTitle.forEach(a => { a.clues = a.clues.filter(q => !finalAnswers.has(nearDupKey(q.response))); });
    }
    const incomplete = categories.filter(cat => cat.clues.length !== 5);
    if (incomplete.length || categories.length !== count) {
      const failure = new VerificationError({
        code: 'VERIFICATION_INCOMPLETE', retryable: true,
        message: `Independent fact check could not complete the board: ${incomplete.map(c => `${c.title} (${c.clues.length}/5)`).join(', ')}. ${rejected.length} candidate(s) rejected; review the clue reasons or try again.`,
        model: checked.audit.model || undefined,
        clues: rejected,
        categories: categories.map(c => ({ title: c.title, accepted: c.clues.length, required: 5 })),
      });
      progress(opts, 'verifying', failure.message, { status: 'failed', verificationFailure: failure.details });
      throw failure;
    }
  }
  return {
    categories,
    patched,
    alternatives: alternativesByTitle.length ? alternativesByTitle : undefined,
  };
}

export interface TopicSpanInput extends GenerationOptions {
  topic: string;
  titles?: string[];
  count: number;
  difficulty: AIDifficulty;
  existingAnswers?: string[];
  verify?: Verifier | false;
  /** Reserved for authenticated research deployments. */
  authToken?: string | null;
  sourcePolicy?: 'auto' | SourcePolicy;
  retryLimit?: 0 | 1;
  research?: typeof researchCategorySources;
  /** Called before each pipeline step so the UI can show staged progress. */
  onStage?: (stage: string) => void;
}

/** Topic research uses real documents only; never a synthesized fact sheet. */
export async function generateTopicSpan(generate: Generate, opts: TopicSpanInput): Promise<ContentSpanResult> {
  const { topic, count, difficulty } = opts;
  const titles = opts.titles?.length ? opts.titles.slice(0, count) : Array.from({ length: count }, (_, i) => `${topic} ${i + 1}`);
  const research = opts.research || researchCategorySources;
  checkAbort(opts.signal);
  opts.onStage?.('Planning factual research…');
  progress(opts, 'retrieval', 'Planning factual research…', { completed: 0, total: count });
  let queries = titles.map(() => topic);
  if (count > 1) {
    // Display titles remain untouched. This internal pass translates them into
    // literal topic angles, using the existing names response contract.
    try {
      const plan = await generate('category-names-draft', { gameTopic: topic, researchTitles: titles, count }, difficulty, opts);
      checkAbort(opts.signal);
      if (Array.isArray(plan?.names) && plan.names.length === titles.length && plan.names.every((q: unknown) => typeof q === 'string' && q.trim() && q.length <= 200)) queries = plan.names.map((q: string) => `${topic}: ${q}`);
    } catch (e) { if (isAbort(e, opts.signal)) throw e; }
  }
  const grounding: AICategory[] = [];
  for (let i = 0; i < titles.length; i++) {
    checkAbort(opts.signal);
    opts.onStage?.(`Researching ${titles[i]}…`);
    const result = await research(topic, queries[i], { ...opts, sourcePolicy: opts.sourcePolicy });
    checkAbort(opts.signal);
    progress(opts, 'retrieval', result.sources.length ? `Found ${result.sources.length} sources for ${titles[i]}` : `No usable source for ${titles[i]}`, {
      categoryIndex: i, categoryTitle: titles[i], completed: i + 1, total: count,
      status: result.sources.length ? 'complete' : 'failed', sourcePolicy: result.policy,
      sources: result.sources.map(({ text: _text, ...source }) => source), warnings: result.warnings,
    });
    if (!result.sources.length) throw new Error(`No usable source material for: ${titles[i]}. ${result.warnings.join('; ')}. Add sources or try again.`);
    grounding.push({ title: titles[i], contentTopic: topic, clues: [], sources: result.sources, sourcePolicy: result.policy,
      researchQuery: queries[i], sourceType: 'retrieved', sourceMaterial: materialFor(result.sources), sourceUrl: result.sources[0]?.url,
      reviewMode: result.policy === 'lds-official' ? 'lds-teaching' : 'world' });
  }
  const result = await generateContentSpan(generate, {
    ...opts, titles, theme: topic, referenceMaterial: grounding.map(c => `${c.title}\n${c.sourceMaterial}`).join('\n\n'),
    categoryGrounding: grounding, reviewMode: grounding[0]?.reviewMode,
    refreshSources: async (cat, rejected) => {
      try {
        const focus = rejected.filter(r => r.onTopic).slice(0, 2).map(r => `${r.response}: ${r.reason}`).join('; ');
        const more = await research(topic, `${cat.researchQuery || topic} ${focus || 'additional documented facts'}`.slice(0, 1200), {
          ...opts, sourcePolicy: cat.sourcePolicy, excludeUrls: categoryDocuments(cat).flatMap(d => d.url ? [d.url] : []),
        });
        progress(opts, 'retrieval', `Additional research for ${cat.title}`, { categoryTitle: cat.title, attempt: 1, warnings: more.warnings, sourcePolicy: more.policy, sources: more.sources.map(({ text: _text, ...s }) => s) });
        return more.sources;
      } catch (error) {
        if (isAbort(error, opts.signal)) throw error;
        progress(opts, 'retrieval', `Additional research unavailable for ${cat.title}; using existing sources`, { categoryTitle: cat.title, attempt: 1, warnings: [error instanceof Error ? error.message : 'Research unavailable'] });
        return [];
      }
    },
  });
  return { ...result, categorySources: result.categories.map(c => ({ title: c.title, sourceType: 'retrieved', url: c.sourceUrl })) };
}
