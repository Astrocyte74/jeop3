import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
} from '@/components/ui/dropdown-menu';
import type { Game, GameState } from '@/lib/storage';
import { Home, Edit, MoreVertical, Sparkles, Palette, Image, Settings as SettingsIcon } from 'lucide-react';
import { themes, applyTheme, getStoredTheme, setIconSize, getIconSize, type ThemeKey, type IconSize } from '@/lib/themes';
import { useState, useEffect } from 'react';

interface GameBoardProps {
  game: Game;
  state: GameState;
  onOpenClue: (categoryId: number, clueIndex: number) => void;
  onExit: () => void;
  onToggleEditor: () => void;
  onToggleAIPreviewEditor?: () => void;
  onSetActiveTeam: (teamId: string) => void;
}

export function GameBoard({
  game,
  state,
  onOpenClue,
  onExit,
  onToggleEditor,
  onToggleAIPreviewEditor,
  onSetActiveTeam,
}: GameBoardProps) {
  const categories = game.categories || [];
  const rowCount = game.rows || categories[0]?.clues?.length || 5;
  const [currentTheme, setCurrentTheme] = useState<ThemeKey>(getStoredTheme());
  const [iconSize, setIconSizeState] = useState<IconSize>(getIconSize());

  const handleThemeChange = (themeKey: ThemeKey) => {
    setCurrentTheme(themeKey);
    applyTheme(themeKey);
  };

  const handleIconSizeChange = async (size: IconSize) => {
    setIconSizeState(size);
    setIconSize(size);
    // Re-initialize icon matcher with new size
    const { iconMatcher } = await import('@/lib/iconMatcher');
    // Force a reload of the icon matcher data
    (iconMatcher as any).loaded = false;
    await iconMatcher.load();
  };

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
          <DropdownMenuContent align="end" className="w-56">
            {/* Editor Options */}
            <DropdownMenuItem onClick={onToggleEditor}>
              <Edit className="w-4 h-4 mr-2 text-blue-400" />
              <span>Board Editor</span>
            </DropdownMenuItem>
            {onToggleAIPreviewEditor && (
              <DropdownMenuItem onClick={onToggleAIPreviewEditor}>
                <Sparkles className="w-4 h-4 mr-2 text-purple-400" />
                <span>AI Preview Editor</span>
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />

            {/* Settings Submenu */}
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <SettingsIcon className="w-4 h-4 mr-2" />
                <span>Settings</span>
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent sideOffset={5}>
                {/* Theme Submenu */}
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>
                    <Palette className="w-4 h-4 mr-2" />
                    <span>Theme</span>
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent sideOffset={5}>
                    {Object.entries(themes).map(([key, theme]) => (
                      <DropdownMenuItem
                        key={key}
                        onClick={() => handleThemeChange(key as ThemeKey)}
                        className={currentTheme === key ? 'bg-yellow-500/10' : ''}
                      >
                        <div
                          className="w-4 h-4 rounded mr-2"
                          style={{
                            background: `linear-gradient(135deg, ${theme.primary}, ${theme.secondary})`,
                          }}
                        />
                        <span>{theme.name}</span>
                        {currentTheme === key && (
                          <span className="ml-auto text-xs text-yellow-500">✓</span>
                        )}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuSubContent>
                </DropdownMenuSub>

                {/* Icon Size Submenu */}
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>
                    <Image className="w-4 h-4 mr-2" />
                    <span>Icon Size</span>
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent sideOffset={5}>
                    {(['128', '256', '512', '1024'] as IconSize[]).map((size) => (
                      <DropdownMenuItem
                        key={size}
                        onClick={() => handleIconSizeChange(size)}
                        className={iconSize === size ? 'bg-yellow-500/10' : ''}
                      >
                        <span className="mr-2">{size}px</span>
                        {iconSize === size && (
                          <span className="ml-auto text-xs text-yellow-500">✓</span>
                        )}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
              </DropdownMenuSubContent>
            </DropdownMenuSub>

            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onExit}>
              <Home className="w-4 h-4 mr-2" />
              <span>Main Menu</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Header with teams and title */}
      <div className="max-w-7xl mx-auto mb-8">
        <div className="flex items-center gap-8">
          {/* Scoreboard - top left */}
          <div className="bg-slate-900/80 backdrop-blur-sm border border-yellow-500/30 rounded-xl p-3">
            <div className="flex flex-col gap-2">
              {state.teams.map((team) => (
                <button
                  key={team.id}
                  onClick={() => onSetActiveTeam(team.id)}
                  className={`flex items-center gap-3 px-3 py-1.5 rounded-lg transition-all text-left ${
                    state.activeTeamId === team.id
                      ? 'bg-yellow-500/20 scale-105'
                      : 'hover:bg-slate-800/50'
                  }`}
                >
                  {/* Rank */}
                  <span className="text-xs font-semibold text-slate-500 w-4">
                    {state.teams.findIndex(t => t.id === team.id) + 1}
                  </span>

                  {/* Team name */}
                  <span className={`text-sm font-semibold min-w-[80px] ${
                    state.activeTeamId === team.id ? 'text-yellow-500' : 'text-slate-300'
                  }`}>
                    {team.name}
                  </span>

                  {/* Score */}
                  <span className={`text-lg font-black ml-auto ${
                    team.score >= 0 ? 'text-green-400' : 'text-red-400'
                  }`}>
                    ${team.score}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Title - center */}
          <div className="flex-1 text-center">
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
