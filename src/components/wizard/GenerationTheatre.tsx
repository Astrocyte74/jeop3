/**
 * Live "board building" view shown while the wizard generates a game.
 *
 * Everything on screen is derived from signals the wizard already receives:
 *   - `stage`    the pipeline's current stage string ("Writing clues for locked answers…")
 *   - `progress` which source (span of columns) is being built, out of how many
 *   - elapsed time (local clock)
 * Column titles are the real draft titles the user already curated (they are passed
 * to the pipeline as fixed category titles). No clue text is ever invented here: cells
 * only light up once the pipeline has actually moved past the step that produces them.
 */

import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Check, Loader2, RefreshCw, TriangleAlert, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  PHASES,
  creep,
  formatElapsed,
  phaseFromStage,
  phaseRank,
  type BuildPhase,
} from './generationStages';

export interface TheatreColumn {
  key: string;
  /** Real draft category title, when one exists. */
  title?: string;
  /** Fallback label (source topic / hostname). */
  label: string;
  /** Index of the source (span) that generates this column. */
  sourceIndex: number;
}

interface TheatreProps {
  gameTitle: string;
  columns: TheatreColumn[];
  sourceLabels: string[];
  stage?: string;
  progress?: { sourceIndex: number; sourceTotal: number } | null;
  error?: string | null;
  summary: string;
  cancelLabel: string;
  cancelHint?: string;
  onCancel: () => void;
  onRetry: () => void;
  onBackToEdit: () => void;
}

const VALUES = [200, 400, 600, 800, 1000];

type ColMode = 'queued' | 'research' | 'write' | 'check' | 'done' | 'failed' | 'muted';

interface Track {
  /** Furthest phase reached for each source (null = not started). */
  phases: (BuildPhase | null)[];
  done: boolean[];
  active: number;
  finishing: boolean;
  enteredAt: number;
}

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

