import { PRESENCE_TIMEOUT_MS } from './protocol';

export type HeartbeatResult = 'ok' | 'adopted' | 'ignored';

/**
 * Tracks which host window is in control. One host at a time: the newest `hello` wins. A host counts
 * as connected while its heartbeats keep arriving; after the timeout it is gone.
 */
export function createPresence(options: { timeoutMs?: number; now?: () => number } = {}) {
  const timeoutMs = options.timeoutMs ?? PRESENCE_TIMEOUT_MS;
  const now = options.now ?? (() => Date.now());
  let hostId: string | null = null;
  let lastSeen = 0;

  const alive = () => hostId !== null && now() - lastSeen <= timeoutMs;

  return {
    /** A host says hello: it takes over, replacing any other. */
    hello(id: string): void {
      hostId = id;
      lastSeen = now();
    },
    /** 'adopted' = there was no live host and this one carried on (e.g. the TV window was reloaded). */
    heartbeat(id: string): HeartbeatResult {
      if (id === hostId && alive()) {
        lastSeen = now();
        return 'ok';
      }
      if (!alive()) {
        hostId = id;
        lastSeen = now();
        return 'adopted';
      }
      return 'ignored';
    },
    bye(id: string): void {
      if (id === hostId) hostId = null;
    },
    /** Another heartbeat from the active host counts as activity for commands too. */
    touch(id: string): void {
      if (id === hostId && alive()) lastSeen = now();
    },
    isConnected: alive,
    /** Commands are accepted only from the live, active host. */
    accepts(id: string): boolean {
      return alive() && id === hostId;
    },
    activeHostId: (): string | null => (alive() ? hostId : null),
  };
}

export type Presence = ReturnType<typeof createPresence>;
