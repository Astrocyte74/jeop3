import { HEARTBEAT_MS, decode, encode, type HostCommand, type HostSnapshot } from './protocol';
import { createPresence } from './presence';
import type { HostTransport } from './transport';

export interface TvLinkOptions {
  transport: HostTransport;
  getSnapshot: () => HostSnapshot;
  /** Run a command from the connected host through the same callbacks the TV's own buttons use. */
  onCommand: (command: HostCommand) => void;
  onConnectedChange?: (connected: boolean) => void;
  now?: () => number;
  /** 0 disables the built-in timer (tests call `check()` themselves). */
  intervalMs?: number;
  timeoutMs?: number;
}

/**
 * The game window's side of the link. It owns the truth: it publishes snapshots to the host and applies
 * the host's commands, but only while a host is connected and only from the host in control.
 */
export function createTvLink(options: TvLinkOptions) {
  const { transport, getSnapshot, onCommand, onConnectedChange } = options;
  const presence = createPresence({ now: options.now, timeoutMs: options.timeoutMs });
  let connected = false;
  let lastSeq = -1;

  const sendSnapshot = () => transport.send(encode({ from: 'tv', kind: 'snapshot', snapshot: getSnapshot() }));

  const syncConnected = () => {
    const now = presence.isConnected();
    if (now === connected) return;
    connected = now;
    onConnectedChange?.(connected);
  };

  const unsubscribe = transport.subscribe((raw) => {
    const message = decode(raw);
    if (!message || message.from !== 'host') return;
    switch (message.kind) {
      case 'hello':
        presence.hello(message.hostId);
        syncConnected();
        lastSeq = -1;
        sendSnapshot();
        break;
      case 'heartbeat': {
        const result = presence.heartbeat(message.hostId);
        if (result === 'ignored') {
          transport.send(encode({ from: 'tv', kind: 'rejected', hostId: message.hostId, reason: 'not-active' }));
        } else if (result === 'adopted') {
          syncConnected();
          sendSnapshot();
        }
        break;
      }
      case 'bye':
        presence.bye(message.hostId);
        syncConnected();
        break;
      case 'command':
        if (!presence.accepts(message.hostId)) {
          transport.send(encode({
            from: 'tv',
            kind: 'rejected',
            hostId: message.hostId,
            reason: presence.isConnected() ? 'not-active' : 'no-host',
          }));
          return;
        }
        presence.touch(message.hostId);
        // The transport may redeliver; a command runs once.
        if (message.seq <= lastSeq) return;
        lastSeq = message.seq;
        onCommand(message.command);
        break;
    }
  });

  const intervalMs = options.intervalMs ?? HEARTBEAT_MS;
  const timer =
    intervalMs > 0
      ? setInterval(() => {
          syncConnected();
          transport.send(encode({ from: 'tv', kind: 'beat' }));
        }, intervalMs)
      : null;

  return {
    /** Send the current snapshot to the host (no-op while none is connected). */
    publish(): void {
      syncConnected();
      if (connected) sendSnapshot();
    },
    /** Re-evaluate presence (called on a timer; exposed for tests). */
    check: syncConnected,
    isConnected: () => presence.isConnected(),
    dispose(): void {
      if (timer) clearInterval(timer);
      unsubscribe();
      transport.close();
    },
  };
}

export type TvLink = ReturnType<typeof createTvLink>;
