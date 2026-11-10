/**
 * How messages travel between windows. Text in, text out, so a WebSocket (for phones) can be dropped
 * in later behind the same interface without touching the screens or the link logic.
 */
export interface HostTransport {
  send(data: string): void;
  /** Listen for incoming messages (never the sender's own). Returns an unsubscribe function. */
  subscribe(listener: (data: string) => void): () => void;
  close(): void;
}
