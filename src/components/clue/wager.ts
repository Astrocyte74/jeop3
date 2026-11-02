import { MIN_WAGER } from '@/lib/gameState';

/**
 * Wager ceiling: the team's score, or the top clue on the board if that is higher.
 * Mirrors gameState.maxDailyDoubleWager, which needs the whole Game.
 */
export function wagerCap(teamScore: number, boardMaxValue = 0): number {
  return Math.max(teamScore, boardMaxValue, MIN_WAGER);
}

/** Whole-dollar wager from the input text, or null if it is empty or not a number. */
export function parseWager(text: string): number | null {
  return /^\d+$/.test(text) ? Number(text) : null;
}

export function isLegalWager(n: number | null, cap: number): n is number {
  return n !== null && n >= MIN_WAGER && n <= cap;
}

/** Half the ceiling, rounded to a tidy multiple of $5 and kept in range. */
export function halfWager(cap: number): number {
  const half = Math.round(cap / 2 / 5) * 5;
  return Math.min(cap, Math.max(MIN_WAGER, half));
}
