import { Minus } from 'lucide-react';
import type { CSSProperties } from 'react';
import type { Team } from '@/lib/storage';
import { teamColor, teamInitials } from '@/lib/teamColors';
import { formatMoney } from './format';

interface TeamTilesProps {
  teams: Team[];
  value: number;
  activeTeamId: string;
  /** Teams that have answered wrong on this clue (deduction pending). */
  missedIds: string[];
  /** Team currently offered the steal. */
  stealId: string | null;
  /** Team that just won the clue (celebration lock). */
  wonId: string | null;
  locked: boolean;
  /** Wrong answers cost points (default). When false, a miss shows as 'Miss' with no deduction. */
  penalty?: boolean;
  onAward: (teamId: string) => void;
  onDeduct: (teamId: string) => void;
}

/** One-tap team tiles: the body awards, the minus deducts. */
export function TeamTiles({
  teams,
  value,
  activeTeamId,
  missedIds,
  stealId,
  wonId,
  locked,
  penalty = true,
  onAward,
  onDeduct,
}: TeamTilesProps) {
  return (
    <ul className="cs-tiles" aria-label="Teams">
      {teams.map((team, i) => {
        const c = teamColor(i);
        const missed = missedIds.includes(team.id);
        const won = wonId === team.id;
        const state = won ? 'won' : missed ? 'missed' : stealId === team.id ? 'steal' : 'idle';
        const style = {
          '--tc': c.main,
          '--tc-soft': c.soft,
          '--tc-on': c.onMain,
        } as CSSProperties;
        return (
          <li
            key={team.id}
            className="cs-tile"
            data-state={state}
            data-active={activeTeamId === team.id}
            data-dim={wonId !== null && !won}
            style={style}
          >
            {i < 9 && (
              <kbd className="cs-key" aria-hidden="true">
                {i + 1}
              </kbd>
            )}
            {state === 'steal' && <span className="cs-steal-flag">Steal</span>}
            <button
              type="button"
              className="cs-tile-main"
              onClick={() => onAward(team.id)}
              disabled={locked || missed}
              aria-label={`Award ${formatMoney(value)} to ${team.name}${i < 9 ? ` (key ${i + 1})` : ''}`}
            >
              <span className="cs-avatar" aria-hidden="true">
                {teamInitials(team.name)}
              </span>
              <span className="cs-tile-text">
                <span className="cs-tile-name">{team.name}</span>
                <span className="cs-tile-score">{formatMoney(team.score)}</span>
              </span>
              <span className="cs-tile-delta" aria-hidden="true">
                {missed ? (penalty ? `−$${value}` : 'Miss') : `+$${value}`}
              </span>
            </button>
            <button
              type="button"
              className="cs-tile-minus"
              onClick={() => onDeduct(team.id)}
              disabled={locked}
              aria-pressed={missed}
              aria-label={
                missed
                  ? `Undo deduction for ${team.name}`
                  : penalty
                    ? `Deduct ${formatMoney(value)} from ${team.name}${i < 9 ? ` (Shift+${i + 1})` : ''}`
                    : `Mark ${team.name} as missed${i < 9 ? ` (Shift+${i + 1})` : ''}`
              }
              title={missed ? 'Undo' : penalty ? `Wrong answer: −$${value}` : 'Wrong answer'}
            >
              <Minus className="w-6 h-6" strokeWidth={3} />
            </button>
          </li>
        );
      })}
    </ul>
  );
}
