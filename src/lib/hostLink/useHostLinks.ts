import { useCallback, useEffect, useRef, useState, type DependencyList } from 'react';
import { createBroadcastTransport, broadcastSupported } from './broadcastTransport';
import { createHostLink, type HostLink, type HostLinkState } from './hostLink';
import { setHostConnected } from './hostPresence';
import { subscribeClueRuntime } from './clueBridge';
import { createTvLink, type TvLink } from './tvLink';
import type { HostCommand, HostSnapshot } from './protocol';

/**
 * Game window: keep the host window informed and run its commands.
 * `deps` lists what a snapshot is built from; the snapshot is re-sent when any of it changes.
 */
export function useTvHostLink(
  buildSnapshot: () => HostSnapshot,
  onCommand: (command: HostCommand) => void,
  deps: DependencyList,
): void {
  const buildRef = useRef(buildSnapshot);
  const commandRef = useRef(onCommand);
  useEffect(() => {
    buildRef.current = buildSnapshot;
    commandRef.current = onCommand;
  });
  const linkRef = useRef<TvLink | null>(null);

  useEffect(() => {
    if (!broadcastSupported()) return;
    const link = createTvLink({
      transport: createBroadcastTransport(),
      getSnapshot: () => buildRef.current(),
      onCommand: (command) => commandRef.current(command),
      onConnectedChange: setHostConnected,
    });
    linkRef.current = link;
    // The clue screen's own state (timer, attempts) changes without the App re-rendering.
    const unsubscribe = subscribeClueRuntime(() => link.publish());
    return () => {
      unsubscribe();
      link.dispose();
      linkRef.current = null;
      setHostConnected(false);
    };
  }, []);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => linkRef.current?.publish(), deps);
}

function newHostId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `host-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  }
}

/** Host window: connect to the game window, expose its snapshot, and send it commands. */
export function useHostClient(): HostLinkState & {
  send: (command: HostCommand) => void;
  takeOver: () => void;
  supported: boolean;
} {
  const supported = broadcastSupported();
  const [state, setState] = useState<HostLinkState>({ status: 'connecting', snapshot: null });
  const linkRef = useRef<HostLink | null>(null);

  useEffect(() => {
    if (!supported) return;
    const link = createHostLink({ transport: createBroadcastTransport(), hostId: newHostId(), onChange: setState });
    linkRef.current = link;
    const bye = () => link.dispose();
    window.addEventListener('pagehide', bye);
    return () => {
      window.removeEventListener('pagehide', bye);
      link.dispose();
      linkRef.current = null;
    };
  }, [supported]);

  const send = useCallback((command: HostCommand) => linkRef.current?.send(command), []);
  const takeOver = useCallback(() => linkRef.current?.takeOver(), []);
  return { ...state, send, takeOver, supported };
}
