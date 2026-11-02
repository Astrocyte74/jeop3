// Pure game-state helpers: initial state, Daily Double placement, scoring, stats.
// Kept free of React so it is easy to unit test.
import type { ClueResult, Game, GameState, Team } from './storage';

export const MIN_WAGER = 5;

export function clueKey(categoryIndex: number, clueIndex: number): string {
  return `${categoryIndex}:${clueIndex}`;
}

/** Highest clue value on the board (used to cap Daily Double wagers). */
export function boardMaxValue(game: Game): number {
  let max = 0;
  for (const cat of game.categories) for (const c of cat.clues) max = Math.max(max, c.value || 0);
  return max;
}

/**
 * Daily Double positions for a fresh play-through. Author-pinned clues win;
 * otherwise 1 random clue (2 on large boards) from the lower rows, never the top row.
 */
export function pickDailyDoubles(game: Game, rand: () => number = Math.random): string[] {
  const pinned: string[] = [];
  const candidates: string[] = [];
  game.categories.forEach((cat, ci) =>
    cat.clues.forEach((clue, ri) => {
      if (clue.dailyDouble) pinned.push(clueKey(ci, ri));
      if (ri >= 1 && clue.clue.trim() && clue.response.trim()) candidates.push(clueKey(ci, ri));
    }),
  );
  if (pinned.length > 0) return pinned;
  const total = game.categories.reduce((n, c) => n + c.clues.length, 0);
  const want = total >= 40 ? 2 : 1;
  const picked: string[] = [];
  const pool = [...candidates];
  while (picked.length < want && pool.length > 0) {
    const i = Math.floor(rand() * pool.length);
    picked.push(pool.splice(i, 1)[0]);
  }
  return picked;
}

export function createInitialState(game: Game, teams: Team[], rand?: () => number): GameState {
  return {
    used: {},
    teams,
    activeTeamId: teams[0]?.id ?? '1',
    currentRound: 1,
    dailyDoubles: pickDailyDoubles(game, rand),
    log: [],
  };
}

/** Wager ceiling for a Daily Double: the team's score, or the top board value if higher. */
export function maxDailyDoubleWager(teamScore: number, game: Game): number {
  return Math.max(teamScore, boardMaxValue(game), MIN_WAGER);
}

/** Mark a clue used and apply a score change for one team. `amount` is the points at stake. */
export function applyClueResult(
  state: GameState,
  args: { clueId: string; teamId: string; correct: boolean; amount: number; dailyDouble?: boolean },
): GameState {
  const delta = args.correct ? args.amount : -args.amount;
  const entry: ClueResult = {
    clueId: args.clueId,
    teamId: args.teamId,
    correct: args.correct,
    delta,
    ...(args.dailyDouble ? { dailyDouble: true } : {}),
  };
  return {
    ...state,
    used: { ...state.used, [args.clueId]: true },
    teams: state.teams.map((t) => (t.id === args.teamId ? { ...t, score: t.score + delta } : t)),
    log: [...(state.log ?? []), entry],
  };
}

/** Close a clue as used without scoring or logging anyone ("nobody got it"). */
export function markClueUsed(state: GameState, clueId: string): GameState {
  return { ...state, used: { ...state.used, [clueId]: true } };
}

export interface FinalOutcome {
  teamId: string;
  wager: number;
  correct: boolean;
}

export function applyFinalResults(state: GameState, outcomes: FinalOutcome[]): GameState {
  const wagers: Record<string, number> = {};
  const results: Record<string, boolean> = {};
  const entries: ClueResult[] = [];
  let teams = state.teams;
  for (const o of outcomes) {
    wagers[o.teamId] = o.wager;
    results[o.teamId] = o.correct;
    const delta = o.correct ? o.wager : -o.wager;
    teams = teams.map((t) => (t.id === o.teamId ? { ...t, score: t.score + delta } : t));
    entries.push({ clueId: 'final', teamId: o.teamId, correct: o.correct, delta });
  }
  return { ...state, teams, log: [...(state.log ?? []), ...entries], final: { done: true, wagers, results } };
}

export interface TeamStats {
  teamId: string;
  correct: number;
  incorrect: number;
  /** correct / (correct + incorrect), or null if the team never answered */
  accuracy: number | null;
  pointsGained: number;
  pointsLost: number;
  dailyDoubleHit?: boolean;
}

/** Per-team stats derived from the log. Older saves with no log yield all-zero rows. */
export function computeTeamStats(state: GameState): TeamStats[] {
  return state.teams.map((team) => {
    const mine = (state.log ?? []).filter((r) => r.teamId === team.id);
    const correct = mine.filter((r) => r.correct).length;
    const incorrect = mine.length - correct;
    return {
      teamId: team.id,
      correct,
      incorrect,
      accuracy: mine.length ? correct / mine.length : null,
      pointsGained: mine.filter((r) => r.delta > 0).reduce((n, r) => n + r.delta, 0),
      pointsLost: mine.filter((r) => r.delta < 0).reduce((n, r) => n - r.delta, 0),
      dailyDoubleHit: mine.some((r) => r.dailyDouble && r.correct) || undefined,
    };
  });
}
