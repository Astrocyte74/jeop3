import { useEffect, useRef, type CSSProperties } from 'react';
import { Lock } from 'lucide-react';
import type { Team } from '@/lib/storage';
import { MIN_WAGER } from '@/lib/gameState';
import { teamColor, teamInitials } from '@/lib/teamColors';
import { formatMoney } from './format';
import { halfWager, isLegalWager, parseWager } from './wager';

interface WagerPanelProps {
  team: Team;
  teamIndex: number;
  cap: number;
  text: string;
  onTextChange: (text: string) => void;
  onLock: (wager: number) => void;
  onCancel: () => void;
  onQuick: () => void;
}

/** Wager step for the active team: big number field, quick amounts, legal range. */
export function WagerPanel({ team, teamIndex, cap, text, onTextChange, onLock, onCancel, onQuick }: WagerPanelProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const c = teamColor(teamIndex);
  const wager = parseWager(text);
  const legal = isLegalWager(wager, cap);
  const showError = text !== '' && !legal;
  const capIsScore = cap === team.score;

  useEffect(() => {
    inputRef.current?.focus({ preventScroll: true });
  }, []);

  const quick = [
    { key: 'min', label: 'Min', amount: MIN_WAGER },
    { key: 'half', label: 'Half', amount: halfWager(cap) },
    { key: 'max', label: capIsScore ? 'All in' : 'Max', amount: cap },
  ];

  const lock = () => {
    if (legal) onLock(wager);
  };

  const step = (dir: 1 | -1) => {
    const next = Math.min(cap, Math.max(MIN_WAGER, (wager ?? 0) + dir * 100));
    onTextChange(String(next));
  };

  return (
    <div className="dd-wager" style={{ '--tc': c.main, '--tc-on': c.onMain } as CSSProperties}>
      <div className="dd-who">
        <span className="dd-who-avatar" aria-hidden="true">
          {teamInitials(team.name)}
        </span>
        <div className="dd-who-text">
          <h3 className="dd-who-ask">{team.name}, make your wager</h3>
          <p className="dd-who-score">
            Your score <strong>{formatMoney(team.score)}</strong>
          </p>
        </div>
      </div>

      <div className="dd-field" data-invalid={showError} data-ready={legal}>
        <label className="dd-field-label" htmlFor="dd-wager-input">
          Wager
        </label>
        <span className="dd-dollar" aria-hidden="true">
          $
        </span>
        <input
          ref={inputRef}
          id="dd-wager-input"
          className="dd-input"
          type="text"
          inputMode="numeric"
          autoComplete="off"
          spellCheck={false}
          placeholder="0"
          value={text}
          style={{ width: `${Math.max(2, text.length || 1) + 0.4}ch` }}
          aria-invalid={showError}
          aria-describedby="dd-wager-range"
          onChange={(e) => onTextChange(e.target.value.replace(/\D/g, '').replace(/^0+(?=\d)/, '').slice(0, 7))}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              lock();
            } else if (e.key === 'Escape') {
              e.preventDefault();
              onCancel();
            } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
              e.preventDefault();
              step(e.key === 'ArrowUp' ? 1 : -1);
            }
          }}
        />
      </div>

      <p id="dd-wager-range" className="dd-range" data-invalid={showError} role={showError ? 'alert' : undefined}>
        {showError
          ? `Enter a whole amount from ${formatMoney(MIN_WAGER)} to ${formatMoney(cap)}.`
          : capIsScore
            ? `Up to ${formatMoney(cap)}, your whole score. Minimum ${formatMoney(MIN_WAGER)}.`
            : `Up to ${formatMoney(cap)}, the top clue on the board. Minimum ${formatMoney(MIN_WAGER)}.`}
      </p>

      <div className="dd-quick" role="group" aria-label="Quick wagers">
        {quick.map((q) => (
          <button
            key={q.key}
            type="button"
            className="dd-quick-btn"
            data-on={wager === q.amount}
            onClick={() => {
              onTextChange(String(q.amount));
              onQuick();
              inputRef.current?.focus({ preventScroll: true });
            }}
          >
            <span className="dd-quick-label">{q.label}</span>
            <span className="dd-quick-amt">{formatMoney(q.amount)}</span>
          </button>
        ))}
      </div>

      <button type="button" className="dd-lock" onClick={lock} disabled={!legal}>
        <Lock className="w-7 h-7" strokeWidth={2.5} />
        <span>{legal ? `Lock in ${formatMoney(wager)}` : 'Lock in wager'}</span>
        <kbd>Enter</kbd>
      </button>
    </div>
  );
}
