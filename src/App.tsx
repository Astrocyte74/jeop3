import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { MainMenu } from '@/components/MainMenu';
import { GameBoard } from '@/components/GameBoard';
import { ClueDialog } from '@/components/ClueDialog';
import { TriviaSnake } from '@/components/TriviaSnake';
import { FinalJeopardy } from '@/components/FinalJeopardy';
import { EditorBoard } from '@/components/EditorBoard';
import { AIToastContainer } from '@/components/ai';
import { useAIToast } from '@/lib/ai';
import type { Game, GameState } from '@/lib/storage';
import { loadGameState, saveGameState, setSelectedGameId, saveCustomGames, loadCustomGames } from '@/lib/storage';
import { applyTheme, getStoredTheme } from '@/lib/themes';
import { iconMatcher } from '@/lib/iconMatcher';
import { applyClueResult, applyFinalResults, boardMaxValue, createInitialState, markClueUsed, remapStateForEditedGame, type FinalOutcome } from '@/lib/gameState';
import { type GameMode } from '@/components/GameModeMenu';
import { getGameRules } from '@/lib/gameRules';
import { playSfx } from '@/lib/sfx';
import { getClueRuntime, runClueCommand } from '@/lib/hostLink/clueBridge';
import { useTvHostLink } from '@/lib/hostLink/useHostLinks';
import { HostConnectedBadge } from '@/components/host/HostConnectedBadge';
import type { HostClue, HostClueRuntime, HostCommand, HostSnapshot } from '@/lib/hostLink/protocol';

type AppMode = 'menu' | 'playing' | 'editing';

interface ClueData {
  categoryId: number;
  clueIndex: number;
  categoryTitle: string;
  value: number;
  clue: string;
  response: string;
}

