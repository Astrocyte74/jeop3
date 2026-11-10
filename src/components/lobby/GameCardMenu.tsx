import { MoreVertical, Play, Edit, Info, Download, RotateCcw, Trash2, EyeOff, Eye } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface GameCardMenuProps {
  onOpen: () => void;
  onPlay: () => void;
  onEditBoard: () => void;
  /** Omit when the game has no metadata to show */
  onInfo?: () => void;
  onExport: () => void;
  onReset: () => void;
  /** Hidden games leave the library shelf (nothing is deleted) and live under the Hidden filter. */
  hidden?: boolean;
  onToggleHidden?: () => void;
  /** Only provided for custom games */
  onDelete?: () => void;
}

/** The per-game "..." menu. Handlers are owned by MainMenu. */
export function GameCardMenu({ onOpen, onPlay, onEditBoard, onInfo, onExport, onReset, hidden = false, onToggleHidden, onDelete }: GameCardMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          aria-label="Game options"
          className="size-8 p-0 bg-black/45 text-white/80 backdrop-blur-sm hover:bg-black/70 hover:text-white"
          onClick={(e) => {
            e.stopPropagation();
            onOpen();
          }}
        >
          <MoreVertical className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuItem onClick={onPlay}>
          <Play className="mr-2 size-4 text-green-400" />
          <span>Play Game</span>
        </DropdownMenuItem>

        <DropdownMenuItem onClick={onEditBoard}>
          <Edit className="mr-2 size-4 text-blue-400" />
          <span>Edit game</span>
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        {onInfo && (
          <DropdownMenuItem onClick={onInfo}>
            <Info className="mr-2 size-4 text-blue-400" />
            <span>Game Info</span>
          </DropdownMenuItem>
        )}

        <DropdownMenuSeparator />

        <DropdownMenuItem onClick={onExport}>
          <Download className="mr-2 size-4 text-green-400" />
          <span>Export</span>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onReset}>
          <RotateCcw className="mr-2 size-4 text-orange-400" />
          <span>Reset Progress</span>
        </DropdownMenuItem>

        {onToggleHidden && (
          <DropdownMenuItem onClick={onToggleHidden}>
            {hidden ? <Eye className="mr-2 size-4 text-sky-400" /> : <EyeOff className="mr-2 size-4 text-slate-400" />}
            <span>{hidden ? 'Unhide' : 'Hide from library'}</span>
          </DropdownMenuItem>
        )}

        {onDelete && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onDelete} className="text-red-400 focus:text-red-300">
              <Trash2 className="mr-2 size-4" />
              <span>Delete Game</span>
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
