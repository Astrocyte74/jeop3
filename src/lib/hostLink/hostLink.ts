import { HEARTBEAT_MS, PRESENCE_TIMEOUT_MS, decode, encode, type HostCommand, type HostSnapshot } from './protocol';
import type { HostTransport } from './transport';

export type HostLinkStatus = 'connecting' | 'connected' | 'lost' | 'superseded';

export interface HostLinkState {
  status: HostLinkStatus;
  snapshot: HostSnapshot | null;
}

export interface HostLinkOptions {
  transport: HostTransport;
  hostId: string;
  onChange: (state: HostLinkState) => void;
  now?: () => number;
  /** 0 disables the built-in timer (tests call `check()` themselves). */
  intervalMs?: number;
  timeoutMs?: number;
}

/** The host window's side of the link: say hello, keep a heartbeat, render snapshots, send commands. */
export function createHostLink(options: HostLinkOptions) {
  const { transport, hostId, onChange } = options;
  const now = options.now ?? (() => Date.now());
  const timeoutMs = options.timeoutMs ?? PRESENCE_TIMEOUT_MS;
  let state: HostLinkState = { status: 'connecting', snapshot: null };
  let lastHeard = -Infinity;
  let seq = 0;

  const set = (patch: Partial<HostLinkState>) => {
    const next = { ...state, ...patch };
    if (next.status === state.status && next.snapshot === state.snapshot) return;
    state = next;
    onChange(state);
  };

  const heard = () => {
    lastHeard = now();
    if (state.status !== 'connected') set({ status: 'connected' });
  };

  const unsubscribe = transport.subscribe((raw) => {
    const message = decode(raw);
    if (!message || message.from !== 'tv') return;
    if (message.kind === 'rejected') {
      if (message.hostId === hostId) set({ status: 'superseded' });
      return;
    }
    if (state.status === 'superseded') return;
    heard();
    if (message.kind === 'snapshot') set({ snapshot: message.snapshot });
  });

  const hello = () => transport.send(encode({ from: 'host', kind: 'hello', hostId }));
  const check = () => {
    if (state.status === 'connected' && now() - lastHeard > timeoutMs) set({ status: 'lost' });
  };
  hello();

  const intervalMs = options.intervalMs ?? HEARTBEAT_MS;
  const timer =
    intervalMs > 0
      ? setInterval(() => {
          if (state.status === 'superseded') return;
          transport.send(encode({ from: 'host', kind: 'heartbeat', hostId }));
          check();
        }, intervalMs)
      : null;

  return {
    send(command: HostCommand): void {
      if (state.status === 'superseded') return;
      transport.send(encode({ from: 'host', kind: 'command', hostId, seq: ++seq, command }));
    },
    /** Take control back after another host window took over. */
    takeOver(): void {
      state = { ...state, status: 'connecting' };
      onChange(state);
      hello();
    },
    check,
    getState: () => state,
    dispose(): void {
      if (timer) clearInterval(timer);
      transport.send(encode({ from: 'host', kind: 'bye', hostId }));
      unsubscribe();
      transport.close();
    },
  };
}

export type HostLink = ReturnType<typeof createHostLink>;
