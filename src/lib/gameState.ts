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

export interface Comeback {
  /** The eventual winner. */
  teamId: string;
  /** Largest gap, in points, between the winner and whoever led at that moment. */
  deficit: number;
  /** The team that led when the winner was furthest behind. */
  leaderId: string;
  /** `clueId` from the log entry that left the winner furthest behind ('final' for Final Jeopardy). */
  clueId: string;
  /** 1-based position of that entry in the log. */
  step: number;
}

/**
 * The final winner's biggest deficit on the way to winning, found by replaying the log from zero.
 * Returns null whenever the honest answer is "no such stat": no log, a tie, a winner who never
 * trailed, or a replay that doesn't reproduce the saved scores (manual edits, removed teams).
 */
export function computeComeback(state: GameState): Comeback | null {
  const log = state.log;
  if (!log || log.length === 0 || state.teams.length < 2) return null;

  const scores = new Map<string, number>(state.teams.map((t) => [t.id, 0]));
  for (const r of log) {
    if (!scores.has(r.teamId)) return null;
  }

  const top = Math.max(...state.teams.map((t) => t.score));
  const winners = state.teams.filter((t) => t.score === top);
  if (winners.length !== 1) return null;
  const winnerId = winners[0].id;

  let best: Comeback | null = null;
  log.forEach((r, i) => {
    scores.set(r.teamId, (scores.get(r.teamId) ?? 0) + r.delta);
    let leaderId = '';
    let leaderScore = -Infinity;
    for (const [id, s] of scores) {
      if (id !== winnerId && s > leaderScore) {
        leaderId = id;
        leaderScore = s;
      }
    }
    const deficit = leaderScore - (scores.get(winnerId) ?? 0);
    if (deficit > 0 && (!best || deficit > best.deficit)) {
      best = { teamId: winnerId, deficit, leaderId, clueId: r.clueId, step: i + 1 };
    }
  });

  // The replay must land exactly on the saved scores, or the story it tells isn't trustworthy.
  for (const t of state.teams) {
    if (scores.get(t.id) !== t.score) return null;
  }
  return best;
}

// ---- Results export (CSV) ----

type CsvValue = string | number | boolean | null | undefined;

/**
 * One CSV cell. Text that a spreadsheet could read as a formula (leading = + - @, tab or CR)
 * gets a leading apostrophe; real numbers are written as-is so negative scores stay numeric.
 */
export function escapeCsvCell(value: CsvValue): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '';
  let s = typeof value === 'boolean' ? (value ? 'Yes' : 'No') : value;
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Safe, readable file name for the results download: "My Game!" -> "my-game-results.csv". */
export function resultsFilename(title: string): string {
  const slug = title
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/g, '');
  return `${slug || 'game'}-results.csv`;
}

export const RESULTS_CSV_HEADER = [
  'Team',
  'Final score',
  'Rank',
  'Correct',
  'Incorrect',
  'Accuracy %',
  'Points gained',
  'Points lost',
  'Daily Double hit',
  'Final wager',
  'Final result',
] as const;

/** Standings as CSV text (CRLF lines), best team first; ties share a rank (1, 1, 3). */
export function buildResultsCsv(state: GameState): string {
  const stats = new Map(computeTeamStats(state).map((s) => [s.teamId, s]));
  const sorted = state.teams
    .map((t, i) => ({ t, i }))
    .sort((a, b) => b.t.score - a.t.score || a.i - b.i);
  const rows = sorted.map(({ t }) => {
    const rank = sorted.findIndex((x) => x.t.score === t.score) + 1;
    const st = stats.get(t.id);
    const wager = state.final?.wagers[t.id];
    const finalRight = state.final?.results[t.id];
    const hasFinal = wager !== undefined && finalRight !== undefined;
    return [
      t.name,
      t.score,
      rank,
      st?.correct ?? 0,
      st?.incorrect ?? 0,
      st?.accuracy != null ? Math.round(st.accuracy * 100) : null,
      st?.pointsGained ?? 0,
      st?.pointsLost ?? 0,
      st?.dailyDoubleHit ? 'Yes' : 'No',
      hasFinal ? wager : null,
      hasFinal ? (finalRight ? 'Correct' : 'Incorrect') : '',
    ] as CsvValue[];
  });
  return [RESULTS_CSV_HEADER as readonly CsvValue[], ...rows]
    .map((r) => r.map(escapeCsvCell).join(','))
    .join('\r\n');
}

/**
 * After editing a game that is in progress, categories may have been reordered or added. Match each
 * new category to the old one it came from (most identical clue+answer pairs; ties prefer the same
 * column) and remap the column index in `used`, `dailyDoubles` and the log, so played tiles and the
 * Daily Double stay with their category. New categories start unplayed; a category that matches
 * nothing (every clue rewritten) is treated as new.
 */
export function remapStateForEditedGame(oldGame: Game, newGame: Game, state: GameState): GameState {
  const pairKey = (c: { clue: string; response: string }) => `${c.clue}\u0000${c.response}`;
  const oldSets = oldGame.categories.map((cat) => new Set(cat.clues.filter((c) => c.clue || c.response).map(pairKey)));
  const claimed = new Set<number>();
  const oldToNew = new Map<number, number>();
  newGame.categories.forEach((cat, ni) => {
    let best = -1;
    let bestScore = 0;
    oldSets.forEach((set, oi) => {
      if (claimed.has(oi)) return;
      const score = cat.clues.filter((c) => (c.clue || c.response) && set.has(pairKey(c))).length;
      if (score > bestScore || (score === bestScore && score > 0 && oi === ni)) {
        best = oi;
        bestScore = score;
      }
    });
    if (best >= 0 && bestScore > 0) {
      claimed.add(best);
      oldToNew.set(best, ni);
    }
  });
  // Identity mapping: nothing to do (the common case) — keep the same object.
  if ([...oldToNew].every(([o, n]) => o === n) && oldGame.categories.length === newGame.categories.length) return state;

  const remapId = (id: string): string | null => {
    const [ci, ri] = id.split(':');
    if (ri === undefined) return id; // e.g. "final"
    const to = oldToNew.get(Number(ci));
    return to === undefined ? null : `${to}:${ri}`;
  };
  const used: Record<string, boolean> = {};
  for (const id of Object.keys(state.used)) {
    const mapped = remapId(id);
    if (mapped) used[mapped] = true;
  }
  return {
    ...state,
    used,
    dailyDoubles: state.dailyDoubles?.map(remapId).filter((x): x is string => !!x),
    log: state.log?.map((r) => ({ ...r, clueId: remapId(r.clueId) ?? r.clueId })),
  };
}
