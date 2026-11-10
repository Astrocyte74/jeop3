import { Star } from 'lucide-react';
import type { HostCommand, HostSnapshot } from '@/lib/hostLink/protocol';
import { formatMoney } from '@/lib/money';

type Game = NonNullable<HostSnapshot['game']>;

/** Pick the next clue from the host window. Daily Doubles carry a marker that only the host sees. */
export function HostBoard({ game, send }: { game: Game; send: (command: HostCommand) => void }) {
  const { board } = game;
  const pick = game.teams.find((t) => t.id === game.activeTeamId);
  return (
    <section className="host-board-wrap" aria-label="Board">
      <p className="host-pick">
        {pick ? <><strong>{pick.name}</strong> picks next.</> : 'Pick a clue.'}{' '}
        <span className="host-muted">{game.cluesLeft} {game.cluesLeft === 1 ? 'clue' : 'clues'} left · <Star className="host-dd-key" aria-hidden="true" /> Daily Double (only you can see this)</span>
      </p>
      <div className="host-board" style={{ gridTemplateColumns: `repeat(${board.categories.length}, minmax(0, 1fr))` }}>
        {board.categories.map((cat) => (
          <div key={cat.title} className="host-cat">{cat.title}</div>
        ))}
        {Array.from({ length: board.rows }).map((_, r) =>
          board.categories.map((cat, c) => {
            const tile = cat.clues[r];
            if (!tile) return <div key={`${c}-${r}`} className="host-tile host-tile--none" />;
            return (
              <button
                key={`${c}-${r}`}
                type="button"
                className="host-tile"
                data-used={tile.used}
                data-dd={tile.dailyDouble}
                disabled={tile.used}
                onClick={() => send({ type: 'openClue', c, r })}
                aria-label={`${cat.title} for ${formatMoney(tile.value)}${tile.dailyDouble ? ', Daily Double' : ''}${tile.used ? ' (played)' : ''}`}
              >
                {tile.used ? '' : formatMoney(tile.value)}
                {tile.dailyDouble && !tile.used && <Star className="host-dd-mark" aria-hidden="true" />}
              </button>
            );
          }),
        )}
      </div>
    </section>
  );
}
