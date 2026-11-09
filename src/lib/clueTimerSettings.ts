import { useSyncExternalStore } from 'react';

const KEY = 'jeop3:clueTimerSecs';
const EVENT = 'jeop3:clue-timer-changed';
export const TIMER_OPTIONS = [0, 15, 30, 60];
let seconds = 30;

export function getClueTimerSecs(): number {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw === null ? 30 : Number(raw);
    seconds = TIMER_OPTIONS.includes(parsed) ? parsed : 30;
  } catch { /* Retain the in-memory preference when storage is unavailable. */ }
  return seconds;
}

export function setClueTimerSecs(value: number): void {
  if (!TIMER_OPTIONS.includes(value)) return;
  seconds = value;
  try { localStorage.setItem(KEY, String(value)); } catch { /* In-memory only. */ }
  window.dispatchEvent(new Event(EVENT));
}

function subscribe(listener: () => void) {
  window.addEventListener(EVENT, listener);
  window.addEventListener('storage', listener);
  return () => {
    window.removeEventListener(EVENT, listener);
    window.removeEventListener('storage', listener);
  };
}

export function useClueTimerSecs(): number {
  return useSyncExternalStore(subscribe, getClueTimerSecs, () => 30);
}
