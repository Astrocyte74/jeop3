import { Users, Dice1, Sparkles, Trash2, MoreVertical, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { Team } from '@/lib/storage';
import { teamColor, teamInitials } from '@/lib/teamColors';

interface TeamRosterProps {
  teams: Team[];
  loading: boolean;
  aiAvailable: boolean;
  maxTeams?: number;
  onRename: (id: string, name: string) => void;
  onRemove: (id: string) => void;
  onAdd: () => void;
  onGenerateAll: () => void;
  onGenerateName: (index: number) => void;
  onEnhanceName: (index: number) => void;
}

/** Who is playing: one coloured chip per team, using the same colours as the scoreboard. */
export function TeamRoster({
  teams,
  loading,
  aiAvailable,
  maxTeams = 4,
  onRename,
  onRemove,
  onAdd,
  onGenerateAll,
  onGenerateName,
  onEnhanceName,
}: TeamRosterProps) {
  return (
    <section
      aria-busy={loading}
      className={`lobby-panel transition-opacity duration-300 ${loading ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}
    >
      <div className="mb-3 flex items-center justify-between">
        <h2 className="m-0 flex items-center gap-2 text-base font-semibold">
          <Users className="size-4 text-[var(--lb-accent)]" />
          Teams
        </h2>
        {aiAvailable && (
          <Button
            onClick={onGenerateAll}
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs text-[var(--lb-accent)] hover:bg-white/10 hover:text-[var(--lb-accent)]"
            title="Generate names for all teams"
          >
            <Dice1 className="size-3.5" />
            Generate All
          </Button>
        )}
      </div>

      <div className="flex max-h-[15.5rem] flex-col gap-2 overflow-y-auto pr-1">
        {teams.map((team, index) => {
          const color = teamColor(index);
          return (
            <div
              key={team.id}
              className="flex items-center gap-2.5 rounded-xl border border-white/10 bg-black/20 py-1.5 pl-1.5 pr-1 transition-colors focus-within:border-white/30"
              style={{ boxShadow: `inset 3px 0 0 ${color.main}` }}
            >
              <span
                aria-hidden="true"
                className="lobby-display grid size-9 shrink-0 place-items-center rounded-full text-base"
                style={{ background: color.main, color: color.onMain }}
              >
                {teamInitials(team.name)}
              </span>
              <Input
                value={team.name}
                aria-label={`Team ${index + 1} name`}
                onChange={(e) => onRename(team.id, e.target.value)}
                className="h-9 flex-1 border-transparent bg-transparent px-1 text-[15px] font-medium shadow-none focus-visible:ring-0 dark:bg-transparent"
              />
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label={`Options for ${team.name || `team ${index + 1}`}`}
                    className="size-8 p-0 text-white/60 hover:bg-white/10 hover:text-white"
                  >
                    <MoreVertical className="size-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  {aiAvailable && (
                    <>
                      <DropdownMenuItem onClick={() => onGenerateName(index)}>
                        <Dice1 className="mr-2 size-4 text-yellow-400" />
                        <span>Generate Random Name</span>
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => onEnhanceName(index)}>
                        <Sparkles className="mr-2 size-4 text-purple-400" />
                        <span>Enhance Name</span>
                      </DropdownMenuItem>
                    </>
                  )}
                  {teams.length > 1 && (
                    <DropdownMenuItem onClick={() => onRemove(team.id)} className="text-red-400 focus:text-red-300">
                      <Trash2 className="mr-2 size-4" />
                      <span>Remove Team</span>
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          );
        })}
      </div>

      <button
        type="button"
        onClick={onAdd}
        disabled={teams.length >= maxTeams}
        className="mt-2 flex h-10 w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-white/20 text-sm text-white/70 transition-colors hover:border-white/40 hover:bg-white/5 hover:text-white disabled:pointer-events-none disabled:opacity-40"
      >
        <Plus className="size-4" />
        Add Team ({teams.length}/{maxTeams})
      </button>
    </section>
  );
}
