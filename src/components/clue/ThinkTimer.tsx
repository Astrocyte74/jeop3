import { useEffect, useState } from 'react';
import { playSfx } from '@/lib/sfx';

interface ThinkTimerProps {
  seconds: number;
  running: boolean;
}

const R = 46;
const C = 2 * Math.PI * R;

/** Countdown ring. Click to pause/resume. Ticks over the last 5 seconds. */
export function ThinkTimer({ seconds, running }: ThinkTimerProps) {
  const [remainingMs, setRemainingMs] = useState(seconds * 1000);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (!running || paused || seconds === 0) return;
    let last = performance.now();
    const id = window.setInterval(() => {
      const now = performance.now();
      const dt = now - last;
      last = now;
      setRemainingMs((r) => Math.max(0, r - dt));
    }, 100);
    return () => window.clearInterval(id);
  }, [running, paused, seconds]);

  const secs = Math.ceil(remainingMs / 1000);
  useEffect(() => {
    if (!running || seconds === 0) return;
    if (secs > 0 && secs <= 5) playSfx('tick');
    else if (secs === 0) playSfx('incorrect');
  }, [secs, running, seconds]);

  const frac = seconds > 0 ? remainingMs / (seconds * 1000) : 0;
  const urgent = secs <= 5;
  const expired = secs === 0;

  return (
    <button
      type="button"
      className="cs-ring"
      data-urgent={urgent}
      data-expired={expired}
      data-paused={paused}
      onClick={() => running && !expired && setPaused((p) => !p)}
      aria-label={
        expired ? "Time's up" : `${secs} seconds left. ${paused ? 'Resume' : 'Pause'} timer`
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
