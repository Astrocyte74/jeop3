/**
 * Folds the pipeline's progress events into what the build screen shows about research:
 * which sources were found, any warnings, the source policy, and targeted repairs.
 *
 * A repair is the pipeline's one retry for a deficient category: accepted clues keep their values and
 * stay checked, and only the missing ones get new research, writing and independent checking. Those
 * events carry `attempt: 1` and the original category title, so they are tracked per category.
 * Pure and immutable so it can be unit-tested without React.
 */
import type { GenerationProgress, SourceDocument, SourcePolicy } from '@/lib/ai/types';

export type ResearchSource = Omit<SourceDocument, 'text'> & { category?: string };

export type RepairPhase = 'researching' | 'writing' | 'checking' | 'checked' | 'failed';

export interface RepairState {
  title: string;
  /** How many clues are being replaced (the rest were already accepted and stay checked). */
  missing: number;
  phase: RepairPhase;
}

export interface ResearchAcc {
  /** Last event folded in; lets the caller fold each event exactly once while rendering. */
  last: GenerationProgress | null;
  sources: ResearchSource[];
  warnings: string[];
  policy?: SourcePolicy;
  repairs: Record<string, RepairState>;
}

export const EMPTY_RESEARCH: ResearchAcc = { last: null, sources: [], warnings: [], repairs: {} };

export function repairPhaseOf(e: GenerationProgress): RepairPhase {
  if (e.status === 'failed') return 'failed';
  if (e.stage === 'verifying') return e.status === 'complete' ? 'checked' : 'checking';
  if (e.stage === 'retrieval' || e.stage === 'facts' || e.stage === 'categories') return 'researching';
  return 'writing';
}

export function foldProgress(acc: ResearchAcc, e: GenerationProgress): ResearchAcc {
  if (acc.last === e) return acc;
  let sources = acc.sources;
  if (e.sources?.length) {
    const byId = new Map(sources.map(s => [s.id, s]));
    for (const s of e.sources) if (!byId.has(s.id)) byId.set(s.id, { ...s, category: e.categoryTitle });
    sources = Array.from(byId.values());
  }
  let warnings = acc.warnings;
  if (e.warnings?.length) {
    const fresh = e.warnings.filter(w => w && !warnings.includes(w));
    if (fresh.length) warnings = [...warnings, ...fresh];
  }
  let repairs = acc.repairs;
  if (e.attempt && e.attempt > 0) {
    const key = e.categoryTitle ?? (e.categoryIndex !== undefined ? `#${e.categoryIndex}` : 'category');
    const prev = repairs[key];
    repairs = {
      ...repairs,
      [key]: {
        title: e.categoryTitle ?? prev?.title ?? 'a category',
        missing: e.missing ?? prev?.missing ?? 0,
        phase: repairPhaseOf(e),
      },
    };
  }
  return { last: e, sources, warnings, policy: e.sourcePolicy ?? acc.policy, repairs };
}

export function repairPhaseText(phase: RepairPhase): string {
  switch (phase) {
    case 'researching': return 'Finding more sources…';
    case 'writing': return 'Writing replacements…';
    case 'checking': return 'Checking replacements independently…';
    case 'checked': return 'Replacements checked';
    case 'failed': return 'Replacements did not all pass';
  }
}

/**
 * Backend warnings can carry raw network errors ("host: getaddrinfo ENOTFOUND host"). Say what it means
 * for the user instead; the original text stays available as a tooltip.
 */
export function friendlyWarning(w: string): string {
  const networky = /ENOTFOUND|EAI_AGAIN|ECONN\w*|ETIMEDOUT|EHOSTUNREACH|getaddrinfo|fetch failed|timed? ?out|HTTP [45]\d\d|status [45]\d\d/i;
  if (!networky.test(w)) return w;
  const host = /^\s*([a-z0-9-]+(?:\.[a-z0-9-]+)+)\s*:/i.exec(w)?.[1];
  return `A source page${host ? ` (${host})` : ''} couldn’t be reached and was skipped.`;
}
