/**
 * Real-Jeopardy few-shot exemplar retrieval.
 *
 * The clue-writing model imitates real Jeopardy voice much better when shown a
 * few real clue/answer pairs in a similar category. We ship a small (~130
 * pair) curated set (see `exemplars/jeopardy-exemplars.json`) and retrieve the
 * most topical ones per generation.
 *
 * Retrieval is keyword-overlap (TF-style) over category + clue words. No
 * embedding dependency — the set is tiny, so bag-of-words is fast and good.
 */

import rawData from './exemplars/jeopardy-exemplars.json';

export interface Exemplar {
  category: string;
  value: number;
  clue: string;
  response: string;
}

const EXEMPLARS = (rawData as { exemplars: Exemplar[] }).exemplars;

// Tokenize for matching: lowercase, strip punctuation + articles, split.
const STOP = new Set([
  'the', 'a', 'an', 'of', 'in', 'on', 'at', 'to', 'for', 'and', 'or', 'but',
  'is', 'are', 'was', 'were', 'be', 'been', 'this', 'these', 'that', 'those',
  'his', 'her', 'its', 'their', 'from', 'with', 'by', 'as', 'it', 'he', 'she',
  'they', 'who', 'what', 'when', 'where', 'named', 'born', 'about', 'into',
  'you', 'your', 'category', 'clue', 'first', 'new', 'one', 'two', 'three',
]);
const tokenize = (s: string): string[] =>
  (s.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim())
    .split(' ')
    .filter(w => w.length > 2 && !STOP.has(w));

// Pre-compute token sets per exemplar (category weighted heavier than clue).
const indexed = EXEMPLARS.map(ex => ({
  ex,
  tokens: new Map<string, number>(),
}));
for (const { ex, tokens } of indexed) {
  for (const w of tokenize(ex.category)) tokens.set(w, (tokens.get(w) ?? 0) + 3);
  for (const w of tokenize(ex.clue)) tokens.set(w, (tokens.get(w) ?? 0) + 1);
}

const EMPTY: Exemplar[] = [];

/**
 * Retrieve the top-N exemplars most related to a query (typically the category
 * title plus the game theme/topic). Returns up to `n` distinct exemplars,
 * spread across categories where possible so the model sees variety.
 */
export function retrieveExemplars(query: string, n = 4): Exemplar[] {
  if (!EXEMPLARS.length) return EMPTY;
  const q = tokenize(`${query}`);
  if (!q.length) {
    // No signal — return a deterministic varied slice.
    return EXEMPLARS.slice(0, n);
  }
  const qSet = new Set(q);
  const scored = indexed.map(({ ex, tokens }) => {
    let score = 0;
    for (const w of qSet) score += tokens.get(w) ?? 0;
    return { ex, score };
  });
  scored.sort((a, b) => b.score - a.score);

  // Take top hits but cap at one per category for diversity (fall back to the
  // next hit if the top one's category is already represented).
  const seenCat = new Set<string>();
  const out: Exemplar[] = [];
  for (const { ex, score } of scored) {
    if (out.length >= n) break;
    if (score === 0) break;
    if (seenCat.has(ex.category) && out.length < n) {
      // allow a duplicate category only if we can't fill from elsewhere; defer
      continue;
    }
    seenCat.add(ex.category);
    out.push(ex);
  }
  // Top up if we underfilled (e.g. very few matching categories). Rotate the
  // non-matching remainder by a query-derived offset so different categories
  // get the same weak signal rather than always the same defaults.
  if (out.length < n) {
    let h = 0;
    for (let i = 0; i < query.length; i++) h = (h * 31 + query.charCodeAt(i)) | 0;
    const zeroHits = scored.filter(s => s.score === 0).map(s => s.ex);
    const start = Math.abs(h) % Math.max(1, zeroHits.length);
    for (let k = 0; k < zeroHits.length && out.length < n; k++) {
      const ex = zeroHits[(start + k) % zeroHits.length];
      if (!out.includes(ex)) out.push(ex);
    }
  }
  return out.slice(0, n);
}
