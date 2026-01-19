import { useState, useEffect, useCallback } from 'react';
import { MainMenu } from '@/components/MainMenu';
import { GameBoard } from '@/components/GameBoard';
import { ClueDialog } from '@/components/ClueDialog';
import { TriviaSnake } from '@/components/TriviaSnake';
import { EditorBoard } from '@/components/EditorBoard';
import { AIToastContainer } from '@/components/ai';
import { useAIToast } from '@/lib/ai';
import type { Game, GameState } from '@/lib/storage';
import { loadGameState, saveGameState, setSelectedGameId, saveCustomGames, loadCustomGames } from '@/lib/storage';
import { applyTheme, getStoredTheme } from '@/lib/themes';
import { iconMatcher } from '@/lib/iconMatcher';

type AppMode = 'menu' | 'playing' | 'editing' | 'ai-preview-editing';

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
  const [currentGame, setCurrentGame] = useState<Game | null>(null);
  const [gameId, setGameId] = useState<string | null>(null);
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

  // AI toast system
  const { toasts, dismiss } = useAIToast();

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

        const initialState = {
          used: {},
          teams,
          activeTeamId: '1',
          currentRound: 1,
        };
        setGameState(initialState);
        saveGameState(gameId, initialState);
      }
    }
  }, [gameId, currentGame]);

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
      const initialState = {
        used: {},
        teams: teams.map(t => ({ ...t, score: 0 })), // Reset scores to 0
        activeTeamId: teams[0]?.id || '1',
        currentRound: 1,
      };
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

    // Always open ClueDialog to allow per-clue game mode selection
    setClueDialog({
      isOpen: true,
      clueId,
    });
  }, [currentGame, gameState]);

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

  const handleMarkCorrect = useCallback((teamId: string) => {
    if (!gameState || !currentGame || !clueDialog.isOpen) return;

    const [categoryId, clueIndex] = clueDialog.clueId.split(':').map(Number);
    const clue = currentGame.categories[categoryId]?.clues[clueIndex];
    if (!clue) return;

    setGameState((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        used: { ...prev.used, [clueDialog.clueId]: true },
        teams: prev.teams.map((t) =>
          t.id === teamId ? { ...t, score: t.score + clue.value } : t
        ),
      };
    });

    setClueDialog({ isOpen: false, clueId: '' });
  }, [gameState, currentGame, clueDialog]);

  const handleMarkIncorrect = useCallback((teamId: string) => {
    if (!gameState || !currentGame || !clueDialog.isOpen) return;

    const [categoryId, clueIndex] = clueDialog.clueId.split(':').map(Number);
    const clue = currentGame.categories[categoryId]?.clues[clueIndex];
    if (!clue) return;

    setGameState((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        used: { ...prev.used, [clueDialog.clueId]: true },
        teams: prev.teams.map((t) =>
          t.id === teamId ? { ...t, score: t.score - clue.value } : t
        ),
      };
    });

    setClueDialog({ isOpen: false, clueId: '' });
  }, [gameState, currentGame, clueDialog]);

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

  // Trivia Snake handlers
  const handleSnakeCorrect = useCallback((teamId: string) => {
    if (!gameState || !currentGame || !triviaSnake.isOpen) return;

    const { categoryIndex, clueIndex } = triviaSnake;
    const clue = currentGame.categories[categoryIndex]?.clues[clueIndex];
    if (!clue) return;

    const clueId = `${categoryIndex}:${clueIndex}`;

    setGameState((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        used: { ...prev.used, [clueId]: true },
        teams: prev.teams.map((t) =>
          t.id === teamId ? { ...t, score: t.score + clue.value } : t
        ),
      };
    });

    // Note: TriviaSnake component handles closing with delay
  }, [gameState, currentGame, triviaSnake]);

  const handleSnakeIncorrect = useCallback((teamId: string) => {
    if (!gameState || !currentGame || !triviaSnake.isOpen) return;

    const { categoryIndex, clueIndex } = triviaSnake;
    const clue = currentGame.categories[categoryIndex]?.clues[clueIndex];
    if (!clue) return;

    const clueId = `${categoryIndex}:${clueIndex}`;

    setGameState((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        used: { ...prev.used, [clueId]: true },
        teams: prev.teams.map((t) =>
          t.id === teamId ? { ...t, score: t.score - clue.value } : t
        ),
      };
    });

    // Note: TriviaSnake component handles closing with delay after max attempts
  }, [gameState, currentGame, triviaSnake]);

  const handleExitToMenu = useCallback(() => {
    setMode('menu');
    setCurrentGame(null);
    setGameId(null);
    setGameState(null);
  }, []);

  const handleToggleEditor = useCallback(() => {
    setMode((prev) => prev === 'editing' ? 'playing' : 'editing');
  }, []);

  const handleToggleAIPreviewEditor = useCallback(() => {
    // Need to pass the current game data to MainMenu for AI preview editing
    // We set a flag so MainMenu knows to open AI preview with current game
    if (currentGame) {
      // Store the current game so MainMenu can use it
      sessionStorage.setItem('aiPreviewGame', JSON.stringify(currentGame));
    }
    setMode('ai-preview-editing');
  }, [currentGame]);

  const handleResetBoard = useCallback(() => {
    if (!currentGame || !gameState) return;

    // Reset the game state - clear used clues, reset scores
    const resetState: GameState = {
      used: {},
      teams: gameState.teams.map(team => ({ ...team, score: 0 })),
      activeTeamId: gameState.teams[0]?.id || '',
      currentRound: 1,
    };

    setGameState(resetState);
    if (gameId) {
      saveGameState(gameId, resetState);
    }
  }, [currentGame, gameState, gameId]);

  const handleSaveGame = useCallback((updatedGame: Game) => {
    // For now, just update the current game
    // In the future, this would save to localStorage or a backend
    setCurrentGame(updatedGame);
    setMode('playing');
  }, []);

  const handleAIPreviewSave = useCallback((updatedGame: Game) => {
    setCurrentGame(updatedGame);
    if (gameId) {
      // Update the game in the custom games list
      const games = loadCustomGames();
      const updatedGames = games.map(g =>
        g.id === gameId
          ? { ...g, title: updatedGame.title, subtitle: updatedGame.subtitle || '', game: updatedGame }
          : g
      );
      saveCustomGames(updatedGames);
    }
    setMode('playing');
  }, [gameId]);

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
      {mode === 'menu' && (
        <MainMenu
          onSelectGame={handleSelectGame}
          onOpenEditor={(game?: Game) => {
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
            onToggleAIPreviewEditor={handleToggleAIPreviewEditor}
            onSetActiveTeam={handleSetActiveTeam}
            onResetBoard={handleResetBoard}
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
              onClose={() => setClueDialog({ isOpen: false, clueId: '' })}
              onMarkCorrect={handleMarkCorrect}
              onMarkIncorrect={handleMarkIncorrect}
              onSetActiveTeam={handleSetActiveTeam}
              onSwitchToSnake={handleSwitchToSnake}
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
              onCorrect={handleSnakeCorrect}
              onIncorrect={handleSnakeIncorrect}
            />
          )}
        </>
      )}

      {mode === 'editing' && currentGame && (
        <EditorBoard
          game={currentGame}
          onSave={handleSaveGame}
          onExit={handleExitToMenu}
          onCancel={handleToggleEditor}
        />
      )}

      {mode === 'ai-preview-editing' && currentGame && (
        <MainMenu
          onSelectGame={handleSelectGame}
          onOpenEditor={(game?: Game) => {
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
          editGame={currentGame}
          onAIPreviewSave={handleAIPreviewSave}
        />
      )}
    </>
  );
}

export default App;
