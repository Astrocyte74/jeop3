import { useEffect, useId, useRef, type FocusEvent } from 'react';
import { SlidersHorizontal, ScrollText, Worm } from 'lucide-react';
import { TableRuleControls, TimerControls } from '@/components/TableRuleControls';

interface ClueOptionsProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Offer the game-mode switch (only when the board can switch to Trivia Snake). */
  showMode: boolean;
  onPickSnake: () => void;
  /** Offer the think-timer length (only before the answer is up). */
  showTimer: boolean;
  timerSecs: number;
  onTimerChange: (secs: number) => void;
  dailyDouble: boolean;
}

/**
 * The clue screen's settings, kept apart from the "?" tips toggle: game mode and think-timer length.
 * A small non-modal popover. Escape closes just the popover and hands focus back to the button; Tab
 * out of it (or a click outside) also closes it.
 */
export function ClueOptions({
  open,
  onOpenChange,
  showMode,
  onPickSnake,
  showTimer,
  timerSecs,
  onTimerChange,
  dailyDouble,
}: ClueOptionsProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();
  const modeLabelId = useId();

  useEffect(() => {
    if (!open) return;
    const panel = wrapRef.current?.querySelector<HTMLElement>('.cs-options-panel');
    (panel?.querySelector<HTMLElement>('button:not(:disabled)') ?? panel)?.focus({ preventScroll: true });
    const onDown = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) onOpenChange(false);
    };
    // Capture + stopPropagation so Escape closes this popover without also closing the clue.
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopPropagation();
      onOpenChange(false);
      buttonRef.current?.focus({ preventScroll: true });
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey, true);
    };
  }, [open, onOpenChange]);

  const onBlur = (e: FocusEvent<HTMLDivElement>) => {
    const next = e.relatedTarget as Node | null;
    if (open && next && !wrapRef.current?.contains(next)) onOpenChange(false);
  };

  return (
    <div className="cs-options" ref={wrapRef} onBlur={onBlur}>
      <button
        ref={buttonRef}
        type="button"
        className="cs-pill-btn"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        aria-label="Options: rules, game mode and timer"
        title="Options"
        onClick={() => onOpenChange(!open)}
      >
        <SlidersHorizontal className="w-5 h-5" aria-hidden="true" />
        <span className="cs-pill-text">Options</span>
      </button>

      {open && (
        <div id={panelId} className="cs-options-panel" role="group" aria-label="Clue options" tabIndex={-1}>
          <TableRuleControls dailyDouble={dailyDouble} />
          {showMode && (
            <div className="cs-opt-group" role="group" aria-labelledby={modeLabelId}>
              <div id={modeLabelId} className="cs-opt-label">
                Play this clue as
              </div>
              <div className="cs-opt-row">
                <button
                  type="button"
                  className="cs-opt"
                  aria-pressed={true}
                  onClick={() => { onOpenChange(false); buttonRef.current?.focus(); }}
                >
                  <ScrollText className="w-4 h-4" aria-hidden="true" />
                  Regular
                </button>
                <button
                  type="button"
                  className="cs-opt"
                  aria-pressed={false}
                  onClick={onPickSnake}
                  title="Bonus round: leaves this clue for Trivia Snake"
                >
                  <Worm className="w-4 h-4" aria-hidden="true" />
                  Trivia Snake
                </button>
              </div>
            </div>
          )}
          {showTimer && <TimerControls seconds={timerSecs} onChange={onTimerChange} />}

        </div>
      )}
    </div>
  );
}