export function GenerationTheatre({
  gameTitle,
  columns,
  sourceLabels,
  stage,
  progress,
  error,
  summary,
  cancelLabel,
  cancelHint,
  onCancel,
  onRetry,
  onBackToEdit,
}: TheatreProps) {
  const failed = !!error;
  const sourceCount = Math.max(1, progress?.sourceTotal ?? sourceLabels.length ?? 1);
  const sourceIndex = Math.min(progress?.sourceIndex ?? 0, sourceCount - 1);

  const [startedAt] = useState(() => Date.now());
  const [now, setNow] = useState(() => Date.now());
  const [track, setTrack] = useState<Track>(() => ({
    phases: Array(sourceCount).fill(null),
    done: Array(sourceCount).fill(false),
    active: 0,
    finishing: false,
    enteredAt: Date.now(),
  }));

  // Fold each new stage signal into the track. Phases only ever move forward.
  useEffect(() => {
    if (failed) return;
    const signal = phaseFromStage(stage);
    setTrack((prev) => {
      const t: Track = {
        phases: [...prev.phases],
        done: [...prev.done],
        active: prev.active,
        finishing: prev.finishing,
        enteredAt: prev.enteredAt,
      };
      let moved = false;
      for (let i = 0; i < sourceIndex; i++) if (!t.done[i]) { t.done[i] = true; moved = true; }
      if (t.active !== sourceIndex) { t.active = sourceIndex; moved = true; }
      if (signal === 'finish') {
        // Ignore a stale "finish" stage left over from a previous run until the last source is reached.
        if (sourceIndex === sourceCount - 1 || !progress) {
          t.done = t.done.map(() => true);
          if (!t.finishing) { t.finishing = true; moved = true; }
        }
      } else if (signal === 'source-done') {
        // A "Done" with no earlier stage seen this run is stale state from a previous attempt.
        if (t.phases[sourceIndex] !== null && !t.done[sourceIndex]) { t.done[sourceIndex] = true; moved = true; }
      } else {
        const cur = t.phases[sourceIndex];
        if (cur === null || phaseRank(signal) > phaseRank(cur)) { t.phases[sourceIndex] = signal; moved = true; }
      }
      if (moved) t.enteredAt = Date.now();
      return moved ? t : prev;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage, sourceIndex, failed]);

  // Clock. Slower tick under reduced motion; stops on failure so elapsed freezes.
  useEffect(() => {
    if (failed) return;
    const id = window.setInterval(() => setNow(Date.now()), prefersReducedMotion() ? 1000 : 250);
    return () => window.clearInterval(id);
  }, [failed]);

  const activePhase: BuildPhase = track.finishing
    ? 'finish'
    : track.phases[track.active] ?? 'draft';
  const activeRank = phaseRank(activePhase);

  const colMode = (sourceIdx: number): ColMode => {
    if (failed) return sourceIdx === track.active ? 'failed' : 'muted';
    if (track.finishing || track.done[sourceIdx]) return 'done';
    if (sourceIdx > track.active) return 'queued';
    if (sourceIdx < track.active) return 'done';
    return activePhase === 'check' ? 'check' : activePhase === 'write' ? 'write' : 'research';
  };

  // Overall 0..1 progress. Estimate only: finished sources count in full, the active
  // source creeps toward the end of its current phase without ever reaching it.
  const secondsInPhase = (now - track.enteredAt) / 1000;
  const overall = useMemo(() => {
    const info = PHASES[activeRank];
    if (track.finishing) return 0.93 + 0.07 * (1 - Math.exp(-secondsInPhase / info.tau));
    const doneCount = track.done.filter(Boolean).length;
    const frac = track.done[track.active] ? 1 : creep(info, secondsInPhase);
    return Math.min(0.93, ((doneCount + (track.done[track.active] ? 0 : frac)) / sourceCount) * 0.93);
  }, [activeRank, secondsInPhase, track, sourceCount]);

  const elapsed = formatElapsed(((failed ? now : Date.now()) - startedAt) / 1000);
  const slow = !failed && (now - startedAt) / 1000 > 120;

  const multi = sourceCount > 1;
  const activeSourceLabel = sourceLabels[track.active] ?? '';
  const failedPhaseLabel = PHASES[activeRank]?.label ?? 'Starting';

  return (
    <div className="th-enter flex-1 min-h-0 -mx-6 px-6 py-4 grid gap-7 lg:grid-cols-[minmax(300px,380px)_minmax(0,1fr)] overflow-y-auto lg:overflow-hidden">
      <TheatreStyles />

      {/* ---------- Left: status ---------- */}
      <div className="flex flex-col min-h-0 lg:overflow-y-auto lg:pr-2 lg:-mr-2">
        <h3 className="text-xl font-semibold text-slate-100">
          {failed ? 'The build stopped' : 'Building your board'}
        </h3>
        <p className="text-sm text-slate-500 mt-1">{summary}</p>

        <div className="mt-5 flex items-baseline gap-3">
          <span
            className={`font-board text-6xl leading-none tabular-nums ${failed ? 'text-slate-500' : 'text-yellow-400'}`}
            role="timer"
            aria-label={`Elapsed time ${elapsed}`}
          >
            {elapsed}
          </span>
          <span className="text-xs text-slate-500">
            {failed ? 'when it stopped' : slow ? 'longer than usual, still working' : 'usually 30–90 seconds'}
          </span>
        </div>

        <div
          className="mt-4 h-1.5 rounded-full bg-slate-800 overflow-hidden"
          role="progressbar"
          aria-label="Estimated build progress"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(overall * 100)}
        >
          <div
            className={`th-t h-full rounded-full ${failed ? 'bg-red-500/70' : 'bg-gradient-to-r from-yellow-500 to-yellow-300'}`}
            style={{ width: `${Math.max(3, overall * 100)}%`, transition: 'width 700ms ease-out' }}
          />
        </div>

        {multi && (
          <p className="mt-4 text-sm text-slate-300">
            <span className="font-semibold text-slate-100">
              Source {Math.min(track.active + 1, sourceCount)} of {sourceCount}
            </span>
            {activeSourceLabel && <span className="text-slate-500"> · {activeSourceLabel}</span>}
          </p>
        )}

        {/* Stage list */}
        <ol className="mt-5 relative" aria-label="Build stages">
          {PHASES.map((p, i) => {
            const isLast = i === PHASES.length - 1;
            const doneNow = i < activeRank;
            const isActive = !failed && i === activeRank;
            const isFailed = failed && i === activeRank;
            return (
              <li key={p.id} className="relative flex gap-3 pb-4 last:pb-0">
                {!isLast && (
                  <span
                    aria-hidden
                    className={`absolute left-[11px] top-6 bottom-0 w-px ${doneNow ? 'bg-yellow-500/40' : 'bg-slate-800'}`}
                  />
                )}
                <span className="relative z-10 flex-shrink-0 w-6 h-6 flex items-center justify-center rounded-full bg-slate-950">
                  {isFailed ? (
                    <X className="w-4 h-4 text-red-400" />
                  ) : doneNow ? (
                    <span className="w-5 h-5 rounded-full bg-emerald-500/15 flex items-center justify-center">
                      <Check className="w-3 h-3 text-emerald-400" />
                    </span>
                  ) : isActive ? (
                    <Loader2 className="w-4 h-4 text-yellow-400 th-spin" />
                  ) : (
                    <span className="w-2 h-2 rounded-full bg-slate-700" />
                  )}
                </span>
                <div className="min-w-0 pt-px">
                  <div
                    className={`text-sm leading-6 ${
                      isFailed ? 'text-red-300 font-medium' : isActive ? 'text-slate-100 font-medium' : doneNow ? 'text-slate-400' : 'text-slate-600'
                    }`}
                  >
                    {p.label}
                  </div>
                  {(isActive || isFailed) && (
                    <div className="th-enter-fast text-xs text-slate-500 leading-snug mt-0.5">
                      {isFailed ? (stage && !/^done/i.test(stage) ? `Stopped during: ${stage}` : 'The build stopped at this step.') : p.hint}
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ol>

        {/* Failure details */}
        {failed && (
          <div role="alert" className="th-enter-fast mt-5 rounded-xl border border-red-500/30 bg-red-500/10 p-3.5">
            <div className="flex items-start gap-2.5">
              <TriangleAlert className="w-4 h-4 text-red-400 mt-0.5 flex-shrink-0" />
              <p className="text-sm text-red-200/90 leading-snug break-words max-h-40 overflow-y-auto">{error}</p>
            </div>
            <p className="text-xs text-slate-500 mt-2.5 leading-snug">
              Nothing was saved. Your topics, theme and difficulty are still set, so you can retry as is or edit them first.
            </p>
          </div>
        )}

        <div className="flex-1 min-h-4" />

        {/* Actions */}
        <div className="mt-6 flex items-center gap-2 flex-wrap">
          {failed ? (
            <>
              <Button
                type="button"
                onClick={onRetry}
                className="h-11 px-5 bg-yellow-400 hover:bg-yellow-300 text-slate-950 font-semibold shadow-lg shadow-yellow-500/20"
              >
                <RefreshCw className="w-4 h-4 mr-2" />
                Try again
              </Button>
              <Button type="button" variant="ghost" onClick={onBackToEdit} className="text-slate-300 hover:text-slate-100">
                <ArrowLeft className="w-4 h-4 mr-1.5" />
                Back to editing
              </Button>
            </>
          ) : (
            <Button
              type="button"
              variant="outline"
              onClick={onCancel}
              className="border-slate-700 text-slate-300 hover:text-slate-100"
            >
              {cancelLabel}
            </Button>
          )}
        </div>
        {!failed && cancelHint && <p className="text-xs text-slate-600 mt-2.5 leading-snug">{cancelHint}</p>}
      </div>

      {/* ---------- Right: the board assembling ---------- */}
      <div className="relative min-h-[420px] lg:min-h-0 overflow-hidden rounded-2xl border border-slate-800 bg-slate-950/80 px-6 py-6 flex flex-col items-center justify-center">
        <div
          aria-hidden
          className="absolute inset-0 pointer-events-none bg-[radial-gradient(640px_320px_at_50%_-10%,rgba(37,58,220,0.28),transparent_65%),radial-gradient(400px_260px_at_90%_110%,rgba(250,204,21,0.05),transparent_60%)]"
        />
        <h2 className="relative font-board text-3xl xl:text-4xl uppercase tracking-wide text-yellow-400 text-center [text-shadow:0_2px_10px_rgba(0,0,0,0.65)] max-w-full truncate">
          {gameTitle}
        </h2>

        <div
          className="relative mt-6 flex gap-1.5 w-full"
          style={{ maxWidth: Math.max(1, columns.length) * 190 + (columns.length - 1) * 6 }}
          aria-hidden
        >
          {columns.map((col, ci) => (
            <TheatreColumnView key={col.key} col={col} index={ci} mode={colMode(col.sourceIndex)} />
          ))}
        </div>

        <div className="relative mt-7 h-12 flex flex-col items-center justify-center text-center" aria-live="polite">
          {failed ? (
            <p className="text-sm text-red-300/90">Stopped at “{failedPhaseLabel.toLowerCase()}”</p>
          ) : (
            <>
              <p className="flex items-center gap-2 text-sm text-slate-200">
                <span className="th-pulse w-1.5 h-1.5 rounded-full bg-yellow-400" />
                {stage || 'Starting…'}
              </p>
              <p className="text-xs text-slate-600 mt-1">
                Cells light up as each step finishes. Nothing here is a preview of clue text.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function TheatreColumnView({ col, index, mode }: { col: TheatreColumn; index: number; mode: ColMode }) {
  const headLit = mode !== 'queued' && mode !== 'muted';
  const written = mode === 'check' || mode === 'done';
  const delay = (row: number) => `${index * 90 + row * 110}ms`;

  const headCls =
    mode === 'failed'
      ? 'bg-gradient-to-b from-red-900/70 to-red-950/80 border border-red-500/40'
      : headLit
        ? 'bg-gradient-to-b from-[#13289f] to-[#0c1b74] border border-white/10 shadow-[inset_0_0_0_1px_rgba(0,0,30,0.4)]'
        : 'bg-gradient-to-b from-[#13289f]/35 to-[#0c1b74]/35 border border-blue-500/15';

  return (
    <div className="flex-1 min-w-0 flex flex-col gap-1.5">
      <div
        className={`th-t relative h-[96px] rounded-md flex items-center justify-center text-center px-2 ${headCls} ${
          mode === 'research' ? 'th-head-working' : ''
        }`}
        style={{ transitionDelay: delay(0), transitionDuration: '500ms' }}
      >
        <span
          className={`font-board uppercase leading-tight tracking-wide text-sm line-clamp-3 break-words [text-shadow:0_1px_3px_rgba(0,0,0,0.7)] ${
            headLit ? 'text-white' : 'text-blue-200/40'
          }`}
        >
          {col.title ?? col.label}
        </span>
        {mode === 'done' && (
          <span className="th-pop absolute top-1 right-1 w-4 h-4 rounded-full bg-emerald-500/90 flex items-center justify-center">
            <Check className="w-2.5 h-2.5 text-emerald-950" strokeWidth={3} />
          </span>
        )}
      </div>

      {VALUES.map((v, row) => {
        const cls =
          mode === 'failed'
            ? 'bg-red-950/40 border border-red-500/20'
            : mode === 'muted'
              ? 'bg-slate-900/30 border border-slate-800/60'
              : written
                ? 'bg-gradient-to-b from-[#13289f] to-[#0c1b74] border border-white/10'
                : mode === 'write'
                  ? 'bg-gradient-to-b from-[#13289f]/55 to-[#0c1b74]/55 border border-blue-500/25'
                  : mode === 'research'
                    ? 'border border-dashed border-blue-400/25 bg-blue-950/20'
                    : 'border border-slate-800/70 bg-slate-900/20';
        const fx = mode === 'write' ? 'th-cell-write' : mode === 'check' ? 'th-cell-verify' : '';
        return (
          <div
            key={v}
            className={`th-t relative h-[62px] rounded-md flex items-center justify-center overflow-hidden ${cls} ${fx}`}
            style={{ transitionDelay: delay(row + 1), transitionDuration: '500ms', ['--d' as string]: delay(row) }}
          >
            <span
              className={`th-t relative font-board tracking-wide text-[26px] [text-shadow:0_2px_0_rgba(0,0,0,0.55)] ${
                written ? 'text-yellow-400' : mode === 'write' ? 'text-yellow-400/45' : mode === 'research' ? 'text-yellow-400/15' : mode === 'failed' ? 'text-red-300/30' : 'text-slate-800'
              }`}
              style={{ transitionDelay: delay(row + 1), transitionDuration: '500ms' }}
            >
              ${v}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/** Scoped keyframes. Motion is dropped entirely under prefers-reduced-motion. */
function TheatreStyles() {
  return (
    <style>{`
      @keyframes th-enter { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
      @keyframes th-write { 0%, 100% { opacity: .15; } 50% { opacity: 1; } }
      @keyframes th-verify { 0% { background-position: 160% 0; } 100% { background-position: -60% 0; } }
      @keyframes th-head { 0%, 100% { filter: brightness(1); } 50% { filter: brightness(1.35); } }
      @keyframes th-pop { 0% { transform: scale(0); } 70% { transform: scale(1.25); } 100% { transform: scale(1); } }
      @keyframes th-spin { to { transform: rotate(360deg); } }
      @keyframes th-pulse { 0%, 100% { opacity: .35; } 50% { opacity: 1; } }
      .th-enter { animation: th-enter 320ms cubic-bezier(.2,.7,.2,1) both; }
      .th-enter-fast { animation: th-enter 220ms ease-out both; }
      .th-spin { animation: th-spin 1s linear infinite; }
      .th-pulse { animation: th-pulse 1.4s ease-in-out infinite; }
      .th-pop { animation: th-pop 360ms ease-out both; }
      .th-head-working { animation: th-head 1.8s ease-in-out infinite; }
      .th-cell-write::after {
        content: ''; position: absolute; inset: 0; border-radius: inherit; pointer-events: none;
        background: rgba(250, 204, 21, .2);
        animation: th-write 1.7s ease-in-out infinite; animation-delay: var(--d, 0ms);
      }
      .th-cell-verify::after {
        content: ''; position: absolute; inset: 0; border-radius: inherit; pointer-events: none;
        background: linear-gradient(100deg, transparent 35%, rgba(255,255,255,.26) 50%, transparent 65%);
        background-size: 260% 100%;
        animation: th-verify 2.4s ease-in-out infinite; animation-delay: var(--d, 0ms);
      }
      @media (prefers-reduced-motion: reduce) {
        .th-enter, .th-enter-fast, .th-pop, .th-head-working, .th-pulse { animation: none; }
        .th-spin { animation-duration: 3s; }
        .th-cell-write::after { animation: none; opacity: .6; }
        .th-cell-verify::after { animation: none; background: none; }
        .th-t { transition: none !important; }
      }
    `}</style>
  );
}
