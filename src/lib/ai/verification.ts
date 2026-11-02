import { checkAbort, timedSignal, progress, type GenerationOptions } from './progress';
import { getAIApiBase } from './service';
import type { AICategory, Clue, ClueVerification } from './types';

export interface VerificationItem {
  id: string;
  category: string;
  clue: string;
  response: string;
  source?: string;
  sourceUrl?: string;
}
export interface VerificationResult {
  model: string;
  verdicts: Array<{ id: string; verdict: 'true' | 'false' | 'unsure'; onTopic: boolean; reason: string }>;
}
export type Verifier = (topic: string, items: VerificationItem[], options?: GenerationOptions) => Promise<VerificationResult>;

export const requestVerification: Verifier = async (topic, items, options = {}) => {
  checkAbort(options.signal);
  const response = await fetch(`${getAIApiBase()}/ai/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal: timedSignal(options.signal, 150000),
    body: JSON.stringify({ topic, items, generatorModel: options.model || (typeof localStorage !== 'undefined' ? localStorage.getItem('jeop3:aiModel') : undefined) }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Independent verification unavailable');
  return data;
};

/** Strict ID matching: an omitted, duplicated or malformed verdict never passes. */
export async function verifyCategories(categories: AICategory[], topic: string, verify: Verifier = requestVerification, options: GenerationOptions = {}) {
  progress(options, 'verifying', 'Independently checking facts and topic…', { completed: 0, total: categories.length });
  const items: VerificationItem[] = categories.flatMap((cat, ci) => cat.clues.map((clue, qi) => ({
    id: `${ci}:${qi}`, category: cat.title, clue: clue.clue, response: clue.response,
    // A synthesized fact sheet is not independent evidence.
    source: cat.sourceType === 'ai_synthesized' ? undefined : cat.sourceMaterial?.slice(0, 8000),
    sourceUrl: cat.sourceType === 'ai_synthesized' ? undefined : cat.sourceUrl,
  })));
  if (!items.length) throw new Error('No clues to verify');
  const result = await verify(topic, items, options);
  checkAbort(options.signal);
  if (!result || typeof result.model !== 'string' || !result.model.trim() || !Array.isArray(result.verdicts) || result.verdicts.length !== items.length) throw new Error('Incomplete independent verification');
  const expected = new Set(items.map(i => i.id));
  for (const row of result.verdicts) {
    if (!row || !expected.delete(row.id) || !['true', 'false', 'unsure'].includes(row.verdict) || typeof row.onTopic !== 'boolean' || typeof row.reason !== 'string' || !row.reason.trim()) throw new Error('Invalid independent verification');
  }
  const verdicts = new Map(result.verdicts.map(v => [v.id, v]));
  const checkedAt = new Date().toISOString();
  const checked = categories.map((cat, ci) => ({ ...cat, clues: cat.clues.flatMap((clue, qi) => {
    const v = verdicts.get(`${ci}:${qi}`)!;
    if (v.verdict !== 'true' || !v.onTopic) return [];
    const verification: ClueVerification = {
      model: result.model, checkedAt, reason: v.reason,
      clue: clue.clue, response: clue.response, category: cat.title,
    };
    return [{ ...clue, verification }];
  }) }));
  checked.forEach((cat, i) => progress(options, 'verifying', `Checked ${cat.title}`, { categoryIndex: i, categoryTitle: cat.title, completed: i + 1, total: checked.length, status: cat.clues.length === categories[i].clues.length ? 'complete' : 'failed' }));
  return { categories: checked, audit: { ...result, items } };
}

/** Edits invalidate the displayed check without relying on every editing path. */
export function currentVerification(clue: Pick<Clue, 'clue' | 'response' | 'verification'>, category: string) {
  const v = clue.verification;
  return v && v.clue === clue.clue && v.response === clue.response && v.category === category ? v : undefined;
}
