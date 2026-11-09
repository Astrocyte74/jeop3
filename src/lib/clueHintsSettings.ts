import { useSyncExternalStore } from 'react';

// Whether the clue screen shows its shortcut chips and explanatory notes. A per-device display
// preference (same pattern as iconSettings): hidden by default, and it stays as the host left it
// across clues until they toggle it again.
const KEY = 'jeop3:clueHints';
const EVENT = 'jeop3:clue-hints-changed';
let enabled = false;

export function getClueHints(): boolean {
  try {
    enabled = localStorage.getItem(KEY) === 'true';
  } catch {
    /* Use the in-memory preference if storage is unavailable. */
  }
  return enabled;
}

export function setClueHints(value: boolean): void {
  enabled = value;
  try {
    localStorage.setItem(KEY, String(value));
  } catch {
    /* In-memory only. */
  }
  window.dispatchEvent(new Event(EVENT));
}

export function toggleClueHints(): void {
  setClueHints(!getClueHints());
}

function subscribe(listener: () => void): () => void {
  window.addEventListener(EVENT, listener);
  window.addEventListener('storage', listener);
  return () => {
    window.removeEventListener(EVENT, listener);
    window.removeEventListener('storage', listener);
  };
}

export function useClueHints(): boolean {
  return useSyncExternalStore(subscribe, getClueHints, () => false);
}
