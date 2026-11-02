import { Check, X } from 'lucide-react';
import type { CSSProperties } from 'react';
import type { Team } from '@/lib/storage';
import { teamColor, teamInitials } from '@/lib/teamColors';
import { formatMoney } from './format';

interface DailyDoubleScoringProps {
  team: Team;
  teamIndex: number;
  wager: number;
  outcome: 'correct' | 'incorrect' | null;
  onCorrect: () => void;
  onIncorrect: () => void;
}

/** Only the wagering team can win or lose a Daily Double, so scoring is two buttons. */
export function DailyDoubleScoring({ team, teamIndex, wager, outcome, onCorrect, onIncorrect }: DailyDoubleScoringProps) {
  const c = teamColor(teamIndex);
  const key = teamIndex < 9 ? teamIndex + 1 : null;
  return (
    <div className="dd-score" style={{ '--tc': c.main, '--tc-on': c.onMain } as CSSProperties}>
      <p className="dd-score-who">
        <span className="dd-who-avatar dd-who-avatar--sm" aria-hidden="true">
          {teamInitials(team.name)}
        </span>
        <span>
          <strong>{team.name}</strong> wagered <strong>{formatMoney(wager)}</strong>
        </span>
      </p>
      <div className="dd-score-btns">
        <button
          type="button"
          className="dd-btn dd-btn--yes"
          data-state={outcome === 'correct' ? 'chosen' : outcome ? 'dim' : 'idle'}
          disabled={outcome !== null}
          onClick={onCorrect}
        >
          <Check className="w-8 h-8" strokeWidth={3.5} />
          <span>Correct +{formatMoney(wager)}</span>
          {key && <kbd>{key}</kbd>}
        </button>
        <button
          type="button"
          className="dd-btn dd-btn--no"
          data-state={outcome === 'incorrect' ? 'chosen' : outcome ? 'dim' : 'idle'}
          disabled={outcome !== null}
          onClick={onIncorrect}
        >
          <X className="w-8 h-8" strokeWidth={3.5} />
          <span>Incorrect {formatMoney(-wager)}</span>
          {key && <kbd>Shift {key}</kbd>}
        </button>
      </div>
    </div>
  );
}
