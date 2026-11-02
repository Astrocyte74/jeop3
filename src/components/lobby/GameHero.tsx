import { Play, Plus, Layers, Gauge, Clock, Trophy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { MiniBoard } from './MiniBoard';
import { ProgressRing } from './ProgressRing';
import { timeAgo, type GameSummary } from './gameInfo';

interface GameHeroProps {
  game: GameSummary | null;
  loading: boolean;
  onPlay: () => void;
  onCreate: () => void;
  createDisabled?: boolean;
}

const DIFFICULTY_LABEL: Record<string, string> = { easy: 'Easy', normal: 'Normal', hard: 'Hard' };

/** Preview of the selected game with the one big Play button. */
export function GameHero({ game, loading, onPlay, onCreate, createDisabled }: GameHeroProps) {
  if (loading) {
    return (
      <section className="lobby-panel lobby-hero" aria-busy="true">
        <div className="h-[176px] rounded-lg bg-white/5 animate-pulse" />
        <div className="mt-5 h-9 w-2/3 rounded bg-white/5 animate-pulse" />
        <div className="mt-3 h-4 w-1/2 rounded bg-white/5 animate-pulse" />
        <div className="mt-6 h-16 rounded-xl bg-white/5 animate-pulse" />
      </section>
    );
  }

  if (!game) {
    return (
      <section className="lobby-panel lobby-hero text-center">
        <p className="lobby-display text-3xl">No game selected</p>
        <p className="mt-2 text-sm text-white/60">Choose a board from the library, or make a new one.</p>
        <Button onClick={onCreate} disabled={createDisabled} className="lobby-play mt-6 w-full">
          <Plus className="size-5" />
          New game
        </Button>
      </section>
    );
  }

  const played = timeAgo(game.lastPlayed);
  const resume = game.status === 'inProgress';

  return (
    <section className="lobby-panel lobby-hero">
      <div key={game.id}>
        {game.categoryTitles.length > 0 ? (
          <MiniBoard game={game} variant="hero" />
        ) : (
          <div className="grid h-[176px] place-items-center rounded-lg border border-dashed border-white/15 text-sm text-white/50">
            This game has no categories yet
          </div>
        )}
      </div>

      <div className="mt-5 flex items-start gap-4">
        <div className="min-w-0 flex-1">
          <h2 className="lobby-display m-0 text-[2rem] leading-[1.05] line-clamp-2">{game.title}</h2>
          {game.subtitle && <p className="mt-1.5 text-sm text-white/65 line-clamp-2">{game.subtitle}</p>}
        </div>
        {game.status !== 'new' && <ProgressRing percent={game.percent} size={56} stroke={5} />}
      </div>

      <ul className="m-0 mt-4 flex list-none flex-wrap gap-x-5 gap-y-2 p-0 text-sm text-white/75">
        <li className="flex items-center gap-1.5">
          <Layers className="size-4 text-[var(--lb-accent)]" />
          {game.categoryTitles.length} categories, {game.clueCount} clues
        </li>
        {game.difficulty && (
          <li className="flex items-center gap-1.5">
            <Gauge className="size-4 text-[var(--lb-accent)]" />
            {DIFFICULTY_LABEL[game.difficulty] ?? game.difficulty}
          </li>
        )}
        <li className="flex items-center gap-1.5">
          <Clock className="size-4 text-[var(--lb-accent)]" />
          {played ? `Played ${played}` : 'Not played yet'}
        </li>
        {game.status !== 'new' && (
          <li className="flex items-center gap-1.5">
            <Trophy className="size-4 text-[var(--lb-accent)]" />
            {game.completed} of {game.clueCount} clues used
          </li>
        )}
      </ul>

      <Button onClick={onPlay} size="lg" className="lobby-play mt-6 w-full">
        <Play className="size-6 fill-current" />
        {resume ? 'Resume game' : 'Play'}
      </Button>
    </section>
  );
}
