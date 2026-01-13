import { useState, useEffect, useCallback } from 'react';
import { MainMenu } from '@/components/MainMenu';
import { GameBoard } from '@/components/GameBoard';
import { ClueDialog } from '@/components/ClueDialog';
import { EditorBoard } from '@/components/EditorBoard';
import { AIToastContainer } from '@/components/ai';
import { useAIToast } from '@/lib/ai';
import type { Game, GameState } from '@/lib/storage';
import { loadGameState, saveGameState, setSelectedGameId } from '@/lib/storage';
import { applyTheme, getStoredTheme } from '@/lib/themes';

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
  const [currentGame, setCurrentGame] = useState<Game | null>(null);
  const [gameId, setGameId] = useState<string | null>(null);
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [clueDialog, setClueDialog] = useState<{
    isOpen: boolean;
    clueId: string;
  }>({ isOpen: false, clueId: '' });

  // AI toast system
  const { toasts, dismiss } = useAIToast();

  // Initialize theme on mount
  useEffect(() => {
    const theme = getStoredTheme();
    applyTheme(theme);
  }, []);

  // Load game state when game changes
  useEffect(() => {
    if (gameId && currentGame) {
      const saved = loadGameState(gameId);
      if (saved) {
        setGameState(saved);
      } else {
        const initialState = {
          used: {},
          teams: [
            { id: '1', name: 'Team 1', score: 0 },
            { id: '2', name: 'Team 2', score: 0 },
          ],
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

  const handleSelectGame = useCallback((selectedGameId: string, game: Game) => {
    setCurrentGame(game);
    setGameId(selectedGameId);
    setSelectedGameId(selectedGameId);
    setMode('playing');
  }, []);

  const handleOpenClue = useCallback((categoryId: number, clueIndex: number) => {
    if (!currentGame || !gameState) return;

    const category = currentGame.categories[categoryId];
    const clue = category?.clues[clueIndex];
    if (!clue) return;

    const clueId = `${categoryId}:${clueIndex}`;
    if (gameState.used[clueId]) return;

    setClueDialog({
      isOpen: true,
      clueId,
    });
  }, [currentGame, gameState]);

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

  const handleExitToMenu = useCallback(() => {
    setMode('menu');
    setCurrentGame(null);
    setGameId(null);
    setGameState(null);
  }, []);

  const handleToggleEditor = useCallback(() => {
    setMode((prev) => prev === 'editing' ? 'playing' : 'editing');
  }, []);

  const handleSaveGame = useCallback((updatedGame: Game) => {
    // For now, just update the current game
    // In the future, this would save to localStorage or a backend
    setCurrentGame(updatedGame);
    setMode('playing');
  }, []);

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

  return (
    <>
      {/* AI Toast Container */}
      <AIToastContainer toasts={toasts} onDismiss={dismiss} />
      {mode === 'menu' && (
        <MainMenu
          onSelectGame={handleSelectGame}
          onOpenEditor={() => {
            // Create a blank game for editing
            const blankGame: Game = {
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
            setCurrentGame(blankGame);
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
            onSetActiveTeam={handleSetActiveTeam}
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
    </>
  );
}

export default App;
