import { useSyncExternalStore } from 'react';

// Whether a host window is connected to this (game) window. The TV adapts: it hides Correct / Wrong
// while a host is judging and shows a small "Host connected" marker.
let connected = false;
const listeners = new Set<() => void>();

export function setHostConnected(next: boolean): void {
  if (connected === next) return;
  connected = next;
  listeners.forEach((l) => l());
}

export function isHostConnected(): boolean {
  return connected;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useHostConnected(): boolean {
  return useSyncExternalStore(subscribe, isHostConnected, () => false);
}
