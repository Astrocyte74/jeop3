// Table rules the facilitator can flip per session. Stored in localStorage (global, not per game)
// so they apply to every board and need no change to the saved game format.
import { useSyncExternalStore } from 'react';
import type { Team } from './storage';

export type TurnMode = 'rotate' | 'winner';

export interface GameRules {
  /** rotate: the pick passes to the next team after every clue (good for a class).
   *  winner: whoever answers correctly picks next (classic TV rules). */
  turnMode: TurnMode;
  /** When off, a wrong answer costs nothing (Daily Double wagers still lose). */
  wrongAnswerPenalty: boolean;
  /** When off, a miss by the picking team ends the clue; other teams don't get a steal. */
  allowSteal: boolean;
}

export const DEFAULT_RULES: GameRules = { turnMode: 'rotate', wrongAnswerPenalty: true, allowSteal: true };

const KEY = 'jeop3:gameRules:v1';

function load(): GameRules {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (raw && typeof raw === 'object') {
      return {
        turnMode: raw.turnMode === 'winner' ? 'winner' : 'rotate',
        wrongAnswerPenalty: raw.wrongAnswerPenalty === false ? false : true,
        allowSteal: raw.allowSteal === false ? false : true,
      };
    }
  } catch {
    /* storage unavailable or corrupt: use defaults */
  }
  return DEFAULT_RULES;
}

let current: GameRules | null = null;
const listeners = new Set<() => void>();

let storageHooked = false;

export function getGameRules(): GameRules {
  if (!current) current = load();
  if (!storageHooked && typeof window !== 'undefined') {
    // Stay current with changes made in another tab, even while no component is subscribed.
    storageHooked = true;
    window.addEventListener('storage', (e) => {
      if (e.key === KEY) {
        current = load();
        listeners.forEach((l) => l());
      }
    });
  }
  return current;
}

export function setGameRules(patch: Partial<GameRules>): void {
  current = { ...getGameRules(), ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(current));
  } catch {
    /* in-memory only */
  }
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useGameRules(): GameRules {
  return useSyncExternalStore(subscribe, getGameRules, () => DEFAULT_RULES);
}

/** The team after `teamId` in board order (wraps). Null when there are no teams. */
export function nextTeamId(teams: Team[], teamId: string): string | null {
  if (teams.length === 0) return null;
  const i = teams.findIndex((t) => t.id === teamId);
  return teams[(i + 1) % teams.length].id; // unknown id (-1) → first team
}
