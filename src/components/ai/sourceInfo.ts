/**
 * Plain-language source labels for generated categories and clues.
 *
 * `sourceType: 'retrieved'` no longer means "Wikipedia": it covers Wikipedia, other web pages and
 * official Church pages. Labels therefore come from what is actually known, in this order:
 *   1. per-clue `verification.evidence` (persisted with the game, only while the check is current),
 *   2. the category's `sources` / `sourcePolicy` (present on fresh pipeline output, not always saved),
 *   3. the legacy `sourceUrl` host (older saves, which were Wikipedia-only retrievals).
 * Nothing here is invented: with no information the label stays neutral ("Retrieved sources").
 */
import type { ClueEvidence, SourceDocument, SourcePolicy } from '@/lib/ai/types';
import { currentVerification } from '@/lib/ai/verification';

export type SourceLabel = 'Church sources' | 'Wikipedia' | 'Web' | 'Your material' | 'Retrieved sources' | 'AI fact-sheet';
export type SourceTone = 'official' | 'wiki' | 'web' | 'user' | 'neutral' | 'warning';

export interface SourceBadge {
  /** Short chip text, e.g. "Wikipedia + Web". */
  label: string;
  tone: SourceTone;
  /** Tooltip: what this means and which sources are behind it. */
  title: string;
  /** Single https source this category can link to, when there is exactly one. */
  href?: string;
}

type LooseSource = { kind?: SourceDocument['kind']; url?: string; title?: string };
type LooseClue = { clue: string; response: string; verification?: Parameters<typeof currentVerification>[0]['verification'] };
export interface LooseCategory {
  title: string;
  clues: LooseClue[];
  sourceType?: 'retrieved' | 'ai_synthesized';
  sourceUrl?: string;
  sourceMaterial?: string;
  sourcePolicy?: SourcePolicy;
  sources?: LooseSource[];
}

/** Only ever link to http(s); stored data is untrusted input. */
export function safeHref(url?: string): string | undefined {
  if (!url) return undefined;
  try {
    const u = new URL(url);
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.href : undefined;
  } catch {
    return undefined;
  }
}

export function hostOf(url?: string): string | undefined {
  const href = safeHref(url);
  if (!href) return undefined;
  try { return new URL(href).hostname.toLowerCase(); } catch { return undefined; }
}

export function isChurchUrl(url?: string): boolean {
  const h = hostOf(url);
  return !!h && (h === 'churchofjesuschrist.org' || h.endsWith('.churchofjesuschrist.org'));
}

/** Label for one source: official Church pages are named as such rather than "Web". */
export function sourceLabelOf(s: LooseSource): Exclude<SourceLabel, 'Retrieved sources' | 'AI fact-sheet'> {
  if (s.kind === 'user') return 'Your material';
  if (isChurchUrl(s.url)) return 'Church sources';
  if (s.kind === 'wikipedia' || hostOf(s.url)?.endsWith('wikipedia.org')) return 'Wikipedia';
  return 'Web';
}

const TONE: Record<SourceLabel, SourceTone> = {
  'Church sources': 'official',
  Wikipedia: 'wiki',
  Web: 'web',
  'Your material': 'user',
  'Retrieved sources': 'neutral',
  'AI fact-sheet': 'warning',
};
const ORDER: SourceLabel[] = ['Church sources', 'Wikipedia', 'Web', 'Your material'];

/** Evidence that still applies: wording, answer or category edits invalidate it with the check. */
export function currentEvidence(clue: LooseClue, category: string): ClueEvidence[] {
  return currentVerification(clue, category)?.evidence ?? [];
}

/** Why a clue shows no sources, so older saves and edited clues are explained rather than blank. */
export type EvidenceState = 'has-evidence' | 'no-evidence-recorded' | 'edited-since-check' | 'never-checked';
export function evidenceState(clue: LooseClue, category: string): EvidenceState {
  if (!clue.verification) return 'never-checked';
  const current = currentVerification(clue, category);
  if (!current) return 'edited-since-check';
  return current.evidence?.length ? 'has-evidence' : 'no-evidence-recorded';
}

