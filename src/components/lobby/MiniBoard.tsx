import type { GameSummary } from './gameInfo';

interface MiniBoardProps {
  game: GameSummary;
  /** `hero` shows category titles and values; `cover` is the abstract card thumbnail */
  variant?: 'hero' | 'cover';
}

/** A tiny lit copy of the board. Played clues go dark, so progress reads at a glance. */
export function MiniBoard({ game, variant = 'hero' }: MiniBoardProps) {
  const cols = Math.max(1, game.categoryTitles.length || (variant === 'cover' ? 5 : 1));
  const rows = Math.max(1, game.rows || 5);
  const hero = variant === 'hero';
  const shown = hero ? rows : Math.min(rows, 4);

  return (
    <div
      className={hero ? 'lobby-miniboard lobby-miniboard-hero' : 'lobby-miniboard lobby-miniboard-cover'}
      style={{
        gridTemplateColumns: `repeat(${Math.min(cols, 8)}, minmax(0, 1fr))`,
        ['--hue' as string]: game.hue,
      }}
      aria-hidden="true"
    >
      {Array.from({ length: Math.min(cols, 8) }).map((_, c) => (
        <div
          key={`h${c}`}
          className="lobby-mini-head"
          style={{ animationDelay: `${c * 35}ms` }}
        >
          {hero ? <span>{game.categoryTitles[c] ?? ''}</span> : null}
        </div>
      ))}
      {Array.from({ length: shown }).map((_, r) =>
        Array.from({ length: Math.min(cols, 8) }).map((__, c) => {
          const isUsed = Boolean(game.used[`${c}:${r}`]);
          return (
            <div
              key={`${c}:${r}`}
              className={`lobby-mini-tile ${isUsed ? 'is-used' : ''}`}
              style={{ animationDelay: `${c * 35 + (r + 1) * 45}ms` }}
            >
              {hero && !isUsed && game.rowValues[r] != null ? game.rowValues[r] : ''}
            </div>
          );
        }),
      )}
    </div>
  );
}
