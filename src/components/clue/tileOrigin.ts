// Remembers where the last clue tile was clicked so the clue "takeover" can
// expand out of it. Works without GameBoard knowing about it: any element with
// the `clue-btn` class (or a `data-clue-tile` attribute) is picked up.

interface Origin {
  rect: DOMRect;
  at: number;
}

let last: Origin | null = null;
let installed = false;

function install() {
  if (installed || typeof document === 'undefined') return;
  installed = true;
  document.addEventListener(
    'click',
    (e) => {
      const el = (e.target as Element | null)?.closest?.('.clue-btn, [data-clue-tile]');
      if (el) last = { rect: el.getBoundingClientRect(), at: performance.now() };
    },
    true,
  );
}
install();

/** The tile rect from a click in the last couple of seconds, else null. */
export function recentTileRect(maxAgeMs = 2500): DOMRect | null {
  if (!last) return null;
  return performance.now() - last.at <= maxAgeMs ? last.rect : null;
}
