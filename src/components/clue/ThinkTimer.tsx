import { useEffect, useId, useRef, useState, type RefObject } from 'react';
import { playSfx } from '@/lib/sfx';
import { TimerControls } from '@/components/TableRuleControls';

/** Remote control of the timer (the host window pauses, resumes and adds time through this). */
export interface ThinkTimerControl {
  pause: () => void;
  resume: () => void;
  addSeconds: (seconds: number) => void;
}

export interface ThinkTimerState {
  secondsLeft: number;
  paused: boolean;
  expired: boolean;
}

interface ThinkTimerProps {
  seconds: number;
  running: boolean;
  /** Hold the countdown without leaving the timer: the host is judging an answer. */
  hold?: boolean;
  onTimerChange: (seconds: number) => void;
  /** Filled with this timer's remote control while it is mounted. */
  controlRef?: RefObject<ThinkTimerControl | null>;
  /** Told whenever the whole second, or paused, changes. */
  onState?: (state: ThinkTimerState) => void;
  /** The stage element: gets data-timer (calm|warn|urgent|expired|off) and --timer-frac so the whole
   *  screen frame can show the time left. Written straight to the DOM, so it costs no re-renders. */
  stageRef?: RefObject<HTMLElement | null>;
}

const R = 46;
const C = 2 * Math.PI * R;

/** Click to pause/resume; right-click (or Shift+F10) for duration options. */
export function ThinkTimer({ seconds, running, hold = false, stageRef, onTimerChange, controlRef, onState }: ThinkTimerProps) {
  const [remainingMs, setRemainingMs] = useState(seconds * 1000);
  const [paused, setPaused] = useState(false);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (!optionsOpen) return;
    wrapRef.current?.querySelector<HTMLElement>('[aria-pressed="true"]')?.focus();
    const onOutside = (event: PointerEvent) => {
      if (!wrapRef.current?.contains(event.target as Node)) setOptionsOpen(false);
    };
    const onEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      setOptionsOpen(false);
      buttonRef.current?.focus();
    };
    document.addEventListener('pointerdown', onOutside);
    document.addEventListener('keydown', onEscape, true);
    return () => {
      document.removeEventListener('pointerdown', onOutside);
      document.removeEventListener('keydown', onEscape, true);
    };
  }, [optionsOpen]);

  useEffect(() => {
    if (!running || paused || hold || seconds === 0) return;
    let last = performance.now();
    const id = window.setInterval(() => {
      const now = performance.now();
      const dt = now - last;
      last = now;
      setRemainingMs((r) => Math.max(0, r - dt));
    }, 100);
    return () => window.clearInterval(id);
  }, [running, paused, hold, seconds]);

  const secs = Math.ceil(remainingMs / 1000);

  useEffect(() => {
    if (!controlRef) return;
    controlRef.current = {
      pause: () => setPaused(true),
      resume: () => setPaused(false),
      addSeconds: (extra) => setRemainingMs((r) => Math.max(0, r) + extra * 1000),
    };
    return () => {
      controlRef.current = null;
    };
  }, [controlRef, seconds]);

  useEffect(() => {
    onState?.({ secondsLeft: secs, paused, expired: secs === 0 });
  }, [onState, secs, paused]);
  useEffect(() => {
    if (!running || hold || seconds === 0) return;
    if (secs > 0 && secs <= 5) playSfx('tick');
    else if (secs === 0) playSfx('incorrect');
  }, [secs, running, hold, seconds]);

  const frac = seconds > 0 ? Math.min(1, remainingMs / (seconds * 1000)) : 0;
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
    <div className="cs-timer-control" ref={wrapRef} onBlur={(event) => {
      if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget as Node)) setOptionsOpen(false);
    }}>
    <button
      ref={buttonRef}
      type="button"
      className="cs-ring"
      data-urgent={urgent}
      data-expired={expired}
      data-paused={paused || hold}
      onClick={() => { if (running && !expired) setPaused((value) => !value); }}
      onContextMenu={(event) => { event.preventDefault(); if (running) setOptionsOpen(true); }}
      onKeyDown={(event) => {
        if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) {
          event.preventDefault();
          if (running) setOptionsOpen(true);
        }
      }}
      tabIndex={running ? 0 : -1}
      aria-expanded={optionsOpen}
      aria-controls={optionsOpen ? panelId : undefined}
      title="Click to pause or resume. Right-click for timer options."
      aria-label={
        expired ? "Time's up. Right-click for timer options" : `${secs} seconds left. ${paused ? 'Resume' : 'Pause'} timer`
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
      {(paused || hold) && !expired && <span className="cs-timer-paused" aria-hidden="true">{hold && !paused ? 'Judging' : 'Paused'}</span>}
    </button>
    {optionsOpen && running && (
      <div id={panelId} className="cs-options-panel cs-timer-options" role="group" aria-label="Timer options">
        <TimerControls seconds={seconds} onChange={(next) => {
          setOptionsOpen(false);
          onTimerChange(next);
          stageRef?.current?.focus({ preventScroll: true });
        }} />
      </div>
    )}
    </div>
  );
}
