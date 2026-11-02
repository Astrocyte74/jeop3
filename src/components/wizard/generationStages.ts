/**
 * Maps the pipeline's free-text stage strings (see `onStage` in src/lib/ai/board.ts
 * and MainMenu's `setWizardStage`) onto a small ordered set of build phases.
 *
 * The pipeline does not emit structured events, so this is a text match. It is
 * deliberately forgiving: an unknown stage never moves progress backwards.
 */

export type BuildPhase = 'draft' | 'research' | 'write' | 'check' | 'finish';

export interface PhaseInfo {
  id: BuildPhase;
  label: string;
  /** Plain-language description shown under the active stage. */
  hint: string;
  /** Where this phase starts / ends on the 0..1 per-source progress bar. */
  from: number;
  to: number;
  /** Time constant (seconds) for the asymptotic "still working" creep inside the phase. */
  tau: number;
}

export const PHASES: PhaseInfo[] = [
  { id: 'draft', label: 'Choose categories', hint: 'Your category titles are locked in.', from: 0, to: 0.04, tau: 2 },
  { id: 'research', label: 'Research facts', hint: 'Pulling source material and picking specific answers.', from: 0.04, to: 0.28, tau: 9 },
  { id: 'write', label: 'Write clues', hint: 'Writing a clue for every answer on the board.', from: 0.28, to: 0.62, tau: 14 },
  { id: 'check', label: 'Check quality and facts', hint: 'Scoring clues, then fact-checking each one independently.', from: 0.62, to: 1, tau: 22 },
  { id: 'finish', label: 'Title the game', hint: 'Naming the game and suggesting team names.', from: 0, to: 1, tau: 6 },
];

export const PHASE_ORDER: BuildPhase[] = PHASES.map((p) => p.id);

export type StageSignal = BuildPhase | 'source-done';

export function phaseFromStage(stage: string | undefined | null): StageSignal {
  const s = (stage ?? '').toLowerCase();
  if (!s || s.startsWith('start')) return 'draft';
  if (s.startsWith('done')) return 'source-done';
  if (s.includes('title') || s.includes('team')) return 'finish';
  if (s.includes('fallback') || s.includes('check') || s.includes('judg') || s.includes('verif')) return 'check';
  if (s.includes('writ')) return 'write';
  if (s.includes('research') || s.includes('find') || s.includes('answer')) return 'research';
  return 'research';
}

export function phaseRank(p: BuildPhase): number {
  return PHASE_ORDER.indexOf(p);
}

/** Asymptotic progress inside a phase: approaches but never reaches `to`. */
export function creep(phase: PhaseInfo, secondsInPhase: number): number {
  const k = 1 - Math.exp(-Math.max(0, secondsInPhase) / phase.tau);
  return phase.from + (phase.to - phase.from) * 0.92 * k;
}

export function formatElapsed(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
