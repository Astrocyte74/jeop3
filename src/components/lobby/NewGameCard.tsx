import { Plus } from 'lucide-react';

interface NewGameCardProps {
  onClick: () => void;
  disabled?: boolean;
}

/** First tile on the shelf: start the New Game wizard. */
export function NewGameCard({ onClick, disabled }: NewGameCardProps) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} className="lobby-card-new min-h-[11.5rem] w-full">
      <span className="grid size-12 place-items-center rounded-full bg-[var(--lb-accent)] text-[var(--lb-on-accent)] shadow-lg">
        <Plus className="size-6" strokeWidth={2.5} />
      </span>
      <span className="lobby-display text-xl">New game</span>
      <span className="text-xs text-white/55">Write one with AI or build your own</span>
    </button>
  );
}
