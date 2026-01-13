import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { Game, GameState, Team } from '@/lib/storage';
import { Settings, Home, Edit, MoreVertical } from 'lucide-react';

interface GameBoardProps {
  game: Game;
  state: GameState;
  onOpenClue: (categoryId: number, clueIndex: number) => void;
  onExit: () => void;
  onToggleEditor: () => void;
  onUpdateTeamScore: (teamId: string, delta: number) => void;
  onSetActiveTeam: (teamId: string) => void;
}

export function GameBoard({
  game,
  state,
  onOpenClue,
  onExit,
  onToggleEditor,
  onUpdateTeamScore,
  onSetActiveTeam,
}: GameBoardProps) {
  const categories = game.categories || [];
  const rowCount = game.rows || categories[0]?.clues?.length || 5;

  // Calculate grid columns for teams
  const teamCount = state.teams.length;
  const teamGridCols = teamCount <= 2 ? 1 : teamCount <= 4 ? 2 : 3;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-4 relative">
      {/* Menu dropdown - top right, absolute positioned */}
      <div className="absolute top-4 right-4 z-10">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="border-slate-700 bg-slate-900/50">
              <MoreVertical className="w-5 h-5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem onClick={onToggleEditor}>
              <Edit className="w-4 h-4 mr-2" />
              Editor Mode
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onExit}>
              <Home className="w-4 h-4 mr-2" />
              Main Menu
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Header with teams and title */}
      <div className="max-w-7xl mx-auto mb-8">
        <div className="flex items-center gap-8">
          {/* Teams - top left, grid layout */}
          <div
            className="grid gap-2"
            style={{
              gridTemplateColumns: `repeat(${teamGridCols}, 1fr)`,
              gridTemplateRows: `repeat(${Math.ceil(teamCount / teamGridCols)}, auto)`,
            }}
          >
            {state.teams.map((team) => (
              <button
                key={team.id}
                onClick={() => onSetActiveTeam(team.id)}
                className={`px-3 py-2 rounded-lg border-2 text-left transition-all min-w-[120px] ${
                  state.activeTeamId === team.id
                    ? 'bg-yellow-500/20 border-yellow-500 shadow-lg shadow-yellow-500/20'
                    : 'bg-slate-800/50 border-slate-700 hover:border-slate-600'
                }`}
              >
                <div className="font-medium text-sm text-slate-200">{team.name}</div>
                <div className={`text-xl font-black ${team.score >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  ${team.score}
                </div>
              </button>
            ))}
          </div>

          {/* Title - center */}
          <div className="flex-1 text-center pr-16">
            <h1 className="text-3xl md:text-4xl font-black text-yellow-500" style={{ textShadow: '0 4px 12px rgba(0,0,0,0.5)' }}>
              {game.title}
            </h1>
            {game.subtitle && (
              <p className="text-sm md:text-base text-slate-300 font-medium">{game.subtitle}</p>
            )}
          </div>
        </div>
      </div>

      {/* Game board */}
      <div className="max-w-7xl mx-auto">
        <div className="board-wrap">
          <div
            className="game-board"
            style={{
              gridTemplateColumns: `repeat(${categories.length}, 1fr)`,
            }}
          >
            {/* Category headers */}
            {categories.map((category) => (
              <div
                key={category.title}
                className="cell cell-header"
              >
                {category.title}
              </div>
            ))}

            {/* Clue cells */}
            {Array.from({ length: rowCount }).map((_, rowIndex) =>
              categories.map((category, categoryIndex) => {
                const clue = category.clues?.[rowIndex];
                const clueId = `${categoryIndex}:${rowIndex}`;
                const used = Boolean(state.used[clueId]);

                if (!clue) {
                  return (
                    <div
                      key={`${categoryIndex}-${rowIndex}`}
                      className="cell"
                    />
                  );
                }

                return (
                  <div key={`${categoryIndex}-${rowIndex}`} className="cell">
                    <button
                      onClick={() => !used && onOpenClue(categoryIndex, rowIndex)}
                      disabled={used}
                      className="clue-btn"
                    >
                      ${clue.value}
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
