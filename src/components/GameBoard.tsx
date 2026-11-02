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
import { type GameMode } from '@/components/GameModeMenu';
import { GameRulesMenu } from '@/components/GameRulesMenu';
import type { Game, GameState } from '@/lib/storage';
import { Home, Edit, Sparkles, Palette, Image, Settings as SettingsIcon, RotateCcw, Check, X, MoreVertical, Wand2, Plus, Minus, Gamepad2, Volume2, VolumeX, Trophy, Eye, Undo2 } from 'lucide-react';
import { themes, applyTheme, getStoredTheme, setIconSize, getIconSize, type ThemeKey, type IconSize } from '@/lib/themes';
import { getAIApiBase } from '@/lib/ai/service';
import { getModelStats, formatTime, getModelsBySpeed } from '@/lib/ai/stats';
import { useAIGeneration } from '@/lib/ai/hooks';
import { useState, useEffect, useRef, useMemo } from 'react';
import { useAuth } from '@/lib/auth';
import { teamColor, teamInitials } from '@/lib/teamColors';
import { playSfx, isSfxMuted, setSfxMuted } from '@/lib/sfx';
import { AnimatedScore } from '@/components/board/AnimatedScore';
import { prefersReducedMotion } from '@/components/board/useReducedMotion';
import { EndGame } from '@/components/EndGame';

// Games whose opening reveal already played this session (so returning from the editor doesn't replay it)
const revealedGames = new Set<string>();
const REVEAL_MS = 2800;

interface GameBoardProps {
  game: Game;
  state: GameState;
  onOpenClue: (categoryId: number, clueIndex: number) => void;
  onExit: () => void;
  onToggleEditor: () => void;
  onToggleAIPreviewEditor?: () => void;
  /** The game has a Final Jeopardy clue that hasn't been played yet. */
  finalAvailable?: boolean;
  onStartFinal?: () => void;
  /** Undo the last settled clue (restores scores, used tiles and whose pick it was). */
  canUndo?: boolean;
  onUndo?: () => void;
  onSetActiveTeam: (teamId: string) => void;
  onResetBoard?: () => void;
  onUpdateTeamName?: (teamId: string, name: string) => void;
  onUpdateTeamScore?: (teamId: string, score: number) => void;
  onAddTeam?: (name: string) => void;
  onRemoveTeam?: (teamId: string) => void;
}

