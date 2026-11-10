import type { CSSProperties } from 'react';
import type { Team } from '@/lib/storage';
import { teamColor, teamInitials } from '@/lib/teamColors';
import { AnimatedScore } from '@/components/board/AnimatedScore';
import { formatDelta } from '@/lib/money';

interface TeamDockProps {
  teams: Team[];
  /** The team answering right now (filled with its colour). */
  inPlayId: string | null;
  /** The team in play is stealing after another team missed. */
  steal: boolean;
  missedIds: string[];
  /** Teams can be tapped to switch who is answering (off for a Daily Double). */
  interactive: boolean;
  locked: boolean;
  onSelect: (teamId: string) => void;
  /** Tap a team that missed to take the miss back. */
  onUndoMiss: (teamId: string) => void;
  /** Provisional score changes from verdicts given on this screen, shown at once (the real score
   *  is applied on Continue). Keyed by team id. */
  deltas?: Record<string, number>;
}

/**
 * The scoreboard, kept at the bottom of the clue screen exactly as on the board: it shows whose turn it
 * is (filled card), everyone's score, and doubles as the team switcher. Same classes as the board's cards.
 */
export function TeamDock({ teams, inPlayId, steal, missedIds, interactive, locked, onSelect, onUndoMiss, deltas }: TeamDockProps) {
  return (
    <div className="cs-teams" role="group" aria-label="Teams and scores">
      <div className="flex items-center justify-center gap-3 flex-wrap">
        {teams.map((team, i) => {
          const c = teamColor(i);
          const inPlay = team.id === inPlayId;
          const missed = missedIds.includes(team.id);
          const style = { '--tc': c.main, '--tc-on': c.onMain, '--tc-soft': c.soft } as CSSProperties;
          const delta = deltas?.[team.id] ?? 0;
          const shown = team.score + delta;
          const disabled = !interactive || locked || (inPlay && !missed);
          return (
            <div
              key={team.id}
              className={`team-card relative rounded-xl border-2 ${inPlay ? 'is-active' : ''} ${missed ? 'is-missed' : ''} ${inPlay && steal ? 'is-pulse' : ''}`}
              style={style}
            >
              {inPlay && <span className={`team-tag ${steal ? 'team-tag--steal' : ''}`}>{steal ? 'Steal' : 'Answering'}</span>}
              {missed && !inPlay && <span className="team-tag">Missed</span>}
              {interactive && i < 9 && (
                <kbd className="team-key cs-hint-only" aria-hidden="true">
                  {i + 1}
                </kbd>
              )}
              {delta !== 0 && (
                <span key={delta} className="cs-delta" data-kind={delta > 0 ? 'gain' : 'loss'} role="status">
                  {formatDelta(delta)}
                </span>
              )}
              <button
                type="button"
                className="px-4 py-2.5 min-w-[160px] lg:min-w-[240px] w-full text-left flex items-center gap-3"
                disabled={disabled}
                onClick={() => (missed ? onUndoMiss(team.id) : onSelect(team.id))}
                aria-pressed={inPlay}
                aria-label={
                  inPlay
                    ? `${team.name} is answering`
                    : missed
                      ? `Undo wrong answer for ${team.name}`
                      : `Switch to ${team.name}${i < 9 ? ` (key ${i + 1})` : ''}`
                }
              >
                <span className="team-avatar" aria-hidden="true">
                  {teamInitials(team.name)}
                </span>
                <span className="min-w-0 block">
                  <span className="team-name block truncate text-slate-100">{team.name}</span>
                  <AnimatedScore
                    value={shown}
                    className={`team-score ${shown >= 0 ? 'text-green-400' : 'text-red-400'}`}
                  />
                </span>
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
