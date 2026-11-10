// The clue screen keeps its own state (attempts, timer, Daily Double phase). This small bridge lets it
// publish that state for the host snapshot and receive the host's clue commands, without the App
// having to know the screen's internals. The clue screen registers once; the link reads and commands.
import type { HostClueRuntime, HostCommand } from './protocol';

export type ClueHostCommand = Exclude<HostCommand, { type: 'openClue' } | { type: 'undo' }>;

let runtime: HostClueRuntime | null = null;
const listeners = new Set<() => void>();
let handler: ((command: ClueHostCommand) => void) | null = null;

export function publishClueRuntime(next: HostClueRuntime | null): void {
  runtime = next;
  listeners.forEach((l) => l());
}

export function getClueRuntime(): HostClueRuntime | null {
  return runtime;
}

export function subscribeClueRuntime(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** The open clue screen registers how to run a host command. Returns the unregister function. */
export function registerClueHandler(next: (command: ClueHostCommand) => void): () => void {
  handler = next;
  return () => {
    if (handler === next) handler = null;
  };
}

/** True when a clue screen was there to receive the command. */
export function runClueCommand(command: ClueHostCommand): boolean {
  if (!handler) return false;
  handler(command);
  return true;
}
