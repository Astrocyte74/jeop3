import type { HostTransport } from './transport';

export const CHANNEL_NAME = 'jeop3-host';

/** Same-computer transport: every window on this origin can talk over a BroadcastChannel. */
export function createBroadcastTransport(name = CHANNEL_NAME): HostTransport {
  const channel = new BroadcastChannel(name);
  const listeners = new Set<(data: string) => void>();
  channel.onmessage = (event: MessageEvent) => {
    if (typeof event.data !== 'string') return;
    listeners.forEach((l) => l(event.data as string));
  };
  return {
    send: (data) => channel.postMessage(data),
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    close() {
      listeners.clear();
      channel.close();
    },
  };
}

export function broadcastSupported(): boolean {
  return typeof BroadcastChannel !== 'undefined';
}
