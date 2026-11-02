import type { ReactNode } from 'react';
import { Check } from 'lucide-react';
import { MiniBoard } from './MiniBoard';
import { ProgressRing } from './ProgressRing';
import { timeAgo, type GameSummary } from './gameInfo';

interface GameCardProps {
  game: GameSummary;
  selected: boolean;
  onSelect: () => void;
  /** The "..." menu, rendered over the cover */
  menu: ReactNode;
}

/** A box on the shelf: lit thumbnail, title, and progress. */
export function GameCard({ game, selected, onSelect, menu }: GameCardProps) {
  const played = timeAgo(game.lastPlayed);
  const statusText =
    game.status === 'done' ? 'Finished' : game.status === 'inProgress' ? `${game.completed}/${game.clueCount} played` : 'Not started';

  return (
    <div className={`lobby-card group relative ${selected ? 'is-selected' : ''}`}>
      <button
        type="button"
        onClick={onSelect}
        aria-pressed={selected}
        className="lobby-card-btn flex w-full flex-col text-left"
      >
        <div className="lobby-card-cover" style={{ ['--hue' as string]: game.hue }}>
          <MiniBoard game={game} variant="cover" />
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
          {game.status !== 'new' && <ProgressRing percent={game.percent} size={38} stroke={4} />}
        </div>
      </button>
      <div className="absolute right-2 top-2 opacity-70 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
        {menu}
      </div>
    </div>
  );
}
