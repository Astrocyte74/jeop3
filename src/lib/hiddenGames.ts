// Games the host has tucked out of the library. Nothing is deleted: this is only a list of ids kept in
// its own localStorage key, so hiding is instantly reversible and no saved game or progress is touched.
import { useSyncExternalStore } from 'react';

const KEY = 'jeop3:hiddenGames:v1';
const EMPTY: ReadonlySet<string> = new Set();

function load(): Set<string> {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || '[]');
    if (Array.isArray(raw)) return new Set(raw.filter((x): x is string => typeof x === 'string'));
  } catch {
    /* storage unavailable or corrupt: nothing hidden */
  }
  return new Set();
}

let current: ReadonlySet<string> | null = null;
const listeners = new Set<() => void>();
let hooked = false;

export function getHiddenGames(): ReadonlySet<string> {
  if (!current) current = load();
  if (!hooked && typeof window !== 'undefined') {
    // Stay current with a change made in another window.
    hooked = true;
    window.addEventListener('storage', (e) => {
      if (e.key === KEY) {
        current = load();
        listeners.forEach((l) => l());
      }
    });
  }
  return current;
}

function save(next: Set<string>): void {
  current = next;
  try {
    localStorage.setItem(KEY, JSON.stringify([...next]));
  } catch {
    /* in-memory only */
  }
  listeners.forEach((l) => l());
}

export function setGameHidden(id: string, hidden: boolean): void {
  const next = new Set(getHiddenGames());
  if (hidden) next.add(id);
  else next.delete(id);
  save(next);
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useHiddenGames(): ReadonlySet<string> {
  return useSyncExternalStore(subscribe, getHiddenGames, () => EMPTY);
}
