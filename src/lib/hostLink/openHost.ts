export const HOST_WINDOW_NAME = 'jeop3-host';

export function hostViewUrl(): string {
  return `${window.location.origin}/?view=host`;
}

/** Open (or focus) the host window beside the game window. Null when the browser blocked the popup. */
export function openHostWindow(): Window | null {
  const w = Math.min(1180, Math.max(720, Math.round(window.screen.availWidth * 0.6)));
  const h = Math.min(820, Math.max(560, Math.round(window.screen.availHeight * 0.8)));
  const popup = window.open(hostViewUrl(), HOST_WINDOW_NAME, `popup,width=${w},height=${h}`);
  popup?.focus();
  return popup;
}

export function isHostView(): boolean {
  try {
    return new URLSearchParams(window.location.search).get('view') === 'host';
  } catch {
    return false;
  }
}
