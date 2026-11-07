import type { CSSProperties } from 'react';
import type { Team } from '@/lib/storage';
import { teamColor, teamInitials } from '@/lib/teamColors';
import { formatMoney } from './format';

interface TurnBannerProps {
  teams: Team[];
  /** The team currently answering. */
  inPlayId: string;
  /** This team is stealing after another team missed. */
  steal: boolean;
  value: number;
  missedIds: string[];
  locked: boolean;
  /** Switch who is answering (e.g. another team buzzed first). */
  onSelect: (teamId: string) => void;
  /** Tap a team that missed to take the miss back. */
  onUndoMiss: (teamId: string) => void;
}

const vars = (index: number): CSSProperties => {
  const c = teamColor(index);
  return { '--tc': c.main, '--tc-on': c.onMain } as CSSProperties;
};

/** The team in play, big enough to read from across the room, plus quiet chips to switch teams. */
export function TurnBanner({ teams, inPlayId, steal, value, missedIds, locked, onSelect, onUndoMiss }: TurnBannerProps) {
  const index = Math.max(0, teams.findIndex((t) => t.id === inPlayId));
  const team = teams[index];
  if (!team) return null;

  return (
    <div className="cs-turn" role="group" aria-label="Team in play">
      <div className="cs-turn-banner" data-steal={steal} style={vars(index)} key={team.id}>
        <span className="cs-turn-avatar" aria-hidden="true">
          {teamInitials(team.name)}
        </span>
        <span className="cs-turn-text">
          <span className="cs-turn-label">{steal ? `Steal for ${formatMoney(value)}` : 'To answer'}</span>
          <span className="cs-turn-name">{team.name}</span>
        </span>
      </div>

      {teams.length > 1 && (
        <div className="cs-turn-chips">
          {teams.map((t, i) => {
            if (t.id === inPlayId) return null;
            const missed = missedIds.includes(t.id);
            return (
              <button
                key={t.id}
                type="button"
                className="cs-chip"
                data-missed={missed}
                style={vars(i)}
                disabled={locked}
                onClick={() => (missed ? onUndoMiss(t.id) : onSelect(t.id))}
                aria-label={missed ? `Undo wrong answer for ${t.name}` : `Switch to ${t.name}${i < 9 ? ` (key ${i + 1})` : ''}`}
                title={missed ? 'Undo' : `Switch to ${t.name}`}
              >
                <span className="cs-chip-av" aria-hidden="true">
                  {teamInitials(t.name)}
                </span>
                <span className="cs-chip-name">{t.name}</span>
                {i < 9 && <kbd aria-hidden="true">{i + 1}</kbd>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
