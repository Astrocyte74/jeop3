import { BookOpen, ExternalLink, FileText, Globe, Sparkles, Church } from 'lucide-react';
import type { Clue } from '@/lib/ai/types';
import {
  categorySourceBadge, currentEvidence, evidenceState, formatRetrieved, hostOf, safeHref, sourceLabelOf,
  type LooseCategory, type SourceTone,
} from './sourceInfo';

const TONE_CLASS: Record<SourceTone, string> = {
  official: 'border-sky-500/40 bg-sky-500/10 text-sky-300 hover:bg-sky-500/20',
  wiki: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20',
  web: 'border-cyan-500/40 bg-cyan-500/10 text-cyan-300 hover:bg-cyan-500/20',
  user: 'border-violet-500/40 bg-violet-500/10 text-violet-300 hover:bg-violet-500/20',
  neutral: 'border-slate-500/40 bg-slate-500/10 text-slate-300 hover:bg-slate-500/20',
  warning: 'border-amber-500/40 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20',
};

function ToneIcon({ tone, className = 'w-3 h-3' }: { tone: SourceTone; className?: string }) {
  if (tone === 'official') return <Church className={className} />;
  if (tone === 'wiki') return <BookOpen className={className} />;
  if (tone === 'web') return <Globe className={className} />;
  if (tone === 'user') return <FileText className={className} />;
  if (tone === 'warning') return <Sparkles className={className} />;
  return <BookOpen className={className} />;
}

/**
 * Where a category's facts came from, named truthfully: Wikipedia, Web, Church sources or the user's
 * own material. Replaces the old Wikipedia-only chip.
 */
export function CategorySourceChip({ category, onDark = false }: { category: LooseCategory; onDark?: boolean }) {
  const badge = categorySourceBadge(category);
  if (!badge) return null;
  const base = 'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium';
  const cls = onDark && badge.tone !== 'warning' ? 'border-white/25 bg-black/20 text-white/80 hover:bg-black/30' : TONE_CLASS[badge.tone];
  const inner = <><ToneIcon tone={badge.tone} />{badge.label}</>;
  return badge.href
    ? <a href={badge.href} target="_blank" rel="noopener noreferrer" title={badge.title} className={`${base} ${cls}`}>{inner}</a>
    : <span title={badge.title} className={`${base} ${cls}`}>{inner}</span>;
}

/**
 * The exact passages the independent check relied on for one clue. Only shown while the check is
 * current: editing the clue, answer or category invalidates the check and its evidence together.
 * Older saves have a check but no recorded quotes; that is said plainly rather than left blank.
 */
export function ClueSources({ clue, category, defaultOpen = false }: {
  clue: Pick<Clue, 'clue' | 'response' | 'verification'>;
  category: string;
  defaultOpen?: boolean;
}) {
  const state = evidenceState(clue, category);
  if (state === 'never-checked') return null;
  if (state === 'edited-since-check') {
    return (
      <p className="text-[11px] leading-snug text-amber-300/90" data-testid="sources-stale">
        Sources hidden: the clue, answer or category changed after the fact check, so its quotes no longer apply.
      </p>
    );
  }
  if (state === 'no-evidence-recorded') {
    return (
      <p className="text-[11px] leading-snug text-slate-400" data-testid="sources-missing">
        Checked before source quotes were recorded. Regenerate this clue to get quoted sources.
      </p>
    );
  }
  const evidence = currentEvidence(clue, category);
  const labels = Array.from(new Set(evidence.map(e => sourceLabelOf(e))));
  return (
    <details open={defaultOpen} className="group rounded-lg border border-slate-700/60 bg-slate-900/40" data-testid="clue-sources">
      <summary className="cursor-pointer select-none px-2.5 py-1.5 text-[11px] font-semibold text-slate-300">
        Sources · {evidence.length} {evidence.length === 1 ? 'quote' : 'quotes'} · {labels.join(' + ')}
      </summary>
      <ul className="space-y-2 px-2.5 pb-2.5">
        {evidence.map((e, i) => {
          const label = sourceLabelOf(e);
          const href = safeHref(e.url);
          const when = formatRetrieved(e.retrievedAt);
          return (
            <li key={`${e.sourceId}-${i}`} className="text-xs leading-snug">
              <blockquote className="border-l-2 border-slate-600 pl-2.5 text-slate-200">“{e.quote}”</blockquote>
              <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-slate-400">
                <span className="rounded bg-slate-700/60 px-1.5 py-px text-[10px] font-bold uppercase tracking-wide text-slate-300">{label}</span>
                {href
                  ? <a href={href} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-sky-300 hover:underline">
                      {e.title || hostOf(e.url)} <ExternalLink className="w-3 h-3" aria-hidden="true" />
                    </a>
                  : <span className="text-slate-300">{e.title}{label === 'Your material' ? ' · no link (supplied text)' : ''}</span>}
                {when && <span>{label === 'Your material' ? 'supplied' : 'retrieved'} {when}</span>}
              </p>
            </li>
          );
        })}
      </ul>
    </details>
  );
}
