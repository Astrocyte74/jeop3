/**
 * Answer-first board generation for one content span, with A+ fallback.
 *
 * Flow: extract specific answer-candidates -> filter generic/dup -> clues for
 * FIXED answers. If the source is too thin to fill every category, KEEP the
 * pipeline's good clues and patch only the missing slots from a single-pass
 * fallback — never discard good clues, never ship a partial board. Each clue is
 * tagged `provenance: "answer_first" | "fallback"` for later "regenerate weak
 * first" / analytics.
 *
 * (A future increment adds overgeneration + a judging pass that scores and
 * selects the best 5 per category by difficulty; this structure is what that
 * plugs into.)
 */
import { filterAnswerBoard } from './answers';
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
  /** true if any clue was patched in from the fallback pass (thin source). */
  patched: boolean;
}

const norm = (s: string): string =>
  (s || '').toLowerCase().trim().replace(/^(the|a|an)\s+/, '').replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ');

const withSource = (cats: AICategory[], sourceMaterial?: string, sourceUrl?: string): AICategory[] =>
  cats.map(c => ({ ...c, sourceMaterial, sourceUrl }));

const isFullBoard = (cats: AICategory[], want: number): boolean =>
  cats.length >= want && cats.slice(0, want).every(c => (c.clues?.length ?? 0) >= 5);

export async function generateContentSpan(generate: Generate, opts: ContentSpanInput): Promise<ContentSpanResult> {
  const { referenceMaterial, theme, titles, count, difficulty, existingAnswers = [], sourceMaterial, sourceUrl } = opts;

  // 1. extract specific answers -> filter -> clues for fixed answers
  let pipelineCats: AICategory[] = [];
  try {
    const extracted = await generate(
      'extract-board-answers',
      { referenceMaterial, count, topicList: titles, theme } as AIContext,
      difficulty
    );
    const raw = (extracted?.categories || []).map((c: any) => ({
      title: c.title,
      answers: (c.answers || []).filter((a: any) => a?.answer && a?.fact),
    }));
    const { board } = filterAnswerBoard(raw, 5, existingAnswers);
    if (board.length && board.some(c => c.answers.length > 0)) {
      const clueResult = await generate(
        'clues-from-answers',
        { answerBoard: board, theme } as AIContext,
        difficulty
      );
      pipelineCats = ((clueResult?.categories || []) as AICategory[]).filter(
        c => Array.isArray(c.clues) && c.clues.length > 0
      );
    }
  } catch {
    pipelineCats = [];
  }

  // 2. full pipeline board -> use it, tagged answer_first
  if (isFullBoard(pipelineCats, count)) {
    return {
      categories: withSource(
        pipelineCats.slice(0, count).map(c => ({
          ...c,
          clues: (c.clues || []).map(cl => ({ ...cl, provenance: 'answer_first' })),
        })) as AICategory[],
        sourceMaterial, sourceUrl
      ),
      patched: false,
    };
  }

  // 3. A+ patch: single-pass fallback (same titles) + merge, keeping pipeline clues.
  // Pool both sources, dedup across the whole span (and prior spans), and enforce
  // distinct 200–1000 values per category — answer_first clues are pooled first so
  // they win ties; fallback clues fill the gaps.
  const single = await generate(
    'categories-generate-from-content',
    {
      theme: theme || 'random', count, referenceMaterial,
      suggestedCategoryTitles: titles, existingAnswers,
    } as AIContext,
    difficulty
  );
  const singleCats = ((single?.categories || []) as AICategory[]).slice(0, count);

  const ALL_VALS = [200, 400, 600, 800, 1000];
  const spanSeen = new Set<string>(existingAnswers.map(norm)); // span- + cross-span dedup
  let patched = false;

  const merged: AICategory[] = singleCats.map((sc, i): AICategory => {
    const pc = pipelineCats[i];
    const pool: Clue[] = [
      ...((pc?.clues || []) as Clue[]).map(cl => ({ ...cl, provenance: 'answer_first' })),
      ...((sc.clues || []) as Clue[]).map(cl => ({ ...cl, provenance: 'fallback' })),
    ];
    const chosen: Clue[] = [];
    for (const cl of pool) {
      if (chosen.length >= 5) break;
      const n = norm(cl.response);
      if (spanSeen.has(n)) continue; // dup answer — skip
      spanSeen.add(n);
      chosen.push(cl);
      if (cl.provenance === 'fallback') patched = true;
    }
    // enforce distinct values 200–1000 (answer_first are first in `chosen`, so they keep their values)
    const usedVals = new Set<number>();
    const distinct = chosen.map(cl => {
      let v = cl.value;
      if (usedVals.has(v)) {
        const nv = ALL_VALS.find(x => !usedVals.has(x));
        if (nv !== undefined) v = nv;
      }
      usedVals.add(v);
      return { ...cl, value: v };
    });
    distinct.sort((a, b) => a.value - b.value);
    return { ...(pc || sc), title: (pc?.title || sc.title) as string, clues: distinct } as AICategory;
  });

  return { categories: withSource(merged, sourceMaterial, sourceUrl), patched };
}
