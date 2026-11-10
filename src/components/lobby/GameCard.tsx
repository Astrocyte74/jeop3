import type { ReactNode } from 'react';
import { Check } from 'lucide-react';
import { MiniBoard } from './MiniBoard';
import { timeAgo, type GameSummary } from './gameInfo';

interface GameCardProps {
  game: GameSummary;
  selected: boolean;
  onSelect: () => void;
  /** Double-click (or Enter on the focused card) starts the game. */
  onPlay?: () => void;
  /** The "..." menu, rendered over the cover */
  menu: ReactNode;
}

/** A box on the shelf: lit thumbnail, title, and progress. */
export function GameCard({ game, selected, onSelect, onPlay, menu }: GameCardProps) {
  const played = timeAgo(game.lastPlayed);
  const statusText =
    game.status === 'done' ? 'Finished' : game.status === 'inProgress' ? `${game.completed}/${game.clueCount} played` : 'Not started';

  return (
    <div className={`lobby-card group relative ${selected ? 'is-selected' : ''}`}>
      <button
        type="button"
        onClick={onSelect}
        onDoubleClick={onPlay}
        title={onPlay ? 'Click to select · double-click to play' : undefined}
        aria-pressed={selected}
        className="lobby-card-btn flex w-full flex-col text-left"
      >
        <div className="lobby-card-cover" style={{ ['--hue' as string]: game.hue }}>
          {game.categoryTitles.length > 0 && (
            <ul className="lobby-cover-cats" aria-label="Categories">
              {game.categoryTitles.slice(0, 3).map((title, i) => (
                <li key={`${i}-${title}`} title={title}>{title}</li>
              ))}
              {game.categoryTitles.length > 3 && <li className="lobby-cover-more">+{game.categoryTitles.length - 3}</li>}
            </ul>
          )}
          <MiniBoard game={game} variant="cover" />
          {game.status !== 'new' && (
            <div
              className="lobby-card-bar"
              role="progressbar"
              aria-label="Progress"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(game.percent)}
            >
              <span style={{ width: `${Math.max(game.status === 'done' ? 100 : game.percent, 2)}%` }} />
            </div>
          )}
          {selected && (
            <span className="absolute left-2 top-2 grid size-6 place-items-center rounded-full bg-[var(--lb-accent)] text-[var(--lb-on-accent)] shadow">
              <Check className="size-3.5" strokeWidth={3} />
            </span>
          )}
        </div>
        <div className="flex flex-1 items-start gap-2 px-3.5 pb-3.5 pt-3">
          <div className="min-w-0 flex-1">
            <div className="lobby-display text-[1.2rem] leading-[1.1] line-clamp-2">{game.title}</div>
            <div className="mt-1 text-xs text-white/60 line-clamp-1">{game.subtitle || `${game.clueCount} clues`}</div>
            <div className="mt-2 text-xs text-white/50">
              {game.status === 'new' ? 'Not started' : statusText}
              {played ? `, ${played}` : ''}
            </div>
          </div>
        </div>
      </button>
      <div className="absolute right-2 top-2 opacity-70 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
        {menu}
      </div>
    </div>
  );
}
