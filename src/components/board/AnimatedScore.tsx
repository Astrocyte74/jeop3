import { useEffect, useRef, useState } from 'react';
import { useReducedMotion } from './useReducedMotion';
import { formatMoney } from '@/lib/money';
import { consumeScorePreview } from '@/lib/scorePreview';

/** Kept as an alias: every score and value in the app goes through `formatMoney`. */
export const formatScore = formatMoney;

interface AnimatedScoreProps {
  value: number;
  className?: string;
  /** Count up from this number on first mount (e.g. 0 for the finale). Defaults to the value itself. */
  initial?: number;
  /** Count duration in ms. */
  duration?: number;
  /** Flash green/red when the value changes. */
  flash?: boolean;
  /** A team id: when the clue screen already counted up to the new value, snap to it (no second count-up). */
  previewKey?: string;
}

/** Counts toward its value and pulses green on a gain / red on a loss. */
export function AnimatedScore({ value, className = '', initial, duration = 700, flash = true, previewKey }: AnimatedScoreProps) {
  const reduced = useReducedMotion();
  const [shown, setShown] = useState(initial ?? value);
  const [flashKind, setFlashKind] = useState<'gain' | 'loss' | null>(null);
  const shownRef = useRef(shown);
  const rafRef = useRef(0);
  const flashTimer = useRef<number | undefined>(undefined);
  const previous = useRef(initial ?? value);

  useEffect(() => {
    const from = shownRef.current;
    if (value === from && previous.current === value) return;
    if (previewKey && value !== from && consumeScorePreview(previewKey, value)) {
      cancelAnimationFrame(rafRef.current);
      previous.current = value;
      shownRef.current = value;
      setShown(value);
      return;
    }
    const direction = value > previous.current ? 'gain' : value < previous.current ? 'loss' : null;
    previous.current = value;

    if (flash && direction && initial === undefined) {
      setFlashKind(direction);
      window.clearTimeout(flashTimer.current);
      flashTimer.current = window.setTimeout(() => setFlashKind(null), 1100);
    }

    cancelAnimationFrame(rafRef.current);
    if (reduced || from === value) {
      shownRef.current = value;
      setShown(value);
      return;
    }
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      const next = from + (value - from) * eased;
      shownRef.current = next;
      setShown(next);
      if (t < 1) rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [value, reduced, duration, flash, initial, previewKey]);

  useEffect(() => () => window.clearTimeout(flashTimer.current), []);

  return (
    <span className={`${className} ${flashKind ? `score-flash-${flashKind}` : ''}`} aria-label={formatScore(value)}>
      <span aria-hidden="true">{formatScore(shown)}</span>
    </span>
  );
}
