import { useEffect, useState, type RefObject } from 'react';
import { playSfx } from '@/lib/sfx';

interface ThinkTimerProps {
  seconds: number;
  running: boolean;
  onReveal: () => void;
  actionLabel: string;
  /** The stage element: gets data-timer (calm|warn|urgent|expired|off) and --timer-frac so the whole
   *  screen frame can show the time left. Written straight to the DOM, so it costs no re-renders. */
  stageRef?: RefObject<HTMLElement | null>;
}

const R = 46;
const C = 2 * Math.PI * R;

/** Countdown ring. Click to reveal the answer. Ticks over the last 5 seconds. */
export function ThinkTimer({ seconds, running, stageRef, onReveal, actionLabel }: ThinkTimerProps) {
  const [remainingMs, setRemainingMs] = useState(seconds * 1000);

  useEffect(() => {
    if (!running || seconds === 0) return;
    let last = performance.now();
    const id = window.setInterval(() => {
      const now = performance.now();
      const dt = now - last;
      last = now;
      setRemainingMs((r) => Math.max(0, r - dt));
    }, 100);
    return () => window.clearInterval(id);
  }, [running, seconds]);

  const secs = Math.ceil(remainingMs / 1000);
  useEffect(() => {
    if (!running || seconds === 0) return;
    if (secs > 0 && secs <= 5) playSfx('tick');
    else if (secs === 0) playSfx('incorrect');
  }, [secs, running, seconds]);

  const frac = seconds > 0 ? remainingMs / (seconds * 1000) : 0;
  const urgent = secs <= 5;
  const expired = secs === 0;

  useEffect(() => {
    const el = stageRef?.current;
    if (!el) return;
    el.style.setProperty('--timer-frac', String(frac));
    el.setAttribute('data-timer', !running || seconds === 0 ? 'off' : expired ? 'expired' : urgent ? 'urgent' : secs <= 10 ? 'warn' : 'calm');
  }, [frac, secs, expired, urgent, running, seconds, stageRef]);
  useEffect(
    () => () => {
      const el = stageRef?.current;
      el?.setAttribute('data-timer', 'off');
    },
    [stageRef],
  );

  return (
    <button
      type="button"
      className="cs-ring"
      data-urgent={urgent}
      data-expired={expired}
      onClick={onReveal}
      tabIndex={running ? 0 : -1}
      aria-label={
        expired ? `Time's up. ${actionLabel}` : `${secs} seconds left. ${actionLabel}`
      }
    >
      <svg viewBox="0 0 108 108" aria-hidden="true">
        <circle className="cs-ring-track" cx="54" cy="54" r={R} />
        <circle
          className="cs-ring-fill"
          cx="54"
          cy="54"
          r={R}
          strokeDasharray={C}
          strokeDashoffset={C * (1 - frac)}
          transform="rotate(-90 54 54)"
        />
      </svg>
      <span className="cs-ring-num">{expired ? '0' : secs}</span>
    </button>
  );
}
