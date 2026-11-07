import { Check, X } from 'lucide-react';
import { formatMoney } from './format';

interface AnswerActionsProps {
  value: number;
  /** Wrong answers cost points (otherwise the Wrong button says so). */
  penalty: boolean;
  locked: boolean;
  won: boolean;
  onCorrect: () => void;
  onWrong: () => void;
}

/** Two big buttons for the team in play. */
export function AnswerActions({ value, penalty, locked, won, onCorrect, onWrong }: AnswerActionsProps) {
  return (
    <div className="cs-actions">
      <button type="button" className="cs-bigact cs-bigact--yes" data-won={won} onClick={onCorrect} disabled={locked}>
        <Check strokeWidth={3.5} aria-hidden="true" />
        <span>Correct</span>
        <small>+{formatMoney(value)}</small>
        <kbd aria-hidden="true">Enter</kbd>
      </button>
      <button type="button" className="cs-bigact cs-bigact--no" onClick={onWrong} disabled={locked}>
        <X strokeWidth={3.5} aria-hidden="true" />
        <span>Wrong</span>
        <small>{penalty ? `−${formatMoney(value)}` : 'no penalty'}</small>
        <kbd aria-hidden="true">W</kbd>
      </button>
    </div>
  );
}
