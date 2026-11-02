// Answer-option generation for Trivia Snake.
//
// Guarantees: the correct answer appears exactly once, and no two options are
// "the same answer" once case, punctuation, diacritics, a leading question
// phrase ("What is ...") and a leading article are ignored.

export interface SnakeOption {
  label: string;
  response: string;
  isCorrect: boolean;
}

interface CategoryLike {
  clues: Array<{ response: string }>;
}

export const SNAKE_LABELS = ['A', 'B', 'C', 'D', 'E'] as const;

/** Canonical form used only for comparing answers, never for display. */
export function normalizeAnswer(raw: string): string {
  let t = (raw ?? '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/['‘’`]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  // "what is / who are / whats ..." -> drop the question phrase
  t = t.replace(/^(?:(?:what|who|whom|where|when|which)\s+(?:is|are|was|were|s)|whats|whos|wheres)\s+/, '');
  // leading article
  t = t.replace(/^(?:the|a|an)\s+/, '');
  return t.trim() || (raw ?? '').trim().toLowerCase();
}

function shuffle<T>(arr: T[], rng: () => number): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * Build up to `max` labelled options: the correct answer plus distinct
 * distractors, taken from the same category first and then from the rest of
 * the board. Returns fewer than `max` only if the whole game does not contain
 * enough distinct answers.
 */
export function buildSnakeOptions(
  categories: CategoryLike[],
  categoryIndex: number,
  correctResponse: string,
  max = SNAKE_LABELS.length,
  rng: () => number = Math.random,
): SnakeOption[] {
  const seen = new Set<string>([normalizeAnswer(correctResponse)]);
  const picked: Array<{ response: string; isCorrect: boolean }> = [
    { response: correctResponse, isCorrect: true },
  ];

  const take = (pool: string[]) => {
    for (const response of shuffle(pool, rng)) {
      if (picked.length >= max) return;
      if (!response || !response.trim()) continue;
      const key = normalizeAnswer(response);
      if (seen.has(key)) continue;
      seen.add(key);
      picked.push({ response, isCorrect: false });
    }
  };

  take((categories[categoryIndex]?.clues ?? []).map((c) => c.response));
  if (picked.length < max) {
    take(
      categories
        .flatMap((cat, i) => (i === categoryIndex ? [] : cat.clues.map((c) => c.response))),
    );
  }

  return shuffle(picked, rng).map((p, i) => ({
    label: SNAKE_LABELS[i],
    response: p.response,
    isCorrect: p.isCorrect,
  }));
}