export function App() {
  const [mode, setMode] = useState<AppMode>('menu');
  // One-shot: the finale's "New game" sends us to the menu with the New Game wizard open
  const [openWizardOnMenu, setOpenWizardOnMenu] = useState(false);
  const [finalOpen, setFinalOpen] = useState(false);
  const [currentGame, setCurrentGame] = useState<Game | null>(null);
  const [gameId, setGameId] = useState<string | null>(null);
  // Library game being edited from the menu (no play session, so `gameId` is unset)
  const [editorGameId, setEditorGameId] = useState<string | null>(null);
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [clueDialog, setClueDialog] = useState<{
    isOpen: boolean;
    clueId: string;
  }>({ isOpen: false, clueId: '' });

  const [triviaSnake, setTriviaSnake] = useState<{
    isOpen: boolean;
    categoryIndex: number;
    clueIndex: number;
  }>({ isOpen: false, categoryIndex: 0, clueIndex: 0 });

  // Track snake game result for showing in ClueDialog
  const [snakeGameResult, setSnakeGameResult] = useState<{
    wasCorrect: boolean | null;
    teamId: string | null;
  } | null>(null);

  // Helper to get current global game mode from localStorage
  const getGlobalGameMode = useCallback((): GameMode => {
    return (localStorage.getItem('gameMode') as GameMode) || 'regular';
  }, []);

  // AI toast system
  const { toasts, dismiss, show } = useAIToast();

  // Initialize theme on mount
  useEffect(() => {
    const theme = getStoredTheme();
    applyTheme(theme);
  }, []);

  // Initialize icon matcher on mount
  useEffect(() => {
    iconMatcher.load().catch(console.error);
  }, []);

  // Load game state when game changes
  useEffect(() => {
    if (gameId && currentGame) {
      const saved = loadGameState(gameId);
      if (saved) {
        setGameState(saved);
      } else {
        // Use suggested team names if available
        const defaultTeams = [
          { id: '1', name: 'Team 1', score: 0 },
          { id: '2', name: 'Team 2', score: 0 },
        ];

        const teams = (currentGame.suggestedTeamNames && currentGame.suggestedTeamNames.length >= 2)
          ? [
              { id: '1', name: currentGame.suggestedTeamNames[0], score: 0 },
              { id: '2', name: currentGame.suggestedTeamNames[1], score: 0 },
            ]
          : defaultTeams;

        const initialState = createInitialState(currentGame, teams);
        setGameState(initialState);
        saveGameState(gameId, initialState);
      }
    }
  }, [gameId, currentGame]);

  // Undo history: snapshots from just before each clue was settled (in memory only, so the saved
  // game format is unchanged). Keyed by game so switching games starts a fresh history.
  const [undo, setUndo] = useState<{ gameId: string | null; stack: GameState[] }>({ gameId: null, stack: [] });
  const undoStack = useMemo(() => (undo.gameId === gameId ? undo.stack : []), [undo, gameId]);
  const prevStateRef = useRef<GameState | null>(null);
  useEffect(() => {
    const prev = prevStateRef.current;
    if (prev && gameState && Object.keys(gameState.used).length > Object.keys(prev.used).length) {
      setUndo((u) => ({ gameId, stack: [...(u.gameId === gameId ? u.stack : []).slice(-19), prev] }));
    }
    prevStateRef.current = gameState;
  }, [gameState, gameId]);
  const handleUndo = useCallback(() => {
    if (undoStack.length === 0) return;
    const restored = undoStack[undoStack.length - 1];
    prevStateRef.current = restored; // don't re-push the state we're returning to
    setGameState(restored);
    setUndo({ gameId, stack: undoStack.slice(0, -1) });
  }, [undoStack, gameId]);

  // Ctrl/Cmd+Z on the board undoes the last clue (never while a clue, snake or final is open)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.shiftKey || e.altKey || e.key.toLowerCase() !== 'z') return;
      if (mode !== 'playing' || clueDialog.isOpen || triviaSnake.isOpen || finalOpen) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      e.preventDefault();
      handleUndo();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mode, clueDialog.isOpen, triviaSnake.isOpen, finalOpen, handleUndo]);

  // Save game state whenever it changes
  useEffect(() => {
    if (gameId && gameState) {
      saveGameState(gameId, gameState);
    }
  }, [gameId, gameState]);

  const handleSelectGame = useCallback((selectedGameId: string, game: Game, teams?: any[]) => {
    setCurrentGame(game);
    setGameId(selectedGameId);
    setSelectedGameId(selectedGameId);

    // Check if there's an existing saved game state
    const savedState = loadGameState(selectedGameId);

    if (savedState) {
      // Load the saved game state
      setGameState(savedState);
    } else if (teams && teams.length > 0) {
      // Only create new state if teams are passed AND no saved state exists
      const initialState = createInitialState(
        game,
        teams.map(t => ({ ...t, score: 0 })), // Reset scores to 0
      );
      setGameState(initialState);
      saveGameState(selectedGameId, initialState);
    }

    setMode('playing');
  }, []);

  const handleOpenClue = useCallback((categoryId: number, clueIndex: number) => {
    if (!currentGame || !gameState) return;

    const category = currentGame.categories[categoryId];
    const clue = category?.clues[clueIndex];
    if (!clue) return;

    const clueId = `${categoryId}:${clueIndex}`;
    if (gameState.used[clueId]) return;

    // Check global game mode
    const globalGameMode = getGlobalGameMode();

    const isDailyDouble = !!gameState.dailyDoubles?.includes(clueId);

    if (globalGameMode === 'snake' && !isDailyDouble) {
      // Global Snake mode: open TriviaSnake directly
      // Store the clue info in case user wants to switch back to Regular mode
      setTriviaSnake({
        isOpen: true,
        categoryIndex: categoryId,
        clueIndex: clueIndex,
      });
    } else {
      // Global Regular mode: open ClueDialog with option to switch to Snake
      setClueDialog({
        isOpen: true,
        clueId,
      });
    }
  }, [currentGame, gameState, getGlobalGameMode]);

  const handleSwitchToSnake = useCallback(() => {
    if (!clueDialog.isOpen) return;

    const [categoryId, clueIndex] = clueDialog.clueId.split(':').map(Number);

    // Close clue dialog and open snake game
    setClueDialog({ isOpen: false, clueId: '' });
    setTriviaSnake({
      isOpen: true,
      categoryIndex: categoryId,
      clueIndex: clueIndex,
    });
  }, [clueDialog]);

  const handleGameModeChange = useCallback((mode: GameMode) => {
    if (!triviaSnake.isOpen) return;

    const { categoryIndex, clueIndex } = triviaSnake;
    const clueId = `${categoryIndex}:${clueIndex}`;

    if (mode === 'regular') {
      // Close snake game and open clue dialog for the same clue
      setTriviaSnake({ isOpen: false, categoryIndex: 0, clueIndex: 0 });
      setClueDialog({ isOpen: true, clueId });
    }
    // If mode is 'snake', we're already in snake mode, so nothing to do
  }, [triviaSnake]);

  const handleMarkCorrect = useCallback((teamId: string, amount?: number) => {
    if (!gameState || !currentGame || !clueDialog.isOpen) return;

    const [categoryId, clueIndex] = clueDialog.clueId.split(':').map(Number);
    const clue = currentGame.categories[categoryId]?.clues[clueIndex];
    if (!clue) return;

    const clueId = clueDialog.clueId;
    const dailyDouble = !!gameState.dailyDoubles?.includes(clueId);
    setGameState((prev) => {
      if (!prev) return prev;
      return applyClueResult(prev, {
        clueId,
        teamId,
        correct: true,
        amount: amount ?? clue.value,
        dailyDouble,
      });
    });

    setClueDialog({ isOpen: false, clueId: '' });
    setSnakeGameResult(null); // Reset after marking
  }, [gameState, currentGame, clueDialog]);

  const handleMarkIncorrect = useCallback((teamId: string, amount?: number) => {
    if (!gameState || !currentGame || !clueDialog.isOpen) return;

    const [categoryId, clueIndex] = clueDialog.clueId.split(':').map(Number);
    const clue = currentGame.categories[categoryId]?.clues[clueIndex];
    if (!clue) return;

    const clueId = clueDialog.clueId;
    const dailyDouble = !!gameState.dailyDoubles?.includes(clueId);
    setGameState((prev) => {
      if (!prev) return prev;
      return applyClueResult(prev, {
        clueId,
        teamId,
        correct: false,
        amount: amount ?? clue.value,
        dailyDouble,
      });
    });

    setClueDialog({ isOpen: false, clueId: '' });
    setSnakeGameResult(null); // Reset after marking
  }, [gameState, currentGame, clueDialog]);

  const handleSkipClue = useCallback(() => {
    if (!clueDialog.isOpen) return;
    const clueId = clueDialog.clueId;
    setGameState((prev) => (prev ? markClueUsed(prev, clueId) : prev));
    setClueDialog({ isOpen: false, clueId: '' });
    setSnakeGameResult(null);
  }, [clueDialog]);

  const handleSetActiveTeam = useCallback((teamId: string) => {
    setGameState((prev) => {
      if (!prev) return prev;
      return { ...prev, activeTeamId: teamId };
    });
  }, []);

  const handleUpdateTeamName = useCallback((teamId: string, name: string) => {
    setGameState((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        teams: prev.teams.map((t) =>
          t.id === teamId ? { ...t, name } : t
        ),
      };
    });
  }, []);

  const handleUpdateTeamScore = useCallback((teamId: string, score: number) => {
    setGameState((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        teams: prev.teams.map((t) =>
          t.id === teamId ? { ...t, score } : t
        ),
      };
    });
  }, []);

  const handleAddTeam = useCallback((name: string) => {
    setGameState((prev) => {
      if (!prev) return prev;
      const newTeamId = Date.now().toString(); // Simple ID generation
      return {
        ...prev,
        teams: [...prev.teams, { id: newTeamId, name, score: 0 }],
      };
    });
  }, []);

  const handleRemoveTeam = useCallback((teamId: string) => {
    setGameState((prev) => {
      if (!prev) return prev;
      const newTeams = prev.teams.filter(t => t.id !== teamId);

      // If we removed the active team, set a new active team
      let newActiveTeamId = prev.activeTeamId;
      if (prev.activeTeamId === teamId && newTeams.length > 0) {
        newActiveTeamId = newTeams[0].id;
      }

      return {
        ...prev,
        teams: newTeams,
        activeTeamId: newActiveTeamId,
      };
    });
  }, []);

  // Trivia Snake handler - game completed, open ClueDialog with answer revealed
  const handleSnakeGameComplete = useCallback((wasCorrect: boolean, teamId: string) => {
    if (!triviaSnake.isOpen) return;

    const { categoryIndex, clueIndex } = triviaSnake;
    const clueId = `${categoryIndex}:${clueIndex}`;

    // Store the result for ClueDialog to show
    setSnakeGameResult({ wasCorrect, teamId });

    // Close snake game and open ClueDialog with answer revealed
    setTriviaSnake({ isOpen: false, categoryIndex: 0, clueIndex: 0 });
    setClueDialog({ isOpen: true, clueId });
  }, [triviaSnake]);

  const handleExitToMenu = useCallback(() => {
    setMode('menu');
    setCurrentGame(null);
    setGameId(null);
    setGameState(null);
  }, []);

  const handleToggleEditor = useCallback(() => {
    // Leaving the editor returns to the game only if one is in progress. When
    // the editor was opened from the main menu there is no gameState, and
    // 'playing' renders nothing — a blank dead-end — so go back to the menu.
    setMode((prev) => prev === 'editing' ? (gameState ? 'playing' : 'menu') : 'editing');
  }, [gameState]);

  const handleResetBoard = useCallback(() => {
    if (!currentGame || !gameState) return;

    // Reset the game state - clear used clues, reset scores
    const resetState: GameState = createInitialState(
      currentGame,
      gameState.teams.map(team => ({ ...team, score: 0 })),
    );

    setGameState(resetState);
    if (gameId) {
      saveGameState(gameId, resetState);
    }
  }, [currentGame, gameState, gameId]);

  /** Persist an edited game. Targets the game in play, else the library game being edited;
   *  a brand-new game (no id yet) is added to the library. */
  const persistEditedGame = useCallback((updatedGame: Game) => {
    const games = loadCustomGames();
    const id = gameId ?? editorGameId ?? `custom-${Date.now()}`;
    const saved = { id, title: updatedGame.title, subtitle: updatedGame.subtitle || '', game: updatedGame };
    if (games.some(g => g.id === id)) {
      saveCustomGames(games.map(g => g.id === id ? { ...g, ...saved } : g));
    } else {
      saveCustomGames([...games, {
        ...saved, source: 'custom', createdAt: new Date().toISOString(), visibility: 'private',
      }]);
    }
    setEditorGameId(id);
    return id;
  }, [gameId, editorGameId]);

  const handleSaveGame = useCallback((updatedGame: Game) => {
    const savedId = persistEditedGame(updatedGame);
    setSelectedGameId(savedId);
    // Keep played tiles and the Daily Double with their categories after a reorder.
    const progress = gameState ?? loadGameState(savedId);
    if (currentGame && progress) {
      const remapped = remapStateForEditedGame(currentGame, updatedGame, progress);
      saveGameState(savedId, remapped);
      if (gameState) setGameState(remapped);
    }
    setCurrentGame(updatedGame);
    show(`Saved “${updatedGame.title}” to your library.`, 'success');
    setMode(gameState ? 'playing' : 'menu');
  }, [persistEditedGame, gameState, currentGame, show]);

  // Get current clue data for dialog
  const getCurrentClue = useCallback((): ClueData | null => {
    if (!clueDialog.isOpen || !currentGame) return null;

    const [categoryId, clueIndex] = clueDialog.clueId.split(':').map(Number);
    const category = currentGame.categories[categoryId];
    const clue = category?.clues[clueIndex];

    if (!category || !clue) return null;

    return {
      categoryId,
      clueIndex,
      categoryTitle: category.title,
      value: clue.value,
      clue: clue.clue,
      response: clue.response,
    };
  }, [clueDialog.isOpen, clueDialog.clueId, currentGame]);

  const currentClue = getCurrentClue();

  const handleStartFinal = useCallback(() => setFinalOpen(true), []);
  const handleFinalComplete = useCallback((outcomes: FinalOutcome[]) => {
    setGameState((prev) => (prev ? applyFinalResults(prev, outcomes) : prev));
    setFinalOpen(false);
  }, []);

  // ---- Host window ------------------------------------------------------------------------------
  // The host window (?view=host) is a remote control: it gets snapshots of this game (including the
  // answer and where the Daily Doubles are, which the TV never shows) and sends commands back. Commands
  // run through the same handlers as this window's own buttons, and only while a host is connected.
  const buildHostSnapshot = (): HostSnapshot => {
    if (mode !== 'playing' || !currentGame || !gameState) return { game: null };
    const rows = currentGame.rows || currentGame.categories[0]?.clues?.length || 5;
    let cluesLeft = 0;
    const categories = currentGame.categories.map((cat, ci) => ({
      title: cat.title,
      clues: Array.from({ length: rows }, (_, ri) => {
        const cl = cat.clues?.[ri];
        if (!cl) return null;
        const id = `${ci}:${ri}`;
        const used = !!gameState.used[id];
        if (!used) cluesLeft += 1;
        return { value: cl.value, used, dailyDouble: !!gameState.dailyDoubles?.includes(id) };
      }),
    }));
    let clue: HostClue | null = null;
    if (clueDialog.isOpen) {
      const [c, r] = clueDialog.clueId.split(':').map(Number);
      const cat = currentGame.categories[c];
      const cl = cat?.clues?.[r];
      if (cat && cl) {
        const idle: HostClueRuntime = {
          ddPhase: null, wager: null, wagerTeamId: null, wagerCap: 0, revealed: false, judging: false,
          finished: false, settling: false, misses: [], winnerId: null, inPlayId: null, timer: null,
        };
        clue = {
          ...(getClueRuntime() ?? idle),
          c, r,
          category: cat.title,
          value: cl.value,
          clue: cl.clue,
          response: cl.response,
          verification: cl.verification,
          dailyDouble: !!gameState.dailyDoubles?.includes(clueDialog.clueId),
        };
      }
    }
    const fj = currentGame.finalJeopardy;
    return {
      game: {
        title: currentGame.title,
        board: { rows, categories },
        teams: gameState.teams.map((t) => ({ id: t.id, name: t.name, score: t.score })),
        activeTeamId: gameState.activeTeamId,
        rules: getGameRules(),
        canUndo: undoStack.length > 0,
        cluesLeft,
        final: fj ? { category: fj.category, clue: fj.clue, response: fj.response, open: finalOpen, done: !!gameState.final?.done } : null,
        snakeOpen: triviaSnake.isOpen,
        clue,
      },
    };
  };

  const handleHostCommand = (command: HostCommand) => {
    const boardIdle = mode === 'playing' && !clueDialog.isOpen && !triviaSnake.isOpen && !finalOpen;
    if (command.type === 'openClue') {
      if (!boardIdle) return;
      playSfx('select');
      handleOpenClue(command.c, command.r);
    } else if (command.type === 'undo') {
      if (boardIdle) handleUndo();
    } else {
      runClueCommand(command);
    }
  };

  useTvHostLink(buildHostSnapshot, handleHostCommand, [
    mode, currentGame, gameState, clueDialog, triviaSnake.isOpen, finalOpen, undoStack.length,
  ]);

  // Get current trivia snake data
  const getCurrentSnakeData = useCallback(() => {
    if (!triviaSnake.isOpen || !currentGame) return null;

    const { categoryIndex, clueIndex } = triviaSnake;
    const category = currentGame.categories[categoryIndex];
    const clue = category?.clues[clueIndex];

    if (!category || !clue) return null;

    return {
      categories: currentGame.categories,
      currentCategoryIndex: categoryIndex,
      currentValue: clue.value,
      currentClue: clue.clue,
      currentResponse: clue.response,
    };
  }, [triviaSnake, currentGame]);

  const currentSnakeData = getCurrentSnakeData();

  return (
    <>
      {/* AI Toast Container */}
      <AIToastContainer toasts={toasts} onDismiss={dismiss} />
      <HostConnectedBadge />
      {mode === 'menu' && (
        <MainMenu
          onSelectGame={handleSelectGame}
          startWithWizard={openWizardOnMenu}
          onStartWithWizardHandled={() => setOpenWizardOnMenu(false)}
          onOpenEditor={(game?: Game, libraryGameId?: string) => {
            setEditorGameId(libraryGameId ?? null);
            // Use the provided game or create a blank game for editing
            const editorGame = game || {
              title: 'New Game',
              subtitle: '',
              categories: Array.from({ length: 5 }, (_, i) => ({
                title: `Category ${i + 1}`,
                clues: Array.from({ length: 5 }, (_, j) => ({
                  value: (j + 1) * 200,
                  clue: '',
                  response: '',
                })),
              })),
              rows: 5,
            };
            setCurrentGame(editorGame);
            setMode('editing');
          }}
        />
      )}

      {mode === 'playing' && currentGame && gameState && (
        <>
          <GameBoard
            game={currentGame}
            state={gameState}
            onOpenClue={handleOpenClue}
            onExit={handleExitToMenu}
            onToggleEditor={handleToggleEditor}
            finalAvailable={!!currentGame.finalJeopardy && !gameState.final?.done}
            onStartFinal={handleStartFinal}
            canUndo={undoStack.length > 0}
            onUndo={handleUndo}
            onSetActiveTeam={handleSetActiveTeam}
            onResetBoard={handleResetBoard}
            onNewGame={() => {
              setOpenWizardOnMenu(true);
              handleExitToMenu();
            }}
            onUpdateTeamName={handleUpdateTeamName}
            onUpdateTeamScore={handleUpdateTeamScore}
            onAddTeam={handleAddTeam}
            onRemoveTeam={handleRemoveTeam}
          />
          {currentClue && (
            <ClueDialog
              isOpen={clueDialog.isOpen}
              categoryTitle={currentClue.categoryTitle}
              value={currentClue.value}
              clue={currentClue.clue}
              response={currentClue.response}
              teams={gameState.teams}
              activeTeamId={gameState.activeTeamId}
              globalGameMode={getGlobalGameMode()}
              onClose={() => {
                setClueDialog({ isOpen: false, clueId: '' });
                setSnakeGameResult(null);
              }}
              onMarkCorrect={handleMarkCorrect}
              onMarkIncorrect={handleMarkIncorrect}
              onSetActiveTeam={handleSetActiveTeam}
              onSkipClue={handleSkipClue}
              onSwitchToSnake={handleSwitchToSnake}
              snakeGameResult={snakeGameResult}
              dailyDouble={!!gameState.dailyDoubles?.includes(clueDialog.clueId)}
              boardMaxValue={boardMaxValue(currentGame)}
            />
          )}
          {currentGame.finalJeopardy && (
            <FinalJeopardy
              open={finalOpen}
              final={currentGame.finalJeopardy}
              teams={gameState.teams}
              onComplete={handleFinalComplete}
              onClose={() => setFinalOpen(false)}
            />
          )}
          {currentSnakeData && (
            <TriviaSnake
              isOpen={triviaSnake.isOpen}
              categories={currentSnakeData.categories}
              currentCategoryIndex={currentSnakeData.currentCategoryIndex}
              currentValue={currentSnakeData.currentValue}
              currentClue={currentSnakeData.currentClue}
              currentResponse={currentSnakeData.currentResponse}
              teams={gameState.teams}
              activeTeamId={gameState.activeTeamId}
              onClose={() => setTriviaSnake({ isOpen: false, categoryIndex: 0, clueIndex: 0 })}
              onGameComplete={handleSnakeGameComplete}
              onModeChange={handleGameModeChange}
            />
          )}
        </>
      )}

      {mode === 'editing' && currentGame && (
        <EditorBoard
          game={currentGame}
          gameId={gameId ?? editorGameId}
          onSave={handleSaveGame}
          onExit={handleExitToMenu}
          onCancel={handleToggleEditor}
        />
      )}
    </>
  );
}

export default App;