export function categorySourceBadge(cat: LooseCategory): SourceBadge | null {
  if (cat.sourceType === 'ai_synthesized') {
    return {
      label: 'AI fact-sheet', tone: 'warning',
      title: 'No retrieved source: the AI wrote its own fact sheet for this category. Double-check the facts before play.',
    };
  }

  const found: LooseSource[] = [];
  const titles: string[] = [];
  const remember = (s: LooseSource) => {
    found.push(s);
    if (s.title && !titles.includes(s.title)) titles.push(s.title);
  };
  cat.clues.forEach(c => currentEvidence(c, cat.title).forEach(remember));
  if (!found.length) (cat.sources ?? []).forEach(remember);

  const labels = new Set<SourceLabel>(found.map(sourceLabelOf));
  // Policy is authoritative for the wording of official-only research, even without stored sources.
  if (cat.sourcePolicy === 'lds-official') { labels.clear(); labels.add('Church sources'); }

  if (!labels.size) {
    if (cat.sourceType === 'retrieved') {
      const legacy = sourceLabelOf({ url: cat.sourceUrl, kind: cat.sourceUrl ? 'web' : undefined });
      if (cat.sourceUrl) {
        return { label: legacy, tone: TONE[legacy], title: `Retrieved from ${hostOf(cat.sourceUrl) ?? 'the web'}.`, href: safeHref(cat.sourceUrl) };
      }
      return {
        label: 'Retrieved sources', tone: 'neutral',
        title: 'Text was retrieved for this category. Older saves did not keep which sources; checked clues list theirs.',
      };
    }
    if (cat.sourceMaterial || cat.sourceUrl) {
      const l = cat.sourceUrl ? sourceLabelOf({ url: cat.sourceUrl, kind: 'web' }) : 'Your material';
      return { label: l, tone: TONE[l], title: cat.sourceUrl ? `From ${hostOf(cat.sourceUrl) ?? 'a web page'}.` : 'Written from the material you supplied.', href: safeHref(cat.sourceUrl) };
    }
    return null;
  }

  const ordered = ORDER.filter(l => labels.has(l as SourceLabel)) as SourceLabel[];
  const urls = Array.from(new Set(found.map(f => safeHref(f.url)).filter((u): u is string => !!u)));
  const detail = titles.length ? ` Sources: ${titles.slice(0, 4).join('; ')}${titles.length > 4 ? '…' : ''}.` : '';
  const policy = cat.sourcePolicy === 'lds-official' ? ' Official-source mode: only churchofjesuschrist.org was used.' : '';
  const supplied = ordered.includes('Your material') ? ' No outside search was done for supplied material.' : '';
  return {
    label: ordered.join(' + '),
    tone: ordered.length === 1 ? TONE[ordered[0]] : 'neutral',
    title: `Sources behind this category's checked clues.${detail}${policy}${supplied}`,
    href: urls.length === 1 ? urls[0] : undefined,
  };
}

/** Counts per label across a board, for the preview summary. */
export function summarizeBoardSources(categories: LooseCategory[]): {
  groups: Array<{ label: string; tone: SourceTone; count: number }>;
  synthesized: number;
  checkedClues: number;
  clueTotal: number;
  withQuotes: number;
} {
  const map = new Map<string, { label: string; tone: SourceTone; count: number }>();
  let synthesized = 0, checkedClues = 0, clueTotal = 0, withQuotes = 0;
  for (const cat of categories) {
    const badge = categorySourceBadge(cat);
    if (badge) {
      if (badge.tone === 'warning') synthesized++;
      const g = map.get(badge.label) ?? { label: badge.label, tone: badge.tone, count: 0 };
      g.count++;
      map.set(badge.label, g);
    }
    for (const c of cat.clues) {
      clueTotal++;
      if (currentVerification(c, cat.title)) checkedClues++;
      if (currentEvidence(c, cat.title).length) withQuotes++;
    }
  }
  return { groups: Array.from(map.values()), synthesized, checkedClues, clueTotal, withQuotes };
}

export function formatRetrieved(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}
