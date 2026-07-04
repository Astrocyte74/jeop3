/**
 * Answer-quality filtering for the answer-first clue pipeline.
 *
 * After `extract-board-answers` and before `clues-from-answers`, we drop generic
 * / too-vague answer candidates and cross-board duplicates. This forces clues to
 * point at specific entities — the model can't write "→ Size" because "Size"
 * never reaches the clue-writing step.
 */

export interface AnswerCandidate {
  answer: string;
  fact: string;
}

// Bare generic concept-words that are never good Jeopardy responses.
const GENERIC_ANSWERS = new Set(
  [
    'size', 'speed', 'atmosphere', 'orbit', 'orbital speed', 'orbital velocity',
    'temperature', 'craters', 'the sun', 'sun', 'planet', 'surface', 'rotation',
    'axial rotation', 'distance', 'gravity', 'core', 'moons', 'moon', 'year', 'day',
    'name', 'color', 'location', 'mass', 'diameter', 'volume', 'density', 'length',
    'height', 'depth', 'width', 'velocity', 'resonance', 'spin-orbit resonance',
  ].map(s => s.toLowerCase())
);

const normalize = (s: string): string =>
  (s || '').toLowerCase().trim()
    .replace(/^(the|a|an)\s+/, '')
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ');

export function isGenericAnswer(answer: string): boolean {
  const a = normalize(answer);
  if (!a) return true;
  if (GENERIC_ANSWERS.has(a)) return true;
  // A single very short word is almost always too generic ("god", "Roman", "0").
  if (!/\s/.test(a) && a.length < 5) return true;
  return false;
}

export interface FilterResult {
  board: Array<{ title: string; answers: AnswerCandidate[] }>;
  dropped: number;
  /** Total specific answers kept across the whole board. */
  kept: number;
  /** True if any category has fewer than `want` answers (thin source). */
  thin: boolean;
}

/**
 * Drop generic answers and cross-board duplicates. Categories may end up with
 * fewer answers than requested when the source is thin — the caller decides
 * whether to proceed (reduced board) or fall back to single-pass generation.
 */
export function filterAnswerBoard(
  board: Array<{ title: string; answers: AnswerCandidate[] }>,
  want = 5
): FilterResult {
  const seen = new Set<string>();
  let dropped = 0;
  let kept = 0;
  const cleaned = board.map(cat => {
    const answers = cat.answers.filter(a => {
      const n = normalize(a.answer);
      if (isGenericAnswer(a.answer) || seen.has(n)) {
        dropped++;
        return false;
      }
      seen.add(n);
      kept++;
      return true;
    });
    return { title: cat.title, answers };
  });
  return { board: cleaned, dropped, kept, thin: cleaned.some(c => c.answers.length < want) };
}
