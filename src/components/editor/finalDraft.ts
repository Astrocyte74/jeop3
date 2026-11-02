import type { FinalJeopardyClue } from '@/lib/storage';

export type FinalField = keyof FinalJeopardyClue;
export const FINAL_FIELDS: FinalField[] = ['category', 'clue', 'response'];

export type FinalDraftState =
  | { kind: 'none' }
  | { kind: 'complete'; value: FinalJeopardyClue }
  | { kind: 'partial'; missing: FinalField[] };

/** Classify a draft: no round, a saveable round, or a half-filled one. */
export function classifyFinal(fj: FinalJeopardyClue | undefined): FinalDraftState {
  if (!fj) return { kind: 'none' };
  const trimmed: FinalJeopardyClue = {
    category: (fj.category ?? '').trim(),
    clue: (fj.clue ?? '').trim(),
    response: (fj.response ?? '').trim(),
  };
  const missing = FINAL_FIELDS.filter((f) => !trimmed[f]);
  if (missing.length === FINAL_FIELDS.length) return { kind: 'none' };
  if (missing.length > 0) return { kind: 'partial', missing };
  return { kind: 'complete', value: trimmed };
}
