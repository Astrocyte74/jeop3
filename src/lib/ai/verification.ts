import { checkAbort, timedSignal, progress, type GenerationOptions } from './progress';
import { categoryDocuments, resolveEvidence } from './evidence';
import { getAIApiBase } from './service';
import type { AICategory, Clue, ClueVerification, VerificationFailure, SourceDocument, SourcePolicy } from './types';

export interface VerificationItem {
  id: string;
  category: string;
  clue: string;
  response: string;
  source?: string;
  sourceUrl?: string;
  sources?: SourceDocument[];
  requireEvidence?: boolean;
  reviewMode?: AICategory['reviewMode'];
  sourcePolicy?: SourcePolicy;
}
export interface VerificationResult {
  model: string;
  verdicts: Array<{ id: string; verdict: 'true' | 'false' | 'unsure'; onTopic: boolean; reason: string; evidence?: Array<{ sourceId: string; quote: string }> }>;
}
export type Verifier = (topic: string, items: VerificationItem[], options?: GenerationOptions) => Promise<VerificationResult>;

export class VerificationError extends Error {
  readonly details: VerificationFailure;

  constructor(details: VerificationFailure) {
    super(details.message);
    this.name = 'VerificationError';
    this.details = details;
  }
}

function unavailable(error: unknown): VerificationError {
  if (error instanceof VerificationError) return error;
  const reason = error instanceof Error ? error.message : 'Unknown verifier failure';
  return new VerificationError({
    code: 'VERIFICATION_UNAVAILABLE', retryable: true,
    message: `Independent fact check unavailable: ${reason}. Please retry.`, clues: [],
  });
}

export const requestVerification: Verifier = async (topic, items, options = {}) => {
  checkAbort(options.signal);
  try {
    const documents = new Map<string, SourceDocument>();
    const wireItems = items.map(({ sources, source, sourceUrl, ...item }) => {
      for (const source of sources || []) {
        const previous = documents.get(source.id);
        if (previous && (previous.text !== source.text || previous.url !== source.url)) throw new Error('Conflicting source IDs');
        documents.set(source.id, source);
      }
      return { ...item, ...(!item.requireEvidence ? { source, sourceUrl } : {}), sourceIds: sources?.map(s => s.id) };
    });
    const response = await fetch(`${getAIApiBase()}/ai/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: timedSignal(options.signal, 150000),
      body: JSON.stringify({ topic, items: wireItems, sources: [...documents.values()], generatorModel: options.model || (typeof localStorage !== 'undefined' ? localStorage.getItem('jeop3:aiModel') : undefined) }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || data.error || 'Independent verification unavailable');
    return data;
  } catch (error) {
    checkAbort(options.signal);
    throw unavailable(error);
  }
};

/** Strict ID matching: an omitted, duplicated or malformed verdict never passes. */
export async function verifyCategories(categories: AICategory[], topic: string, verify: Verifier = requestVerification, options: GenerationOptions & { requireEvidence?: boolean } = {}) {
  progress(options, 'verifying', 'Independently checking facts and topic…', { completed: 0, total: categories.length });
  const documents = categories.map(categoryDocuments);
  const items: VerificationItem[] = categories.flatMap((cat, ci) => cat.clues.map((clue, qi) => ({
    id: `${ci}:${qi}`, category: cat.title, clue: clue.clue, response: clue.response,
    // A synthesized fact sheet is not independent evidence.
    source: cat.sourceType === 'ai_synthesized' ? undefined : cat.sourceMaterial?.slice(0, 8000),
    sourceUrl: cat.sourceType === 'ai_synthesized' ? undefined : cat.sourceUrl,
    sources: documents[ci], requireEvidence: options.requireEvidence ?? !!cat.sources,
    reviewMode: cat.reviewMode || 'world', sourcePolicy: cat.sourcePolicy,
  })));
  // No candidate is a generation shortfall, not a verifier outage.
  if (!items.length) return { categories, audit: { model: '', verdicts: [], items }, rejected: [] };
  let result: VerificationResult;
  try {
    result = await verify(topic, items, options);
    checkAbort(options.signal);
    if (!result || typeof result.model !== 'string' || !result.model.trim() || !Array.isArray(result.verdicts) || result.verdicts.length !== items.length) throw new Error('Incomplete independent verification');
    const expected = new Set(items.map(i => i.id));
    for (const row of result.verdicts) {
      if (!row || !expected.delete(row.id) || !['true', 'false', 'unsure'].includes(row.verdict) || typeof row.onTopic !== 'boolean' || typeof row.reason !== 'string' || !row.reason.trim()) throw new Error('Invalid independent verification');
      const item = items.find(i => i.id === row.id)!;
      if (item.requireEvidence && row.verdict === 'true' && row.onTopic) resolveEvidence(row.evidence, item.sources || []);
    }
  } catch (error) {
    checkAbort(options.signal);
    const failure = unavailable(error);
    progress(options, 'verifying', failure.message, { status: 'failed', verificationFailure: failure.details });
    throw failure;
  }
  const verdicts = new Map(result.verdicts.map(v => [v.id, v]));
  const checkedAt = new Date().toISOString();
  const checked = categories.map((cat, ci) => ({ ...cat, clues: cat.clues.flatMap((clue, qi) => {
    const v = verdicts.get(`${ci}:${qi}`)!;
    if (v.verdict !== 'true' || !v.onTopic) return [];
    const verification: ClueVerification = {
      model: result.model, checkedAt, reason: v.reason,
      ...(items.find(i => i.id === `${ci}:${qi}`)?.requireEvidence ? { evidence: resolveEvidence(v.evidence, documents[ci]) } : {}),
      clue: clue.clue, response: clue.response, category: cat.title,
    };
    return [{ ...clue, verification }];
  }) }));
  const rejected: VerificationFailure['clues'] = items.flatMap(item => {
    const v = verdicts.get(item.id)!;
    if (v.verdict === 'true' && v.onTopic) return [];
    const [categoryIndex, clueIndex] = item.id.split(':').map(Number);
    return [{ id: item.id, categoryIndex, clueIndex, category: item.category, clue: item.clue, response: item.response, verdict: v.verdict, onTopic: v.onTopic, reason: v.reason }];
  });
  checked.forEach((cat, i) => progress(options, 'verifying', `Checked ${cat.title}`, { categoryIndex: i, categoryTitle: cat.title, completed: i + 1, total: checked.length, status: cat.clues.length === categories[i].clues.length ? 'complete' : 'failed' }));
  return { categories: checked, audit: { ...result, items }, rejected };
}

/** Edits invalidate the displayed check without relying on every editing path. */
export function currentVerification(clue: Pick<Clue, 'clue' | 'response' | 'verification'>, category: string) {
  const v = clue.verification;
  return v && v.clue === clue.clue && v.response === clue.response && v.category === category ? v : undefined;
}