export function GameBoard({
  game,
  state,
  onOpenClue,
  onExit,
  onToggleEditor,
  onToggleAIPreviewEditor,
  finalAvailable = false,
  onStartFinal,
  canUndo = false,
  onUndo,
  onSetActiveTeam,
  onResetBoard,
  onUpdateTeamName,
  onUpdateTeamScore,
  onAddTeam,
  onRemoveTeam,
}: GameBoardProps) {
  // Clerk auth
  const { isSignedIn } = useAuth();

  const categories = game.categories || [];
  const rowCount = game.rows || categories[0]?.clues?.length || 5;
  const [currentTheme, setCurrentTheme] = useState<ThemeKey>(getStoredTheme());
  const [iconSize, setIconSizeState] = useState<IconSize>(getIconSize());
  const [editingTeamId, setEditingTeamId] = useState<string | null>(null);
  const [editingTeamName, setEditingTeamName] = useState('');
  const [editingScoreTeamId, setEditingScoreTeamId] = useState<string | null>(null);
  const [editingScoreValue, setEditingScoreValue] = useState<string>('');
  const [aiOperationTeamId, setAiOperationTeamId] = useState<string | null>(null);
  const [addTeamDialogOpen, setAddTeamDialogOpen] = useState(false);
  const [newTeamName, setNewTeamName] = useState('');
  const [removeTeamDialogOpen, setRemoveTeamDialogOpen] = useState(false);
  const [teamToRemove, setTeamToRemove] = useState<string | null>(null);
  const [aiModel, setAIModel] = useState<string>('or:google/gemini-2.5-flash-lite');
  const [availableModels, setAvailableModels] = useState<Array<{id: string; name: string; provider: string}>>([]);
  const [gameMode, setGameMode] = useState<GameMode>(() => (localStorage.getItem('gameMode') as GameMode) || 'regular');
  const [sfxMuted, setSfxMutedState] = useState<boolean>(() => isSfxMuted());

  // Board progress, derived purely from saved state
  const { totalClues, usedCount, pointsPlayed } = useMemo(() => {
    let total = 0;
    let used = 0;
    let points = 0;
    categories.forEach((category, ci) => {
      (category.clues || []).forEach((clue, ri) => {
        if (!clue) return;
        total += 1;
        if (state.used[`${ci}:${ri}`]) {
          used += 1;
          points += clue.value;
        }
      });
    });
    return { totalClues: total, usedCount: used, pointsPlayed: points };
  }, [categories, state.used]);
  const allPlayed = totalClues > 0 && usedCount >= totalClues;

  // Start-of-game reveal: only on a fresh board, once per session, never under reduced motion
  const [revealing, setRevealing] = useState(
    () => usedCount === 0 && totalClues > 0 && !prefersReducedMotion() && !revealedGames.has(game.title),
  );
  const prevUsedCount = useRef(usedCount);
  useEffect(() => {
    // Board was reset (Play again / Reset Board): play the reveal again
    if (prevUsedCount.current > 0 && usedCount === 0 && !prefersReducedMotion()) setRevealing(true);
    prevUsedCount.current = usedCount;
  }, [usedCount]);
  useEffect(() => {
    if (!revealing) return;
    revealedGames.add(game.title);
    playSfx('whoosh');
    const t = window.setTimeout(() => setRevealing(false), REVEAL_MS);
    return () => window.clearTimeout(t);
  }, [revealing, game.title]);

  // Finale: shows when every clue is played; "View board" dismisses it until the board is reset
  const [finaleDismissed, setFinaleDismissed] = useState(false);
  // With an unplayed Final Jeopardy the finale waits: the board shows a call to action instead
  const [finalPromptDismissed, setFinalPromptDismissed] = useState(false);
  const finalPending = allPlayed && finalAvailable && !!game.finalJeopardy && !!onStartFinal;
  useEffect(() => {
    if (!allPlayed) {
      setFinaleDismissed(false);
      setFinalPromptDismissed(false);
    }
  }, [allPlayed]);
  const showFinale = allPlayed && !finalPending && !finaleDismissed;
  const showFinalPrompt = finalPending && !finalPromptDismissed;
  const reducedMotion = prefersReducedMotion();

  // AI generation hook
  const { generate: generateAI } = useAIGeneration();

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

  const handleStartEditingScore = (teamId: string, currentScore: number) => {
    setEditingScoreTeamId(teamId);
    setEditingScoreValue(currentScore.toString());
  };

  const handleSaveScore = () => {
    if (editingScoreTeamId && onUpdateTeamScore) {
      const newScore = parseInt(editingScoreValue, 10);
      if (!isNaN(newScore)) {
        onUpdateTeamScore(editingScoreTeamId, newScore);
      }
    }
    setEditingScoreTeamId(null);
    setEditingScoreValue('');
  };

  const handleCancelEditingScore = () => {
    setEditingScoreTeamId(null);
    setEditingScoreValue('');
  };

  const handleAdjustScore = (delta: number) => {
    const currentValue = parseInt(editingScoreValue, 10);
    if (!isNaN(currentValue)) {
      setEditingScoreValue((currentValue + delta).toString());
    }
  };

  const handleAIEnhanceName = async (teamId: string) => {
    const team = state.teams.find(t => t.id === teamId);
    if (!team) return;

    setAiOperationTeamId(teamId);
    try {
      // Build game topic from title and categories for context
      const categoryTopics = game.categories.map(c => c.title).join(', ');
      const gameTopic = `${game.title}${game.subtitle ? ': ' + game.subtitle : ''}. Categories: ${categoryTopics}`;

      const result = await generateAI(
        'team-name-enhance',
        {
          currentName: team.name,
          gameTopic
        },
        'normal'
      );

      if (result && typeof result === 'object' && 'name' in result) {
        const enhancedName = (result as any).name;
        if (enhancedName && typeof enhancedName === 'string') {
          onUpdateTeamName?.(teamId, enhancedName);
        }
      }
    } catch (error) {
      console.error('Failed to enhance team name:', error);
    } finally {
      setAiOperationTeamId(null);
    }
  };

  const handleAIGenerateName = async (teamId: string) => {
    setAiOperationTeamId(teamId);
    try {
      // Build game topic from title and categories for context
      const categoryTopics = game.categories.map(c => c.title).join(', ');
      const gameTopic = `${game.title}${game.subtitle ? ': ' + game.subtitle : ''}. Categories: ${categoryTopics}`;

      // Get existing team names to avoid duplicates
      const existingNames = state.teams.map(t => t.name);

      const result = await generateAI(
        'team-name-random',
        {
          gameTopic,
          existingNames,
          count: 1
        },
        'normal'
      );

      if (result && typeof result === 'object' && 'names' in result) {
        const names = (result as any).names;
        if (Array.isArray(names) && names.length > 0) {
          // Use the first generated name
          onUpdateTeamName?.(teamId, names[0]);
        }
      }
    } catch (error) {
      console.error('Failed to generate team name:', error);
    } finally {
      setAiOperationTeamId(null);
    }
  };

  const handleOpenAddTeamDialog = () => {
    // Use suggested team names if available, otherwise use default
    const nextTeamNumber = state.teams.length + 1;
    const suggestedName = game.suggestedTeamNames?.[nextTeamNumber - 1] || `Team ${nextTeamNumber}`;
    setNewTeamName(suggestedName);
    setAddTeamDialogOpen(true);
  };

  const canAddTeam = state.teams.length < 4;

  const handleAddTeam = () => {
    const trimmedName = newTeamName.trim();
    if (trimmedName && onAddTeam) {
      onAddTeam(trimmedName);
      setAddTeamDialogOpen(false);
      setNewTeamName('');
    }
  };

  const handleCancelAddTeam = () => {
    setAddTeamDialogOpen(false);
    setNewTeamName('');
  };

  const handleOpenRemoveTeamDialog = (teamId: string) => {
    setTeamToRemove(teamId);
    setRemoveTeamDialogOpen(true);
  };

  const handleRemoveTeam = () => {
    if (teamToRemove && onRemoveTeam) {
      onRemoveTeam(teamToRemove);
      setRemoveTeamDialogOpen(false);
      setTeamToRemove(null);
    }
  };

  const handleCancelRemoveTeam = () => {
    setRemoveTeamDialogOpen(false);
    setTeamToRemove(null);
  };

  const activeTeam = state.teams.find((t) => t.id === state.activeTeamId);
  const activeColor = teamColor(Math.max(0, state.teams.findIndex((t) => t.id === state.activeTeamId)));

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-4 relative">
      {showFinale && (
        <EndGame
          gameTitle={game.title}
          teams={state.teams}
          cluesPlayed={usedCount}
          pointsInPlay={pointsPlayed}
          onPlayAgain={onResetBoard}
          onBackToMenu={onExit}
          onViewBoard={() => setFinaleDismissed(true)}
          state={state}
        />
      )}
      {showFinalPrompt && game.finalJeopardy && (
        <div
          className={`final-cta ${reducedMotion ? 'is-still' : ''}`}
          role="dialog"
          aria-modal="true"
          aria-label="Final Jeopardy"
        >
          <div className="finale-beams" aria-hidden="true" />
          <div className="final-cta-inner">
            <h2 className="final-cta-title">Final Jeopardy</h2>
            <p className="final-cta-lead">Every clue is played. One round left, and every wager counts.</p>
            <p className="final-cta-category" aria-label={`Category: ${game.finalJeopardy.category}`}>
              {game.finalJeopardy.category}
            </p>
            <div className="final-cta-actions">
              <Button
                size="lg"
                className="finale-btn finale-btn-primary"
                onClick={onStartFinal}
                autoFocus
                style={{ background: 'var(--theme-gold, #ffd700)', color: '#1a1200' }}
              >
                Start Final Jeopardy
              </Button>
              <Button
                size="lg"
                variant="outline"
                className="finale-btn border-white/30 bg-white/5 text-white hover:bg-white/15"
                onClick={() => setFinalPromptDismissed(true)}
              >
                <Eye className="w-5 h-5" />
                View board
              </Button>
            </div>
          </div>
        </div>
      )}
      {/* Menu dropdown - top right, absolute positioned */}
      <div className="absolute top-4 right-4 z-10 flex gap-2">
        {allPlayed && !finalPending && finaleDismissed && (
          <Button variant="outline" size="sm" className="border-yellow-500/50 bg-slate-900/50 text-yellow-400" onClick={() => setFinaleDismissed(false)} aria-label="Show final results">
            <Trophy className="w-5 h-5" />
          </Button>
        )}
        {finalPending && finalPromptDismissed && (
          <Button variant="outline" size="sm" className="border-yellow-500/50 bg-slate-900/50 text-yellow-400" onClick={() => setFinalPromptDismissed(false)} aria-label="Show Final Jeopardy">
            <Trophy className="w-5 h-5" />
            Final Jeopardy
          </Button>
        )}
        {onUndo && (
          <Button
            variant="outline"
            size="sm"
            className="border-slate-700 bg-slate-900/50"
            onClick={onUndo}
            disabled={!canUndo}
            aria-label="Undo last clue"
            title="Undo last clue (Ctrl/Cmd+Z)"
          >
            <Undo2 className="w-5 h-5" />
          </Button>
        )}
        {/* Home button */}
        <Button variant="outline" size="sm" className="border-slate-700 bg-slate-900/50" onClick={onExit} aria-label="Back to main menu">
          <Home className="w-5 h-5" />
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="border-slate-700 bg-slate-900/50" aria-label="Game settings">
              <SettingsIcon className="w-5 h-5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            {/* Game Mode - Top Level */}
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <Gamepad2 className="w-4 h-4 mr-2" />
                <span>Game Mode</span>
                <span className="ml-auto text-lg">{gameMode === 'snake' ? '🐍' : gameMode === 'regular' ? '📝' : '❓'}</span>
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent sideOffset={5}>
                <DropdownMenuItem
                  onClick={() => {
                    setGameMode('regular');
                    localStorage.setItem('gameMode', 'regular');
                  }}
                  className={gameMode === 'regular' ? 'bg-yellow-500/10' : ''}
                >
                  <span className="mr-2">📝</span>
                  <span>Regular Mode</span>
                  <span className="ml-auto text-xs text-slate-500">Classic Jeopardy</span>
                  {gameMode === 'regular' && (
                    <span className="ml-auto text-xs text-yellow-500">✓</span>
                  )}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => {
                    setGameMode('snake');
                    localStorage.setItem('gameMode', 'snake');
                  }}
                  className={gameMode === 'snake' ? 'bg-yellow-500/10' : ''}
                >
                  <span className="mr-2">🐍</span>
                  <span>Snake Mode</span>
                  <span className="ml-auto text-xs text-slate-500">Navigate to answer</span>
                  {gameMode === 'snake' && (
                    <span className="ml-auto text-xs text-yellow-500">✓</span>
                  )}
                </DropdownMenuItem>
                <DropdownMenuItem disabled className="opacity-50">
                  <span className="mr-2">❓</span>
                  <span>Trivia Mode</span>
                  <span className="ml-auto text-xs text-slate-500">Coming soon</span>
                </DropdownMenuItem>
              </DropdownMenuSubContent>
            </DropdownMenuSub>

            <DropdownMenuSeparator />

            {/* Editor Options */}
            {isSignedIn && (
              <DropdownMenuItem onClick={onToggleEditor}>
                <Edit className="w-4 h-4 mr-2 text-blue-400" />
                <span>Edit game</span>
              </DropdownMenuItem>
            )}
            {onToggleAIPreviewEditor && isSignedIn && (
              <DropdownMenuItem onClick={onToggleAIPreviewEditor}>
                <Sparkles className="w-4 h-4 mr-2 text-purple-400" />
                <span>Review with AI</span>
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />

            <GameRulesMenu />

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

                {/* Sound effects */}
                <DropdownMenuItem
                  onSelect={(e) => {
                    e.preventDefault();
                    const next = !sfxMuted;
                    setSfxMuted(next);
                    setSfxMutedState(next);
                    if (!next) playSfx('select');
                  }}
                  aria-label={sfxMuted ? 'Unmute sound effects' : 'Mute sound effects'}
                >
                  {sfxMuted ? <VolumeX className="w-4 h-4 mr-2" /> : <Volume2 className="w-4 h-4 mr-2" />}
                  <span>Sound effects</span>
                  <span className="ml-auto text-xs text-slate-500">{sfxMuted ? 'Off' : 'On'}</span>
                </DropdownMenuItem>

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

      {/* Header with title + whose pick it is */}
      <div className="max-w-[1800px] mx-auto mb-3 md:mb-5 pt-12 md:pt-0">
        <div className="text-center">
          <div className="flex items-center justify-center gap-4 flex-wrap">
            <h1
              className="text-3xl md:text-5xl text-yellow-500 tracking-wide"
              style={{ fontFamily: 'var(--font-board)', fontWeight: 400, textShadow: '0 4px 0 rgba(0,0,0,0.45), 0 0 30px rgba(255,200,0,0.18)' }}
            >
              {game.title}
            </h1>
            {gameMode === 'snake' && (
              <span className="text-4xl animate-pulse" title="Snake Mode Active">🐍</span>
            )}
            {activeTeam && !allPlayed && (
              <span
                key={activeTeam.id}
                className="turn-pill"
                aria-live="polite"
                style={{ ['--tc' as string]: activeColor.main, ['--tc-on' as string]: activeColor.onMain, ['--tc-soft' as string]: activeColor.soft }}
              >
                <span className="turn-avatar" aria-hidden="true">{teamInitials(activeTeam.name)}</span>
                <span><b>{activeTeam.name}</b> chooses</span>
              </span>
            )}
          </div>
          {game.subtitle && (
            <p className="text-sm md:text-base text-slate-300 font-medium">{game.subtitle}</p>
          )}
          {gameMode === 'snake' && (
            <p className="text-xs text-green-400 font-medium mt-1">🐍 Snake Mode: Navigate to the correct answer!</p>
          )}
        </div>
      </div>

      {/* Game board */}
      <div className="max-w-[1800px] mx-auto mb-6">
        <div className="board-wrap">
          <div
            className={`game-board ${revealing ? 'board-reveal' : ''}`}
            style={{
              gridTemplateColumns: `repeat(${categories.length}, minmax(0, 1fr))`,
            }}
          >
            {/* Category headers */}
            {categories.map((category, categoryIndex) => (
              <div
                key={category.title}
                className="cell cell-header"
                style={{ ['--col' as string]: categoryIndex }}
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
                      onClick={() => {
                        if (used) return;
                        playSfx('select');
                        onOpenClue(categoryIndex, rowIndex);
                      }}
                      disabled={used}
                      className="clue-btn"
                      style={{ ['--order' as string]: rowIndex * categories.length + categoryIndex }}
                      aria-label={`${category.title} for $${clue.value}${used ? ' (played)' : ''}`}
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

      {/* Scoreboard Bottom Bar (TV Style) */}
      <div className="w-full bg-slate-900/80 backdrop-blur-sm border-t border-slate-700 sticky bottom-0 z-50 mt-8">
        <div className="max-w-7xl mx-auto px-4 py-3">
          <div className="group flex items-center justify-center gap-3 flex-wrap">
            {state.teams.map((team, teamIndex) => {
              const tc = teamColor(teamIndex);
              // Crown whoever holds the top positive score (ties share it)
              const topScore = Math.max(...state.teams.map(t => t.score));
              const isLeader = team.score > 0 && team.score === topScore;

              return (
                <div
                  key={team.id}
                  className={`team-card relative group rounded-xl border-2 ${
                    state.activeTeamId === team.id ? 'is-active' : ''
                  } ${editingTeamId === team.id || editingScoreTeamId === team.id ? 'ring-2 ring-yellow-500' : ''}`}
                  style={{ ['--tc' as string]: tc.main, ['--tc-on' as string]: tc.onMain, ['--tc-soft' as string]: tc.soft }}
                >
                  {/* Dropdown menu button - shown on hover when not editing */}
                  {(onUpdateTeamName || onUpdateTeamScore) && editingTeamId !== team.id && editingScoreTeamId !== team.id && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button
                          onClick={(e) => e.stopPropagation()}
                          aria-label={`Options for ${team.name}`}
                          className="absolute -top-2 -right-2 w-6 h-6 flex items-center justify-center bg-slate-700 hover:bg-slate-600 text-slate-400 hover:text-slate-300 rounded-full opacity-0 group-hover:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100 [@media(hover:none)]:opacity-100 transition-opacity z-10"
                        >
                          <MoreVertical className="w-3 h-3" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-48">
                        {/* Edit Name */}
                        <DropdownMenuItem onClick={(e) => {
                          e.stopPropagation();
                          handleStartEditingTeam(team.id, team.name);
                        }}>
                          <Edit className="w-4 h-4 mr-2" />
                          <span>Edit Name</span>
                        </DropdownMenuItem>

                        {/* AI Enhance Name - only for signed in users */}
                        {isSignedIn && (
                          <DropdownMenuItem
                            onClick={(e) => {
                              e.stopPropagation();
                              handleAIEnhanceName(team.id);
                            }}
                            disabled={aiOperationTeamId === team.id}
                          >
                            <Wand2 className="w-4 h-4 mr-2 text-purple-400" />
                            <span>Enhance Name</span>
                            {aiOperationTeamId === team.id && (
                              <span className="ml-auto text-xs text-slate-500">...</span>
                            )}
                          </DropdownMenuItem>
                        )}

                        {/* AI Generate New Name - only for signed in users */}
                        {isSignedIn && (
                          <DropdownMenuItem
                            onClick={(e) => {
                              e.stopPropagation();
                              handleAIGenerateName(team.id);
                            }}
                            disabled={aiOperationTeamId === team.id}
                          >
                            <Sparkles className="w-4 h-4 mr-2 text-yellow-400" />
                            <span>Generate New Name</span>
                            {aiOperationTeamId === team.id && (
                              <span className="ml-auto text-xs text-slate-500">...</span>
                            )}
                          </DropdownMenuItem>
                        )}

                        <DropdownMenuSeparator />

                        {/* Edit Score */}
                        {onUpdateTeamScore && (
                          <DropdownMenuItem onClick={(e) => {
                            e.stopPropagation();
                            handleStartEditingScore(team.id, team.score);
                          }}>
                            <Edit className="w-4 h-4 mr-2 text-orange-400" />
                            <span>Edit Score</span>
                          </DropdownMenuItem>
                        )}

                        {/* Remove Team - only show if more than 2 teams */}
                        {onRemoveTeam && state.teams.length > 2 && (
                          <DropdownMenuItem
                            onClick={(e) => {
                              e.stopPropagation();
                              handleOpenRemoveTeamDialog(team.id);
                            }}
                            className="text-red-400 focus:text-red-400"
                          >
                            <X className="w-4 h-4 mr-2" />
                            <span>Remove Team</span>
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}

                  {/* Edit Name Mode */}
                  {editingTeamId === team.id ? (
                    <div className="px-4 py-2 min-w-[140px] space-y-1.5">
                      <Input
                        value={editingTeamName}
                        onChange={(e) => setEditingTeamName(e.target.value)}
                        onKeyDown={handleKeyDown}
                        onBlur={handleSaveTeamName}
                        className="text-base font-semibold bg-slate-900 border-slate-600 px-2 py-1 h-auto min-h-[28px]"
                        autoFocus
                        autoComplete="off"
                      />
                      <div className="flex gap-1">
                        <button
                          onClick={handleSaveTeamName}
                          className="flex-1 flex items-center justify-center bg-green-500/20 hover:bg-green-500/40 text-green-500 rounded py-1 text-xs font-medium"
                        >
                          <Check className="w-3 h-3 mr-1" />
                          Save
                        </button>
                        <button
                          onClick={handleCancelEditingTeam}
                          className="flex-1 flex items-center justify-center bg-red-500/20 hover:bg-red-500/40 text-red-500 rounded py-1 text-xs font-medium"
                        >
                          <X className="w-3 h-3 mr-1" />
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : editingScoreTeamId === team.id ? (
                    /* Edit Score Mode */
                    <div className="px-4 py-2 min-w-[180px] space-y-1.5">
                      <div className="text-xs text-slate-400 text-center">Edit Score</div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleAdjustScore(-100)}
                          className="w-8 h-8 flex items-center justify-center bg-red-500/20 hover:bg-red-500/40 text-red-500 rounded"
                        >
                          <Minus className="w-3 h-3" />
                        </button>
                        <Input
                          type="number"
                          value={editingScoreValue}
                          onChange={(e) => setEditingScoreValue(e.target.value)}
                          className="flex-1 text-base font-semibold bg-slate-900 border-slate-600 px-2 py-1 h-auto min-h-[28px] text-center"
                          autoFocus
                          autoComplete="off"
                        />
                        <button
                          onClick={() => handleAdjustScore(100)}
                          className="w-8 h-8 flex items-center justify-center bg-green-500/20 hover:bg-green-500/40 text-green-500 rounded"
                        >
                          <Plus className="w-3 h-3" />
                        </button>
                      </div>
                      <div className="flex gap-1">
                        <button
                          onClick={handleSaveScore}
                          className="flex-1 flex items-center justify-center bg-green-500/20 hover:bg-green-500/40 text-green-500 rounded py-1 text-xs font-medium"
                        >
                          <Check className="w-3 h-3 mr-1" />
                          Save
                        </button>
                        <button
                          onClick={handleCancelEditingScore}
                          className="flex-1 flex items-center justify-center bg-red-500/20 hover:bg-red-500/40 text-red-500 rounded py-1 text-xs font-medium"
                        >
                          <X className="w-3 h-3 mr-1" />
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    /* Normal Display Mode */
                    <button
                      onClick={() => onSetActiveTeam(team.id)}
                      className="px-4 py-2.5 min-w-[160px] lg:min-w-[240px] w-full text-left flex items-center gap-3"
                    >
                      <span className="team-avatar" aria-hidden="true">{teamInitials(team.name)}</span>
                      <span className="min-w-0 block">
                        {/* Team name - readable from across the room */}
                        <span className={`team-name block truncate ${
                          state.activeTeamId === team.id ? 'text-white' : 'text-slate-200'
                        }`}>
                          {isLeader && <span className="mr-1.5" aria-label="Leading">👑</span>}
                          {team.name}
                        </span>
                        <AnimatedScore
                          value={team.score}
                          className={`team-score ${team.score >= 0 ? 'text-green-400' : 'text-red-400'}`}
                        />
                      </span>
                    </button>
                  )}
                </div>
              );
            })}

            {/* Add Team Button - only shows on hover, max 4 teams */}
            {onAddTeam && canAddTeam && (
              <button
                onClick={handleOpenAddTeamDialog}
                className="opacity-0 group-hover:opacity-100 transition-opacity px-2 py-1 rounded border border-dashed border-slate-700 hover:border-slate-600 bg-slate-800/50 hover:bg-slate-800/70 text-slate-500 hover:text-slate-400 text-xs flex items-center gap-1"
              >
                <Plus className="w-3 h-3" />
                <span>Add Team</span>
              </button>
            )}
          </div>

          {/* Add Team Dialog */}
          {addTeamDialogOpen && (
            <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
              <div className="bg-slate-900 border border-slate-700 rounded-lg p-6 max-w-md w-full shadow-xl">
                <h3 className="text-lg font-bold text-white mb-4">Add New Team</h3>
                <Input
                  value={newTeamName}
                  onChange={(e) => setNewTeamName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleAddTeam();
                    else if (e.key === 'Escape') handleCancelAddTeam();
                  }}
                  placeholder="Team name"
                  className="bg-slate-800 border-slate-600 text-white mb-4"
                  autoFocus
                  autoComplete="off"
                />
                <div className="flex gap-2">
                  <Button
                    onClick={handleAddTeam}
                    disabled={!newTeamName.trim()}
                    className="flex-1 bg-green-600 hover:bg-green-700"
                  >
                    <Check className="w-4 h-4 mr-2" />
                    Add Team
                  </Button>
                  <Button
                    onClick={handleCancelAddTeam}
                    variant="outline"
                    className="flex-1 border-slate-600 hover:bg-slate-800"
                  >
                    <X className="w-4 h-4 mr-2" />
                    Cancel
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* Remove Team Confirmation Dialog */}
          {removeTeamDialogOpen && teamToRemove && (
            <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
              <div className="bg-slate-900 border border-slate-700 rounded-lg p-6 max-w-md w-full shadow-xl">
                <h3 className="text-lg font-bold text-white mb-2">Remove Team</h3>
                <p className="text-slate-300 mb-6">
                  Are you sure you want to remove <span className="font-semibold text-white">{state.teams.find(t => t.id === teamToRemove)?.name}</span>? This action cannot be undone.
                </p>
                <div className="flex gap-2">
                  <Button
                    onClick={handleRemoveTeam}
                    className="flex-1 bg-red-600 hover:bg-red-700"
                  >
                    <X className="w-4 h-4 mr-2" />
                    Remove Team
                  </Button>
                  <Button
                    onClick={handleCancelRemoveTeam}
                    variant="outline"
                    className="flex-1 border-slate-600 hover:bg-slate-800"
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
