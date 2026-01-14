import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
import { Home, Edit, Sparkles, Palette, Image, Settings as SettingsIcon, RotateCcw, Check, X } from 'lucide-react';
import { themes, applyTheme, getStoredTheme, setIconSize, getIconSize, type ThemeKey, type IconSize } from '@/lib/themes';
import { getAIApiBase } from '@/lib/ai/service';
import { getModelStats, formatTime, getModelsBySpeed } from '@/lib/ai/stats';
import { useState, useEffect } from 'react';
import { useAuth } from '@clerk/clerk-react';

interface GameBoardProps {
  game: Game;
  state: GameState;
  onOpenClue: (categoryId: number, clueIndex: number) => void;
  onExit: () => void;
  onToggleEditor: () => void;
  onToggleAIPreviewEditor?: () => void;
  onSetActiveTeam: (teamId: string) => void;
  onResetBoard?: () => void;
  onUpdateTeamName?: (teamId: string, name: string) => void;
}

export function GameBoard({
  game,
  state,
  onOpenClue,
  onExit,
  onToggleEditor,
  onToggleAIPreviewEditor,
  onSetActiveTeam,
  onResetBoard,
  onUpdateTeamName,
}: GameBoardProps) {
  // Clerk auth
  const { isSignedIn } = useAuth();

  const categories = game.categories || [];
  const rowCount = game.rows || categories[0]?.clues?.length || 5;
  const [currentTheme, setCurrentTheme] = useState<ThemeKey>(getStoredTheme());
  const [iconSize, setIconSizeState] = useState<IconSize>(getIconSize());
  const [editingTeamId, setEditingTeamId] = useState<string | null>(null);
  const [editingTeamName, setEditingTeamName] = useState('');
  const [aiModel, setAIModel] = useState<string>('or:google/gemini-2.5-flash-lite');
  const [availableModels, setAvailableModels] = useState<Array<{id: string; name: string; provider: string}>>([]);

  // Load available models on mount
  useEffect(() => {
    const apiBase = getAIApiBase();
    fetch(`${apiBase}/health`)
      .then(res => res.json())
      .then(data => {
        if (data.models) {
          setAvailableModels(data.models);
          // Set default to first model if none selected
          const stored = localStorage.getItem('jeop3:aiModel');
          if (stored && data.models.find((m: any) => m.id === stored)) {
            setAIModel(stored);
          } else if (data.models.length > 0) {
            setAIModel(data.models[0].id);
          }
        }
      })
      .catch(() => {
        // Silent fail - AI features will be disabled
        if (import.meta.env.DEV) {
          console.warn('AI server not available - AI features disabled');
        }
      });
  }, []);

  const handleThemeChange = (themeKey: ThemeKey) => {
    setCurrentTheme(themeKey);
    applyTheme(themeKey);
  };

  const handleAIModelChange = (modelId: string) => {
    setAIModel(modelId);
    localStorage.setItem('jeop3:aiModel', modelId);
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

  const handleStartEditingTeam = (teamId: string, currentName: string) => {
    setEditingTeamId(teamId);
    setEditingTeamName(currentName);
  };

  const handleSaveTeamName = () => {
    if (editingTeamId && onUpdateTeamName) {
      onUpdateTeamName(editingTeamId, editingTeamName);
    }
    setEditingTeamId(null);
    setEditingTeamName('');
  };

  const handleCancelEditingTeam = () => {
    setEditingTeamId(null);
    setEditingTeamName('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSaveTeamName();
    } else if (e.key === 'Escape') {
      handleCancelEditingTeam();
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-4 relative">
      {/* Menu dropdown - top right, absolute positioned */}
      <div className="absolute top-4 right-4 z-10 flex gap-2">
        {/* Home button */}
        <Button variant="outline" size="sm" className="border-slate-700 bg-slate-900/50" onClick={onExit}>
          <Home className="w-5 h-5" />
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="border-slate-700 bg-slate-900/50">
              <SettingsIcon className="w-5 h-5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            {/* Editor Options */}
            {isSignedIn && (
              <DropdownMenuItem onClick={onToggleEditor}>
                <Edit className="w-4 h-4 mr-2 text-blue-400" />
                <span>Board Editor</span>
              </DropdownMenuItem>
            )}
            {onToggleAIPreviewEditor && isSignedIn && (
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

                {/* AI Model Submenu - only for signed in users */}
                {isSignedIn && (
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>
                    <Sparkles className="w-4 h-4 mr-2" />
                    <span>AI Model</span>
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent sideOffset={5} className="max-h-80 overflow-y-auto">
                    {availableModels.length === 0 ? (
                      <DropdownMenuItem disabled>
                        <span className="text-slate-500 text-xs">No models available</span>
                      </DropdownMenuItem>
                    ) : (
                      <>
                        {/* OpenRouter section */}
                        <DropdownMenuSub>
                          <DropdownMenuSubTrigger>
                            <span className="text-blue-400 mr-2">🤖</span>
                            <span>OpenRouter</span>
                          </DropdownMenuSubTrigger>
                          <DropdownMenuSubContent sideOffset={5} className="max-h-80 overflow-y-auto w-56">
                            {availableModels.filter(m => m.provider === 'openrouter').map((model) => {
                              const stats = getModelStats(model.id);
                              return (
                                <DropdownMenuItem
                                  key={model.id}
                                  onClick={() => handleAIModelChange(model.id)}
                                  className={aiModel === model.id ? 'bg-yellow-500/10' : ''}
                                >
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2">
                                      <span className="truncate">{model.name}</span>
                                      {aiModel === model.id && (
                                        <span className="text-xs text-yellow-500 flex-shrink-0">✓</span>
                                      )}
                                    </div>
                                    {stats && (
                                      <div className="text-xs text-slate-500 mt-0.5">
                                        {formatTime(stats.averageTimeMs)} avg • {stats.count} use{stats.count > 1 ? 's' : ''}
                                      </div>
                                    )}
                                  </div>
                                </DropdownMenuItem>
                              );
                            })}
                          </DropdownMenuSubContent>
                        </DropdownMenuSub>

                        {/* Ollama section */}
                        <DropdownMenuSub>
                          <DropdownMenuSubTrigger>
                            <span className="text-green-400 mr-2">🦙</span>
                            <span>Ollama</span>
                          </DropdownMenuSubTrigger>
                          <DropdownMenuSubContent sideOffset={5} className="max-h-80 overflow-y-auto w-56">
                            {availableModels.filter(m => m.provider === 'ollama').map((model) => {
                              const stats = getModelStats(model.id);
                              return (
                                <DropdownMenuItem
                                  key={model.id}
                                  onClick={() => handleAIModelChange(model.id)}
                                  className={aiModel === model.id ? 'bg-yellow-500/10' : ''}
                                >
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2">
                                      <span className="truncate">{model.name}</span>
                                      {aiModel === model.id && (
                                        <span className="text-xs text-yellow-500 flex-shrink-0">✓</span>
                                      )}
                                    </div>
                                    {stats && (
                                      <div className="text-xs text-slate-500 mt-0.5">
                                        {formatTime(stats.averageTimeMs)} avg • {stats.count} use{stats.count > 1 ? 's' : ''}
                                      </div>
                                    )}
                                  </div>
                                </DropdownMenuItem>
                              );
                            })}
                          </DropdownMenuSubContent>
                        </DropdownMenuSub>

                        <DropdownMenuSeparator />

                        {/* Current selection with stats */}
                        <DropdownMenuItem disabled className="focus:bg-transparent">
                          <div className="flex-1 min-w-0">
                            <div className="text-xs text-slate-500">
                              Selected: {availableModels.find(m => m.id === aiModel)?.provider === 'ollama' ? '🦙' : '🤖'} {availableModels.find(m => m.id === aiModel)?.name || 'None'}
                            </div>
                            {(() => {
                              const stats = aiModel ? getModelStats(aiModel) : null;
                              const fastestModel = getModelsBySpeed()[0];
                              return (
                                <div className="flex items-center gap-2 mt-0.5">
                                  {stats && (
                                    <span className="text-xs text-slate-600">
                                      Avg: {formatTime(stats.averageTimeMs)} • {stats.count} generated
                                    </span>
                                  )}
                                  {fastestModel && fastestModel.modelId === aiModel && (
                                    <span className="text-xs text-green-500">⚡ Fastest</span>
                                  )}
                                </div>
                              );
                            })()}
                          </div>
                        </DropdownMenuItem>
                      </>
                    )}
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
                )}
              </DropdownMenuSubContent>
            </DropdownMenuSub>

            <DropdownMenuSeparator />
            {onResetBoard && (
              <DropdownMenuItem onClick={onResetBoard}>
                <RotateCcw className="w-4 h-4 mr-2 text-orange-400" />
                <span>Reset Board</span>
              </DropdownMenuItem>
            )}
            <DropdownMenuItem onClick={onExit}>
              <Home className="w-4 h-4 mr-2" />
              <span>Main Menu</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Header with teams and title */}
      <div className="max-w-7xl mx-auto mb-12">
        <div className="relative">
          {/* Title - centered */}
          <div className="text-center pr-12">
            <h1 className="text-3xl md:text-4xl font-black text-yellow-500" style={{ textShadow: '0 4px 12px rgba(0,0,0,0.5)' }}>
              {game.title}
            </h1>
            {game.subtitle && (
              <p className="text-sm md:text-base text-slate-300 font-medium">{game.subtitle}</p>
            )}
          </div>

          {/* Scoreboard - absolute top left */}
          <div className="absolute top-0 left-0 bg-slate-900/50 backdrop-blur-sm rounded-lg p-1.5">
            <div className="grid grid-cols-2 gap-x-1.5 gap-y-0.5">
              {state.teams.map((team) => (
                <div
                  key={team.id}
                  className={`flex items-center gap-1 px-1 py-0.5 rounded transition-all text-left relative group ${
                    state.activeTeamId === team.id
                      ? 'bg-yellow-500/20'
                      : 'hover:bg-slate-800/50'
                  } ${editingTeamId === team.id ? 'ring-1 ring-yellow-500' : ''}`}
                >
                  {/* Rank */}
                  <span className="text-xs font-semibold text-slate-500 w-3 flex-shrink-0">
                    {state.teams.findIndex(t => t.id === team.id) + 1}
                  </span>

                  {/* Team name - editable or display */}
                  {editingTeamId === team.id ? (
                    <div className="flex items-center gap-0.5 flex-1 min-w-0">
                      <Input
                        value={editingTeamName}
                        onChange={(e) => setEditingTeamName(e.target.value)}
                        onKeyDown={handleKeyDown}
                        onBlur={handleSaveTeamName}
                        className="text-xs font-semibold leading-tight bg-slate-800 border-slate-600 px-1 py-0 h-auto min-h-[20px] max-w-[140px]"
                        autoFocus
                        autoComplete="off"
                      />
                      <button
                        onClick={handleSaveTeamName}
                        className="w-4 h-4 flex items-center justify-center bg-green-500/20 hover:bg-green-500/40 text-green-500 rounded flex-shrink-0"
                      >
                        <Check className="w-3 h-3" />
                      </button>
                      <button
                        onClick={handleCancelEditingTeam}
                        className="w-4 h-4 flex items-center justify-center bg-red-500/20 hover:bg-red-500/40 text-red-500 rounded flex-shrink-0"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => onSetActiveTeam(team.id)}
                      onDoubleClick={() => onUpdateTeamName && handleStartEditingTeam(team.id, team.name)}
                      className={`text-xs font-semibold leading-tight line-clamp-2 max-w-[140px] text-left ${
                        state.activeTeamId === team.id ? 'text-yellow-500' : 'text-slate-300'
                      }`}
                    >
                      {team.name}
                    </button>
                  )}

                  {/* Score */}
                  <span className={`text-sm font-black ml-auto flex-shrink-0 ${
                    team.score >= 0 ? 'text-green-400' : 'text-red-400'
                  }`}>
                    ${team.score}
                  </span>

                  {/* Edit button - shown on hover when not editing */}
                  {onUpdateTeamName && editingTeamId !== team.id && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleStartEditingTeam(team.id, team.name);
                      }}
                      className="absolute top-0.5 right-12 w-4 h-4 flex items-center justify-center bg-slate-700 hover:bg-slate-600 text-slate-400 hover:text-slate-300 rounded opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
                    >
                      <Edit className="w-2.5 h-2.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>
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
