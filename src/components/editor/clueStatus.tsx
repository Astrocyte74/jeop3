/**
 * Shared vocabulary for the "Game editor" — used by both the board editor and
 * the AI preview dialog so a clue's state reads the same in either place.
 *
 * Read-only consumer of the verification data model: the displayed check is
 * `currentVerification` (it self-invalidates when a clue is edited).
 */
import { currentVerification } from '@/lib/ai/verification';

export const EDITOR_NAME = 'Game editor';

/** The answers show/hide preference is shared by the board and the dialog. */
const ANSWERS_KEY = 'jeop3:editorShowAnswers';
export const readShowAnswers = (): boolean => {
  try { return localStorage.getItem(ANSWERS_KEY) !== '0'; } catch { return true; }
};
export const writeShowAnswers = (show: boolean) => {
  try { localStorage.setItem(ANSWERS_KEY, show ? '1' : '0'); } catch { /* storage unavailable */ }
};

export type ClueStatusKind = 'checked' | 'patched' | 'unchecked';

export interface ClueStatus {
  kind: ClueStatusKind;
  label: string;
  detail: string;
}

type StatusClue = {
  clue: string;
  response: string;
  provenance?: string;
  verification?: Parameters<typeof currentVerification>[0]['verification'];
};

export function getClueStatus(clue: StatusClue | undefined, categoryTitle: string): ClueStatus | null {
  if (!clue || !clue.clue?.trim()) return null;
  const check = currentVerification(clue, categoryTitle);
  if (check) {
    return {
      kind: 'checked',
      label: 'AI checked',
      detail: `AI review by ${check.model}: ${check.reason}. This is a model assessment, not independent proof.`,
    };
  }
  if (clue.provenance === 'fallback') {
    return {
      kind: 'patched',
      label: 'Patched',
      detail: 'Filled in from a fallback because the source was thin. Regenerate for a stronger clue.',
    };
  }
  return {
    kind: 'unchecked',
    label: 'Unverified',
    detail: 'This wording and answer have not passed the AI fact check.',
  };
}

const DOT_STYLE: Record<ClueStatusKind, string> = {
  checked: 'bg-emerald-400 shadow-[0_0_0_3px_rgba(52,211,153,0.18)]',
  patched: 'bg-amber-400 shadow-[0_0_0_3px_rgba(251,191,36,0.18)]',
  unchecked: 'border border-slate-400/70 bg-transparent',
};

export function StatusDot({ status, className = '' }: { status: ClueStatus; className?: string }) {
  return (
    <span
      role="img"
      aria-label={status.label}
      title={`${status.label}. ${status.detail}`}
      className={`inline-block size-2 shrink-0 rounded-full ${DOT_STYLE[status.kind]} ${className}`}
    />
  );
}

export interface StatusCounts {
  total: number;
  checked: number;
  patched: number;
  unchecked: number;
}

export function countStatuses(
  categories: Array<{ title: string; clues: StatusClue[] }>,
): StatusCounts {
  const counts: StatusCounts = { total: 0, checked: 0, patched: 0, unchecked: 0 };
  for (const cat of categories) {
    for (const clue of cat.clues || []) {
      const s = getClueStatus(clue, cat.title);
      if (!s) continue;
      counts.total += 1;
      counts[s.kind] += 1;
    }
  }
  return counts;
}

/** Legend row that doubles as the summary — same in the board and the dialog. */
export function StatusSummary({ counts }: { counts: StatusCounts }) {
  if (counts.total === 0) return null;
  const item = (kind: ClueStatusKind, n: number, text: string) =>
    n > 0 ? (
      <span className="inline-flex items-center gap-1.5" key={kind}>
        <StatusDot status={{ kind, label: text, detail: '' }} />
        <span className="tabular-nums text-slate-200">{n}</span> {text}
      </span>
    ) : null;
  return (
    <span className="inline-flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-400" aria-label="Clue verification summary">
      <span><span className="tabular-nums text-slate-200">{counts.total}</span> clues</span>
      {item('checked', counts.checked, 'AI checked')}
      {item('patched', counts.patched, 'patched')}
      {item('unchecked', counts.unchecked, 'unverified')}
    </span>
  );
}
