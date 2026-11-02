import { useLayoutEffect, type RefObject } from 'react';

/**
 * Sizes the text element's font so it fills (but never overflows) its
 * container. Re-fits whenever the container resizes or `deps` change.
 */
export function useFitText(
  containerRef: RefObject<HTMLElement | null>,
  textRef: RefObject<HTMLElement | null>,
  deps: unknown[],
  { min = 18, max = 260 }: { min?: number; max?: number } = {},
) {
  useLayoutEffect(() => {
    const container = containerRef.current;
    const el = textRef.current;
    if (!container || !el) return;

    let raf = 0;
    const fit = () => {
      const h = container.clientHeight;
      const w = container.clientWidth;
      if (h <= 0 || w <= 0) return;
      let lo = min;
      let hi = Math.min(max, h);
      while (hi - lo > 1) {
        const mid = Math.floor((lo + hi) / 2);
        el.style.fontSize = `${mid}px`;
        if (el.offsetHeight <= h && el.scrollWidth <= w + 1) lo = mid;
        else hi = mid;
      }
      el.style.fontSize = `${lo}px`;
    };
    const schedule = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(fit);
    };

    fit();
    const ro = new ResizeObserver(schedule);
    ro.observe(container);
    // Webfont (Anton) may land after first paint and change glyph widths.
    void document.fonts?.ready.then(schedule);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
