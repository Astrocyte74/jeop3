import { useSyncExternalStore } from 'react';

// Display preference for this device, shared by the lobby and in-game menu.
const KEY = 'jeop3:showAnswerIcons';
const EVENT = 'jeop3:icons-changed';
let enabled = true;

export function getIconsEnabled(): boolean {
  try {
    enabled = localStorage.getItem(KEY) !== 'false';
  } catch { /* Use the in-memory preference if storage is unavailable. */ }
  return enabled;
}

export function setIconsEnabled(value: boolean): void {
  enabled = value;
  try { localStorage.setItem(KEY, String(value)); } catch { /* In-memory only. */ }
  window.dispatchEvent(new Event(EVENT));
}

function subscribe(listener: () => void): () => void {
  window.addEventListener(EVENT, listener);
  window.addEventListener('storage', listener);
  return () => {
    window.removeEventListener(EVENT, listener);
    window.removeEventListener('storage', listener);
  };
}

export function useIconsEnabled(): boolean {
  return useSyncExternalStore(subscribe, getIconsEnabled, () => true);
}
