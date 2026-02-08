import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth, useUser, SignInButton, SignedIn, SignedOut } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import type { GameMeta, Team, Game, Category, Clue, GameState } from '@/lib/storage';
import { loadCustomGames, saveCustomGames, getSelectedGameId, loadGameState, saveGameState, stateKey, recordGamePlay, getGamePlayStats, calculateGameCompletion } from '@/lib/storage';
import { themes, applyTheme, getStoredTheme, setIconSize, getIconSize, type ThemeKey, type IconSize } from '@/lib/themes';
import { getAIApiBase } from '@/lib/ai/service';
import { useAIGeneration } from '@/lib/ai/hooks';
import { getModelStats, formatTime, getModelsBySpeed, getCostEstimate, initializePricing } from '@/lib/ai/stats';
import { AIPreviewDialog } from '@/components/ai/AIPreviewDialog';
import { NewGameWizard, type WizardCompleteData, type CustomSource } from '@/components/NewGameWizard';
import { GameMetadata } from '@/components/GameMetadata';
import type { AIPromptType, AIDifficulty } from '@/lib/ai/types';
import type { PreviewData } from '@/components/ai';
import { Gamepad2, Users, Sparkles, Palette, Dice1, Play, Edit, MoreVertical, Trash2, Image, Download, Plus, LogIn, LogOut, RotateCcw, ArrowUpDown, Info, Wand2 } from 'lucide-react';
import { TTSDirectSettings } from '@/components/tts/TTSSettings';

interface MainMenuProps {
  onSelectGame: (gameId: string, game: any, teams?: Team[]) => void;
  onOpenEditor: (game?: Game) => void;
  editGame?: Game | null;
  onAIPreviewSave?: (game: Game) => void;
}

interface GeneratedGameData {
  game: Game;
  categories: Array<{
    title: string;
    contentTopic?: string;
    clues: Array<{ value: number; clue: string; response: string }>;
    sourceMaterial?: string; // Store source material for this specific category
    sourceUrl?: string; // Store source URL if applicable
  }>;
  titles: Array<{ title: string; subtitle: string }>;
  suggestedTeamNames: string[];
  theme: string;
  difficulty: AIDifficulty;
  sourceMode?: 'scratch' | 'paste' | 'url' | 'custom';
  referenceUrl?: string;
  referenceMaterial?: string; // Store source material for single-source mode
  sourceCharacters?: number;
  metadata?: {
    modelUsed?: string;
    generatedAt?: string;
    generationTimeMs?: number;
  };
}

export function MainMenu({ onSelectGame, onOpenEditor }: MainMenuProps) {
  // Clerk auth
  const { isSignedIn, signOut } = useAuth();
  const { user } = useUser();

  // Simple slugify function for safe filenames
  const slugify = (str: string) => {
    return str
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
  };

  const [games, setGames] = useState<GameMeta[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedGameId, setSelectedGameId] = useState<string | null>(null);
  const [gameSort, setGameSort] = useState<'newest' | 'oldest' | 'recentlyPlayed' | 'mostPlayed' | 'inProgress' | 'notStarted' | 'completed'>('newest');
  const [teams, setTeams] = useState<Team[]>([
    { id: '1', name: 'Team 1', score: 0 },
    { id: '2', name: 'Team 2', score: 0 },
  ]);
  const [currentTheme, setCurrentTheme] = useState<ThemeKey>(getStoredTheme());
  const [iconSize, setIconSizeState] = useState<IconSize>(getIconSize());
  const [aiModel, setAIModel] = useState<string>('or:google/gemini-2.5-flash-lite');
  const [availableModels, setAvailableModels] = useState<Array<{id: string; name: string; provider: string}>>([]);
  const [showWizard, setShowWizard] = useState(false);
  const [wizardHidden, setWizardHidden] = useState(false);
  const [gameStateRefreshKey, setGameStateRefreshKey] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // AI Preview state
  const [aiPreviewOpen, setAiPreviewOpen] = useState(false);
  const [aiPreviewType, setAiPreviewType] = useState<AIPromptType>('categories-generate');
  const [aiPreviewData, setAiPreviewData] = useState<PreviewData>({});
  const [generatedGameData, setGeneratedGameData] = useState<GeneratedGameData | null>(null);
  const [isRegenerating] = useState(false);
  const [regeneratedItems, setRegeneratedItems] = useState<Set<string>>(new Set());
  const [isWizardGenerating, setIsWizardGenerating] = useState(false);
  const [wizardError, setWizardError] = useState<string | null>(null);
  const [regeneratingCounts] = useState<{ categories: number; clues: number } | undefined>(undefined);
  const [rewritingCategory, setRewritingCategory] = useState<number | null>(null);
  const [rewritingClue, setRewritingClue] = useState<{ catIndex: number; clueIndex: number } | null>(null);
  const [regeneratingCategory, setRegeneratingCategory] = useState<number | null>(null);
  const [regeneratingClue, setRegeneratingClue] = useState<{ catIndex: number; clueIndex: number } | null>(null);
  const [rewritingTitle, setRewritingTitle] = useState<number | null>(null);
  const [enhancingTitle, setEnhancingTitle] = useState<number | null>(null);
  const [rewritingTeamName, setRewritingTeamName] = useState<number | null>(null);
  const [enhancingTeamName, setEnhancingTeamName] = useState<number | null>(null);
  const [creatingNewCategory, setCreatingNewCategory] = useState<number | null>(null);

  // Delete confirmation dialog state
  const [deleteGameId, setDeleteGameId] = useState<string | null>(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  // Sign-in prompt dialog state
  const [showSignInPrompt, setShowSignInPrompt] = useState(false);

  // Game info dialog state
  const [gameInfoMetadata, setGameInfoMetadata] = useState<any>(null);

  // AI Model button visibility (hidden by default, shown with keyboard shortcut)
  const [showAIModelSelector, setShowAIModelSelector] = useState(false);

  const { generate: aiGenerate, isLoading: aiLoading, isAvailable: aiAvailable } = useAIGeneration();

  // Ref to track if we need to open AI preview after component mounts
  const pendingAIPreviewGame = useRef<Game | null>(null);

  useEffect(() => {
    loadGames();

    // Check if we're coming from gameplay with AI preview editor
    const storedGame = sessionStorage.getItem('aiPreviewGame');
    if (storedGame) {
      try {
        const game = JSON.parse(storedGame) as Game;
        // Clear the stored game so we don't re-open on every render
        sessionStorage.removeItem('aiPreviewGame');
        // Store for later - we'll open it after handleEditWithAIPreview is defined
        pendingAIPreviewGame.current = game;
      } catch (error) {
        console.error('Failed to load stored game for AI preview:', error);
      }
    }
  }, []);

  // Load available AI models on mount
  useEffect(() => {
    const apiBase = getAIApiBase();
    fetch(`${apiBase}/health`)
      .then(res => res.json())
      .then(data => {
        if (data.models) {
          setAvailableModels(data.models);
          const stored = localStorage.getItem('jeop3:aiModel');
          if (stored && data.models.find((m: any) => m.id === stored)) {
            setAIModel(stored);
          } else if (data.models.length > 0) {
            setAIModel(data.models[0].id);
          }
        }
        // Initialize pricing from OpenRouter (async, non-blocking)
        initializePricing().catch(err => {
          if (import.meta.env.DEV) {
            console.warn('Failed to initialize AI model pricing:', err);
          }
        });
      })
      .catch(() => {
        // Silent fail - AI features will be disabled
        if (import.meta.env.DEV) {
          console.warn('AI server not available - AI features disabled');
        }
      });
  }, []);

  // Keyboard shortcut to toggle AI Model selector (Cmd+Shift+S on Mac, Ctrl+Shift+S on Windows/Linux)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Check for Cmd+Shift+S (Mac) or Ctrl+Shift+S (Windows/Linux)
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'S') {
        e.preventDefault();
        setShowAIModelSelector(prev => !prev);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const loadGames = async () => {
    try {
      const response = await fetch('/games/index.json');
      const data = await response.json();
      const indexGames: GameMeta[] = (data.games || []).map((g: any) => ({
        ...g,
        source: 'index' as const,
        visibility: 'public' as const, // Index games are always public
      }));

      const gamesWithData = await Promise.all(
        indexGames.map(async (g) => {
          try {
            const gameResponse = await fetch(`/${g.path}`);
            const gameData = await gameResponse.json();
            return { ...g, game: gameData };
          } catch {
            return g;
          }
        })
      );

      const customGames = loadCustomGames();
      const allGames = [...gamesWithData, ...customGames];
      setGames(allGames);

      const lastSelectedId = getSelectedGameId();
      if (lastSelectedId && allGames.find((g) => g.id === lastSelectedId)) {
        setSelectedGameId(lastSelectedId);
      } else if (allGames.length > 0) {
        setSelectedGameId(allGames[0].id);
      }
    } catch (error) {
      console.error('Failed to load games:', error);
    }
  };

  const filteredGames = games.filter((game) => {
    // Search filter - search both title and subtitle
    const query = searchQuery.toLowerCase();
    return game.title.toLowerCase().includes(query) ||
           (game.subtitle && game.subtitle.toLowerCase().includes(query));
  });

  // Sorting logic - apply sorting to filtered games
  const sortedGames = [...filteredGames].sort((a, b) => {
    switch (gameSort) {
      case 'newest': {
        // Sort by createdAt (newest first), fall back to ID (for AI games with timestamp IDs)
        const aDate = a.createdAt ? new Date(a.createdAt).getTime() : (a.source === 'custom' && a.id.startsWith('ai-') ? parseInt(a.id.replace('ai-', ''), 10) : 0);
        const bDate = b.createdAt ? new Date(b.createdAt).getTime() : (b.source === 'custom' && b.id.startsWith('ai-') ? parseInt(b.id.replace('ai-', ''), 10) : 0);
        return bDate - aDate; // Newest first
      }
      case 'oldest': {
        // Sort by createdAt (oldest first), fall back to ID
        const aDate = a.createdAt ? new Date(a.createdAt).getTime() : (a.source === 'custom' && a.id.startsWith('ai-') ? parseInt(a.id.replace('ai-', ''), 10) : 0);
        const bDate = b.createdAt ? new Date(b.createdAt).getTime() : (b.source === 'custom' && b.id.startsWith('ai-') ? parseInt(b.id.replace('ai-', ''), 10) : 0);
        return aDate - bDate; // Oldest first
      }
      case 'recentlyPlayed': {
        // Sort by lastPlayed timestamp
        const aStats = getGamePlayStats(a.id);
        const bStats = getGamePlayStats(b.id);
        const aLast = aStats?.lastPlayed || 0;
        const bLast = bStats?.lastPlayed || 0;
        return bLast - aLast; // Most recent first
      }
      case 'mostPlayed': {
        // Sort by play count
        const aStats = getGamePlayStats(a.id);
        const bStats = getGamePlayStats(b.id);
        const aCount = aStats?.playCount || 0;
        const bCount = bStats?.playCount || 0;
        return bCount - aCount; // Most played first
      }
      case 'inProgress': {
        // In progress games first, then by completion percentage (lowest first)
        const aCompletion = calculateGameCompletion(a.id, a.game || null);
        const bCompletion = calculateGameCompletion(b.id, b.game || null);
        const aInProgress = aCompletion !== null && aCompletion.percentage < 100;
        const bInProgress = bCompletion !== null && bCompletion.percentage < 100;

        // If both are in progress, sort by percentage (least complete first)
        if (aInProgress && bInProgress) {
          return (aCompletion!.percentage) - (bCompletion!.percentage);
        }
        // If only a is in progress, it comes first
        if (aInProgress) return -1;
        // If only b is in progress, it comes first
        if (bInProgress) return 1;
        // Neither is in progress, keep original order
        return 0;
      }
      case 'notStarted': {
        // Games without saved state first, then by title
        const aHasState = loadGameState(a.id) !== null;
        const bHasState = loadGameState(b.id) !== null;

        if (!aHasState && bHasState) return -1;
        if (aHasState && !bHasState) return 1;
        // Both have same state status, sort by title
        return a.title.localeCompare(b.title);
      }
      case 'completed': {
        // Sort by completion percentage (highest first)
        const aCompletion = calculateGameCompletion(a.id, a.game || null);
        const bCompletion = calculateGameCompletion(b.id, b.game || null);
        const aPct = aCompletion?.percentage ?? 0;
        const bPct = bCompletion?.percentage ?? 0;
        return bPct - aPct; // Most complete first
      }
      default:
        return 0;
    }
  });

  const handleAddTeam = () => {
    if (teams.length >= 4) return; // Maximum 4 teams

    const newId = crypto.randomUUID();

    // Check if selected game has suggested team names
    let teamName = `Team ${teams.length + 1}`;
    if (selectedGameId) {
      const game = games.find(g => g.id === selectedGameId);
      if (game?.game?.suggestedTeamNames && game.game.suggestedTeamNames.length > teams.length) {
        teamName = game.game.suggestedTeamNames[teams.length];
      }
    }

    setTeams([...teams, { id: newId, name: teamName, score: 0 }]);
  };

  const handleUpdateTeamName = (id: string, name: string) => {
    setTeams(teams.map((t) => (t.id === id ? { ...t, name } : t)));
  };

  const handleRemoveTeam = (id: string) => {
    if (teams.length <= 1) return;
    setTeams(teams.filter((t) => t.id !== id));
  };

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

  const handleAIModelChange = (modelId: string) => {
    setAIModel(modelId);
    localStorage.setItem('jeop3:aiModel', modelId);
  };

  const handleStartGame = () => {
    if (!selectedGameId) return;
    const game = games.find((g) => g.id === selectedGameId);
    if (!game) return;
    setSelectedGameId(selectedGameId);
    // Record that this game was played
    recordGamePlay(selectedGameId);
    onSelectGame(selectedGameId, game.game, teams);
  };

  const handleDeleteGame = (gameId: string) => {
    setDeleteGameId(gameId);
    setShowDeleteDialog(true);
  };

  const confirmDeleteGame = () => {
    if (!deleteGameId) return;

    // Remove from custom games
    const customGames = loadCustomGames();
    const updatedGames = customGames.filter(g => g.id !== deleteGameId);
    saveCustomGames(updatedGames);

    // Remove game state
    localStorage.removeItem(stateKey(deleteGameId));

    // Update games state
    setGames(prev => prev.filter(g => g.id !== deleteGameId));

    // If the deleted game was selected, select another game
    if (selectedGameId === deleteGameId) {
      const remainingGames = games.filter(g => g.id !== deleteGameId);
      if (remainingGames.length > 0) {
        setSelectedGameId(remainingGames[0].id);
      } else {
        setSelectedGameId(null);
      }
    }

    // Close dialog
    setShowDeleteDialog(false);
    setDeleteGameId(null);
  };

  // ==================== IMPORT/EXPORT HANDLERS ====================

  const handleExportGame = (gameMeta: GameMeta) => {
    if (!gameMeta.game) return;

    const gameData = {
      ...gameMeta.game,
      _exportedAt: new Date().toISOString(),
      _exportedFrom: 'jeop3',
    };

    const filename = `${slugify(gameMeta.title)}.json`;
    const blob = new Blob([JSON.stringify(gameData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleResetGame = (gameId: string) => {
    // Get the game to access suggested team names
    const game = games.find(g => g.id === gameId);
    if (!game?.game) return;

    // Reset to 2 teams with suggested names or defaults
    const suggestedNames = game.game.suggestedTeamNames || [];
    const resetTeams: Array<{ id: string; name: string; score: number }> = [
      { id: '1', name: suggestedNames[0] || 'Team 1', score: 0 },
      { id: '2', name: suggestedNames[1] || 'Team 2', score: 0 },
    ];

    // Create fresh game state
    const resetState: GameState = {
      used: {},
      teams: resetTeams,
      activeTeamId: '1',
      currentRound: 1,
    };

    // Save the reset state
    saveGameState(gameId, resetState);

    // Update local teams state to match reset state
    setTeams(resetTeams);

    // Force re-render to update the UI
    setGameStateRefreshKey(prev => prev + 1);

    console.log(`[MainMenu] Reset game state for ${gameId} - reset to 2 teams: ${resetTeams.map(t => t.name).join(', ')}`);
  };

  const handleImportGame = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Require sign-in to import games (consistent with AI creation)
    if (!isSignedIn) {
      setShowSignInPrompt(true);
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const content = e.target?.result as string;
        const gameData = JSON.parse(content) as Game & { _exportedFrom?: string };

        // Validate basic structure
        if (!gameData.title || !Array.isArray(gameData.categories)) {
          throw new Error('Invalid game file structure');
        }

        // Create a unique ID
        const gameId = `imported-${Date.now()}`;

        // Get user email (should be available since we checked isSignedIn)
        const userEmail = user?.emailAddresses?.[0]?.emailAddress;

        // Create game metadata
        const gameMeta: GameMeta = {
          id: gameId,
          title: gameData.title,
          subtitle: gameData.subtitle || '',
          source: 'custom',
          game: gameData,
          createdAt: new Date().toISOString(),
          createdBy: userEmail,
          // Default to public if no user email (shouldn't happen, but safe fallback)
          visibility: userEmail ? 'private' : 'public',
        };

        // Save to localStorage
        const customGames = loadCustomGames();
        const updatedGames = [...customGames, gameMeta];
        saveCustomGames(updatedGames);

        // Add to games state
        setGames(prev => [...prev, gameMeta]);
        setSelectedGameId(gameId);

      } catch (error) {
        console.error('Failed to import game:', error);
      }
    };

    reader.readAsText(file);

    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleCreateGameImport = () => {
    fileInputRef.current?.click();
  };

  const handleEditWithAIPreview = (game: Game) => {
    // Populate AI preview data with existing game data
    const categories = game.categories.map(cat => ({
      title: cat.title,
      contentTopic: cat.title, // Use title as content topic
      clues: cat.clues.map(clue => ({
        value: clue.value,
        clue: clue.clue,
        response: clue.response,
      })),
    }));

    const titles = game.title ? [{
      title: game.title,
      subtitle: game.subtitle || '',
    }] : [];

    const suggestedTeamNames = game.suggestedTeamNames || ['Team 1', 'Team 2'];

    setGeneratedGameData({
      game,
      categories,
      titles,
      suggestedTeamNames,
      theme: 'Custom',
      difficulty: 'normal',
    });

    setAiPreviewData({
      categories,
      titles,
      suggestedTeamNames,
    });

    setAiPreviewType('categories-generate');
    setAiPreviewOpen(true);
    setSelectedGameId(null); // Don't select a game when editing
  };

  // Check for pending AI preview game from gameplay
  useEffect(() => {
    if (pendingAIPreviewGame.current) {
      handleEditWithAIPreview(pendingAIPreviewGame.current);
      pendingAIPreviewGame.current = null;
    }
  }, []);

  // Update teams when a game is selected
  useEffect(() => {
    if (selectedGameId) {
      const game = games.find(g => g.id === selectedGameId);

      // First, check if there's a saved game state
      const savedState = loadGameState(selectedGameId);
      if (savedState && savedState.teams && savedState.teams.length > 0) {
        // Load teams from saved state (game in progress)
        // Only replace with suggested names if the saved names are default "Team 1", "Team 2", etc.
        if (game?.game?.suggestedTeamNames && game.game.suggestedTeamNames.length > 0) {
          const suggestedNames = game.game.suggestedTeamNames;
          setTeams(savedState.teams.map((team, index) => {
            // Check if the saved name is a default name
            const isDefaultName = team.name.match(/^Team \d+$/);
            return {
              ...team,
              name: (isDefaultName && suggestedNames[index]) ? suggestedNames[index] : team.name,
              score: 0, // Reset scores for display
            };
          }));
        } else {
          setTeams(savedState.teams.map(t => ({ ...t, score: 0 }))); // Reset scores for display
        }
        return;
      }

      // No saved state - use suggested team names for existing teams
      if (game?.game?.suggestedTeamNames && game.game.suggestedTeamNames.length > 0) {
        const suggestedNames = game.game.suggestedTeamNames;
        // Only update existing team names, don't add more teams
        setTeams(prevTeams => {
          return prevTeams.map((team, index) => ({
            ...team,
            name: suggestedNames[index] || team.name,
          }));
        });
      }
    }
  }, [selectedGameId, games]);

  // ==================== AI TEAM NAME HANDLERS ====================

  const handleAIGenerateTeamName = async (teamIndex: number) => {
    if (!aiAvailable) return;
    const otherTeamNames = teams
      .map((t, i) => (i === teamIndex ? null : t.name))
      .filter((n): n is string => Boolean(n?.trim()));
    const selectedGame = games.find((g) => g.id === selectedGameId);

    // Build game topic with categories for better context
    const categoryTopics = selectedGame?.game?.categories.map(c => c.title).join(', ') || '';
    const gameTopic = selectedGame?.game
      ? `${selectedGame.game.title}${selectedGame.game.subtitle ? ': ' + selectedGame.game.subtitle : ''}${categoryTopics ? '. Categories: ' + categoryTopics : ''}`
      : selectedGame?.title || selectedGame?.subtitle || '';

    const result = await aiGenerate('team-name-random', {
      count: 1,
      existingNames: otherTeamNames,
      gameTopic,
    });

    if (result && typeof result === 'object' && 'names' in result) {
      const names = result as { names: string[] };
      if (names.names[0]) {
        setTeams((prev) =>
          prev.map((t, i) => (i === teamIndex ? { ...t, name: names.names[0] } : t))
        );
      }
    }
  };

  const handleAIEnhanceTeamName = async (teamIndex: number) => {
    if (!aiAvailable) return;
    const currentName = teams[teamIndex]?.name || '';
    const otherTeamNames = teams
      .map((t, i) => (i === teamIndex ? null : t.name))
      .filter((n): n is string => Boolean(n?.trim()));
    const selectedGame = games.find((g) => g.id === selectedGameId);

    // Build game topic with categories for better context
    const categoryTopics = selectedGame?.game?.categories.map(c => c.title).join(', ') || '';
    const gameTopic = selectedGame?.game
      ? `${selectedGame.game.title}${selectedGame.game.subtitle ? ': ' + selectedGame.game.subtitle : ''}${categoryTopics ? '. Categories: ' + categoryTopics : ''}`
      : selectedGame?.title || selectedGame?.subtitle || '';

    const result = await aiGenerate('team-name-enhance', {
      currentName,
      existingNames: otherTeamNames,
      gameTopic,
    });

    if (result && typeof result === 'object' && 'name' in result) {
      const enhanced = result as { name: string };
      if (enhanced.name) {
        setTeams((prev) =>
          prev.map((t, i) => (i === teamIndex ? { ...t, name: enhanced.name } : t))
        );
      }
    }
  };

  const handleAIGenerateAllTeamNames = async () => {
    if (!aiAvailable) return;
    const selectedGame = games.find((g) => g.id === selectedGameId);

    // Build game topic with categories for better context
    const categoryTopics = selectedGame?.game?.categories.map(c => c.title).join(', ') || '';
    const gameTopic = selectedGame?.game
      ? `${selectedGame.game.title}${selectedGame.game.subtitle ? ': ' + selectedGame.game.subtitle : ''}${categoryTopics ? '. Categories: ' + categoryTopics : ''}`
      : selectedGame?.title || selectedGame?.subtitle || '';

    const result = await aiGenerate('team-name-random', {
      count: teams.length,
      existingNames: [],
      gameTopic,
    });

    if (result && typeof result === 'object' && 'names' in result) {
      const names = result as { names: string[] };
      if (names.names.length === teams.length) {
        setTeams((prev) =>
          prev.map((t, i) => ({ ...t, name: names.names[i] || t.name }))
        );
      }
    }
  };

  // ==================== AI NEW GAME GENERATION ====================

  const handleWizardComplete = async (wizardData: WizardCompleteData) => {
    const { mode, theme, difficulty, sourceMode, referenceMaterial, referenceUrl, customSources } = wizardData;

    // Only AI mode should reach here - manual and import-json are handled directly in the wizard
    if (mode !== 'ai') {
      console.error('[MainMenu] handleWizardComplete called with non-AI mode:', mode);
      return;
    }

    // Reset regenerated items for new game
    setRegeneratedItems(new Set());
    setWizardError(null); // Clear any previous errors
    setIsWizardGenerating(true);

    try {
      let categoriesList: Array<{
        title: string;
        clues: Array<{ value: number; clue: string; response: string }>;
      }> = [];
      let categoriesMetadata: any = undefined;

      // Handle custom sources mode - generate categories from each source
      if (sourceMode === 'custom' && customSources && customSources.length > 0) {
        console.log('[MainMenu] Generating categories from custom sources:', customSources);

        // Collect all successful results and track failures
        const failedSources: Array<{ source: CustomSource; error: string }> = [];

        for (const source of customSources) {
          // Determine prompt type based on source type and content availability
          let promptType: AIPromptType = 'categories-generate';
          const hasContent = (source.type === 'paste' && source.content) ||
                            (source.type === 'url' && source.fetchedContent);

          if (hasContent) {
            promptType = 'categories-generate-from-content';
          }

          const context: Record<string, any> = {
            theme: source.topic || 'random',
            count: source.categoryCount,
          };

          if (source.type === 'paste' && source.content) {
            context.referenceMaterial = source.content;
            context.sourceCharacters = source.content.length;
          } else if (source.type === 'url' && source.fetchedContent) {
            context.referenceMaterial = source.fetchedContent;
            context.referenceUrl = source.url;
            context.sourceCharacters = source.fetchedContent.length;
          }

          console.log('[MainMenu] Generating from source:', { type: source.type, categoryCount: source.categoryCount, promptType });
          try {
            const sourceResult = await aiGenerate(promptType, context, difficulty);

            if (!sourceResult || typeof sourceResult !== 'object' || !('categories' in sourceResult)) {
              console.error('[MainMenu] Invalid categories result for source:', source);
              failedSources.push({
                source,
                error: 'Invalid response format from AI'
              });
              continue;
            }

            const sourceCategories = (sourceResult as any).categories as Array<{
              title: string;
              clues: Array<{ value: number; clue: string; response: string }>;
            }>;

            // Validate we got the requested number of categories
            if (sourceCategories.length !== source.categoryCount) {
              if (sourceCategories.length < source.categoryCount) {
                console.warn(`[MainMenu] ⚠️ Source "${source.topic || source.url || 'pasted content'}" returned only ${sourceCategories.length} of ${source.categoryCount} requested categories. Using what we got.`);
              } else {
                console.warn(`[MainMenu] Source returned ${sourceCategories.length} categories, requested ${source.categoryCount}. Truncating to ${source.categoryCount}.`);
              }
            }
            // Only take the requested number (or fewer if AI didn't return enough)
            const adjustedCategories = sourceCategories.slice(0, source.categoryCount);

            // Attach source material to each category for later AI operations
            const categoriesWithSource = adjustedCategories.map(cat => ({
              ...cat,
              sourceMaterial: source.type === 'paste' ? source.content :
                          source.type === 'url' ? source.fetchedContent : undefined,
              sourceUrl: source.type === 'url' ? source.url : undefined,
            }));

            categoriesList.push(...categoriesWithSource);

            // Capture metadata from first successful generation
            if (!categoriesMetadata) {
              categoriesMetadata = (sourceResult as any)._metadata;
            }
          } catch (error) {
            console.error('[MainMenu] Error generating from source:', source, error);
            failedSources.push({
              source,
              error: error instanceof Error ? error.message : 'Unknown error'
            });
          }
        }

        // Check if we had any failures and if we have at least some categories
        if (failedSources.length > 0) {
          const sourceNames = failedSources.map(f => {
            if (f.source.type === 'paste') {
              return `Pasted content (${f.source.content?.length || 0} chars)`;
            }
            return `"${f.source.topic || f.source.url || 'source'}"`;
          }).join(', ');
          if (categoriesList.length === 0) {
            // Complete failure
            setWizardError(`Failed to generate categories from ${sourceNames}. Please try again.`);
            setIsWizardGenerating(false);
            return;
          } else {
            // Partial success - log warning but continue with what we have
            console.group('⚠️ [MainMenu] Partial Generation Failure');
            console.warn(`Some sources failed to generate categories. Generated ${categoriesList.length} categories from successful sources.`);
            console.table(failedSources.map(f => ({
              Type: f.source.type,
              Source: f.source.type === 'paste' ? `Pasted content (${f.source.content?.length || 0} chars)` : f.source.topic || f.source.url,
              Error: f.error
            })));
            console.warn('Continuing with ' + categoriesList.length + ' categories. User will see results in preview.');
            console.groupEnd();
          }
        }
      } else {
        // Original single-source logic
        // Determine prompt type and build context based on source mode
        const promptType: AIPromptType = (sourceMode !== 'scratch' && referenceMaterial)
          ? 'categories-generate-from-content'
          : 'categories-generate';

        const context: Record<string, any> = {
          theme: theme || 'random',
          count: 6,
        };

        // Add reference material for content-based generation
        if (sourceMode !== 'scratch' && referenceMaterial) {
          context.referenceMaterial = referenceMaterial;
          context.referenceUrl = referenceUrl;
          context.sourceCharacters = referenceMaterial.length;
        }

        // Generate categories
        const categoriesResult = await aiGenerate(
          promptType,
          context,
          difficulty
        );

        console.log('[MainMenu] AI generation result:', { categoriesResult, promptType, hasCategories: categoriesResult && 'categories' in categoriesResult });

        if (!categoriesResult || typeof categoriesResult !== 'object' || !('categories' in categoriesResult)) {
          console.error('[MainMenu] Invalid categories result:', categoriesResult);
          setWizardError('Failed to generate categories. The AI returned an invalid response. Please try again.');
          setIsWizardGenerating(false);
          return; // Keep wizard open
        }

        const allCategories = (categoriesResult as any).categories as Array<{
          title: string;
          clues: Array<{ value: number; clue: string; response: string }>;
        }>;

        // Validate we got 6 categories as requested
        if (allCategories.length !== 6) {
          console.warn(`[MainMenu] AI returned ${allCategories.length} categories but requested 6. Adjusting...`);
        }
        // Only take the first 6 categories
        const sliceCategories = allCategories.slice(0, 6);

        // Attach source material to each category for later AI operations (single-source mode)
        categoriesList = sliceCategories.map(cat => ({
          ...cat,
          sourceMaterial: referenceMaterial, // All categories share the same source in single-source mode
          sourceUrl: referenceUrl,
        }));

        // Capture metadata from categories generation
        categoriesMetadata = (categoriesResult as any)._metadata;
      }

      // Generate titles - use actual categories for better themed titles
      const titleContext: Record<string, any> = { theme: theme || 'random', hasContent: true };

      // Always include the actual categories and clues that were just generated
      if (categoriesList && categoriesList.length > 0) {
        const categorySummaries = categoriesList.map(cat => {
          const clueText = (cat.clues || [])
            .slice(0, 2) // Just first 2 clues per category
            .map(c => `  $${c.value} ${c.clue} (${c.response})`)
            .join('\n');
          return `${cat.title}\n${clueText}`;
        }).join('\n\n');
        titleContext.sampleContent = `Game Categories:\n\n${categorySummaries}`;
      }

      console.log('[MainMenu] Generating titles with context:', {
        hasContent: titleContext.hasContent,
        sampleLength: titleContext.sampleContent?.length,
        categoriesCount: categoriesList?.length
      });
      const titlesResult = await aiGenerate(
        'game-title',
        titleContext,
        difficulty
      );

      const titlesList = (titlesResult && typeof titlesResult === 'object' && 'titles' in titlesResult)
        ? (titlesResult as any).titles as Array<{ title: string; subtitle: string }>
        : [{ title: `${theme || 'Trivia'} Night`, subtitle: theme || '' }];

      console.log('[MainMenu] Generated titles:', titlesList);

      // Generate team names - include theme and category context for themed names
      const teamNamesContext: Record<string, any> = {
        count: 4,
        existingNames: [],
      };

      // Build game topic from theme and category titles for better themed team names
      let gameTopic = theme || 'general trivia';
      if (sourceMode === 'custom' && customSources) {
        // For custom mode, include all source topics for better team name context
        const sourceTopics = customSources
          .filter(s => s.type === 'topic')
          .map(s => s.topic || '')
          .filter(Boolean);
        if (sourceTopics.length > 0) {
          gameTopic = sourceTopics.join(', ');
        }
        if (categoriesList.length > 0) {
          const categoryTitles = categoriesList.map(c => c.title).slice(0, 3).join(', ');
          gameTopic += ` (categories: ${categoryTitles})`;
        }
      } else if (categoriesList.length > 0) {
        const categoryTitles = categoriesList.map(c => c.title).slice(0, 3).join(', ');
        gameTopic += ` (categories: ${categoryTitles})`;
      }
      teamNamesContext.gameTopic = gameTopic;

      console.log('[MainMenu] Generating team names with gameTopic:', gameTopic);
      const teamNamesResult = await aiGenerate('team-name-random', teamNamesContext, difficulty);

      let suggestedTeamNames = ['Team 1', 'Team 2', 'Team 3', 'Team 4'];
      if (teamNamesResult && typeof teamNamesResult === 'object' && 'names' in teamNamesResult) {
        const names = (teamNamesResult as any).names as string[];
        if (Array.isArray(names) && names.length === 4) {
          suggestedTeamNames = names;
        }
      }

      // Build game structure
      const gameCategories: Array<{ title: string; clues: Array<{ value: number; clue: string; response: string }> }> = [];
      for (const cat of categoriesList) {
        const categoryClues: Array<{ value: number; clue: string; response: string }> = [];
        for (const clue of cat.clues) {
          categoryClues.push({
            value: clue.value,
            clue: clue.clue,
            response: clue.response,
          });
        }
        gameCategories.push({
          title: cat.title,
          clues: categoryClues,
        });
      }

      // Build enhanced metadata with source info
      const enhancedMetadata = {
        ...categoriesMetadata,
        sourceMode,
        difficulty,
        ...(sourceMode === 'custom' && customSources ? {
          customSources: customSources.map(s => ({
            type: s.type,
            content: s.type === 'topic' ? s.topic || '' :
                     s.type === 'url' ? s.url || '' :
                     (s.content || '').substring(0, 200) + '...',
          }))
        } : {}),
        ...(sourceMode !== 'custom' && sourceMode !== 'scratch' && referenceMaterial && {
          sourceMaterial: referenceMaterial.substring(0, 200) + '...',
        }),
        ...(referenceUrl && { sourceUrl: referenceUrl }),
      };

      const newGame: Game = {
        title: titlesList[0].title,
        subtitle: titlesList[0].subtitle,
        categories: gameCategories,
        rows: 5,
        suggestedTeamNames: suggestedTeamNames,
        metadata: enhancedMetadata,
      };

      // Store the generated game data for later use
      setGeneratedGameData({
        game: newGame,
        categories: categoriesList,
        titles: titlesList,
        suggestedTeamNames,
        theme: theme || 'random',
        difficulty: difficulty || 'normal',
        sourceMode,
        referenceUrl,
        referenceMaterial: sourceMode !== 'custom' ? referenceMaterial : undefined, // Store for single-source mode
        sourceCharacters: referenceMaterial?.length,
        metadata: enhancedMetadata,
      });

      // Success! Hide wizard and show preview dialog
      setIsWizardGenerating(false);
      setWizardHidden(true);

      setAiPreviewData({ categories: categoriesList, titles: titlesList, suggestedTeamNames });
      setAiPreviewType('categories-generate');
      setAiPreviewOpen(true);

    } catch (error) {
      console.error('[MainMenu] AI generation error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to generate game. Please try again.';
      setWizardError(errorMessage);
      setIsWizardGenerating(false);
      // Keep wizard open on error
    }
  };

  // ==================== AI PREVIEW HANDLERS ====================

  const handleAIPreviewConfirm = useCallback((selected: { title?: number; items: Set<string> }) => {
    setAiPreviewOpen(false);
    setShowWizard(false);
    setWizardHidden(false);

    if (!generatedGameData) return;

    const { title: selectedTitleIndex, items: checkedItems } = selected;

    // Apply selected title
    const selectedTitle = generatedGameData.titles[selectedTitleIndex ?? 0] ?? generatedGameData.titles[0];

    // Filter out checked items (marked for regeneration) from the game
    let categoriesToApply = generatedGameData.categories;

    if (checkedItems.size > 0) {
      categoriesToApply = generatedGameData.categories
        .map((cat, i) => {
          const catId = `cat-${i}`;
          if (checkedItems.has(catId)) return null;

          const uncheckedClues = cat.clues.filter((_, j) => {
            const clueId = `cat-${i}-clue-${j}`;
            return !checkedItems.has(clueId);
          });

          if (uncheckedClues.length === 0) {
            return null;
        }

        return {
          ...cat,
          clues: uncheckedClues
        };
      })
      .filter((cat): cat is NonNullable<typeof cat> => cat !== null);
    }

    // Build the final game with selected title and filtered categories
    const finalGame: Game = {
      ...generatedGameData.game,
      title: selectedTitle.title,
      subtitle: selectedTitle.subtitle,
      suggestedTeamNames: generatedGameData.suggestedTeamNames,
      metadata: generatedGameData.metadata,
      categories: categoriesToApply.map(cat => ({
        title: cat.title,
        clues: cat.clues.map(clue => ({
          value: clue.value,
          clue: clue.clue,
          response: clue.response,
          completed: false,
        })),
      })),
    };

    // Generate a unique ID for this game
    const gameId = `ai-${Date.now()}`;

    // Get user email (should be available since AI creation requires auth)
    const userEmail = user?.emailAddresses?.[0]?.emailAddress;

    // Create game metadata and save to localStorage
    const gameMeta: GameMeta = {
      id: gameId,
      title: finalGame.title,
      subtitle: finalGame.subtitle,
      source: 'custom',
      game: finalGame,
      createdAt: new Date().toISOString(),
      createdBy: userEmail,
      // Default to private if signed in, public as safe fallback
      visibility: userEmail ? 'private' : 'public',
    };

    // Save to localStorage
    const customGames = loadCustomGames();
    const updatedGames = [...customGames, gameMeta];
    saveCustomGames(updatedGames);

    // Add to games state
    setGames(prev => [...prev, gameMeta]);
    setSelectedGameId(gameId);

    // Start playing
    onSelectGame(gameId, finalGame);
    setGeneratedGameData(null);
  }, [generatedGameData, onSelectGame]);

  const handleAIPreviewCancel = () => {
    setAiPreviewOpen(false);
    setShowWizard(false);
    setWizardHidden(false);
    setGeneratedGameData(null);
  };

  const handleAIPreviewBack = () => {
    setAiPreviewOpen(false);
    setWizardHidden(false);
  };

  const handleRegenerateAll = useCallback(async () => {
    setAiPreviewOpen(false);

    if (!generatedGameData) return;

    // Reset regenerated items since we're regenerating everything
    setRegeneratedItems(new Set());

    // Re-run the generation with same theme/difficulty
    const result = await aiGenerate(
      'categories-generate',
      { theme: generatedGameData.theme || 'random', count: 6 },
      generatedGameData.difficulty
    );

    if (!result || typeof result !== 'object' || !('categories' in result)) {
      return;
    }

    const categoriesList = (result as any).categories as Array<{
      title: string;
      clues: Array<{ value: number; clue: string; response: string }>;
    }>;

    // Capture metadata from AI generation
    const categoriesMetadata = (result as any)._metadata;

    // Build context with actual categories for better titles
    const titleContext: Record<string, any> = {
      theme: generatedGameData.theme || 'random',
      count: 3,
      hasContent: true,
    };

    // Include the actual categories and clues in the context
    if (categoriesList && categoriesList.length > 0) {
      const categorySummaries = categoriesList.map(cat => {
        const clueText = (cat.clues || [])
          .slice(0, 2) // Just first 2 clues per category
          .map(c => `  $${c.value} ${c.clue} (${c.response})`)
          .join('\n');
        return `${cat.title}\n${clueText}`;
      }).join('\n\n');
      titleContext.sampleContent = `Game Categories:\n\n${categorySummaries}`;
    }

    // Generate titles
    const titlesResult = await aiGenerate(
      'game-title',
      titleContext,
      generatedGameData.difficulty
    );

    const titlesList = (titlesResult && typeof titlesResult === 'object' && 'titles' in titlesResult)
      ? (titlesResult as any).titles as Array<{ title: string; subtitle: string }>
      : generatedGameData.titles;

    // Generate team names based on theme
    const teamNamesResult = await aiGenerate('team-name-random', {
      count: 2,
      existingNames: [],
      gameTopic: generatedGameData.theme || '',
    });

    const suggestedTeamNames = (teamNamesResult && typeof teamNamesResult === 'object' && 'names' in teamNamesResult)
      ? (teamNamesResult as any).names as string[]
      : generatedGameData.suggestedTeamNames;

    // Build categories for the Game object
    const gameCategories: Category[] = [];
    for (const cat of categoriesList) {
      const categoryClues: Clue[] = [];
      for (const clue of cat.clues) {
        categoryClues.push({
          value: clue.value,
          clue: clue.clue,
          response: clue.response,
        });
      }
      gameCategories.push({
        title: cat.title,
        clues: categoryClues,
      });
    }

    const newGame: Game = {
      title: titlesList[0].title,
      subtitle: titlesList[0].subtitle,
      suggestedTeamNames,
      categories: gameCategories,
      rows: 5,
      metadata: categoriesMetadata,
    };

    setGeneratedGameData({
      game: newGame,
      categories: categoriesList,
      titles: titlesList,
      suggestedTeamNames,
      theme: generatedGameData.theme,
      difficulty: generatedGameData.difficulty,
    });

    setAiPreviewData({ categories: categoriesList, titles: titlesList });
    setAiPreviewOpen(true);
  }, [generatedGameData, aiGenerate]);

  // ==================== AI REWRITE HANDLERS ====================

  const handleRewriteCategoryTitle = useCallback(async (catIndex: number) => {
    if (!generatedGameData || !aiAvailable) return null;

    setRewritingCategory(catIndex);

    try {
      const category = generatedGameData.categories[catIndex];
      const contentTopic = category.contentTopic || category.title;
      const theme = generatedGameData.theme || contentTopic;

      // Use the new category-title-generate prompt to get a clever title
      // that fits the contentTopic
      const result = await aiGenerate(
        'category-title-generate',
        {
          contentTopic,
          theme,
        },
        generatedGameData.difficulty
      );

      if (result && typeof result === 'object' && 'title' in result) {
        const titleData = result as { title: string };
        const newTitle = titleData.title;

        // Update the categories
        const updatedCategories = [...generatedGameData.categories];
        updatedCategories[catIndex] = {
          ...category,
          title: newTitle,
        };

        // Update the game
        const updatedGame: Game = {
          ...generatedGameData.game,
          categories: updatedCategories.map(cat => ({
            title: cat.title,
            clues: cat.clues.map(clue => ({
              value: clue.value,
              clue: clue.clue,
              response: clue.response,
            })),
          })),
        };

        setGeneratedGameData({
          ...generatedGameData,
          game: updatedGame,
          categories: updatedCategories,
        });

        setAiPreviewData(prev => ({
          ...prev,
          categories: updatedCategories,
        }));
        return newTitle;
      }
      return null;
    } finally {
      setRewritingCategory(null);
    }
  }, [generatedGameData, aiAvailable, aiGenerate]);

  const handleRewriteClue = useCallback(async (catIndex: number, clueIndex: number) => {
    if (!generatedGameData || !aiAvailable) return null;

    setRewritingClue({ catIndex, clueIndex });

    try {
      const category = generatedGameData.categories[catIndex];
      const clue = category.clues[clueIndex];

      // Collect all existing answers to avoid duplicates
      const existingAnswers = generatedGameData.categories
        .flatMap(cat => cat.clues.map(c => c.response))
        .filter((answer, index, self) => answer !== clue.response && self.indexOf(answer) === index);

      // Use per-category sourceMaterial if available, otherwise fall back to global
      const sourceMaterial = category.sourceMaterial || generatedGameData.referenceMaterial;

      const result = await aiGenerate('editor-rewrite-clue', {
        categoryTitle: category.title,
        contentTopic: category.contentTopic || category.title,
        currentClue: clue.clue,
        currentResponse: clue.response,
        value: clue.value,
        existingAnswers,
        referenceMaterial: sourceMaterial,
      });

      if (result && typeof result === 'object' && 'clue' in result) {
        const rewrittenClue = result as { clue: string };

        // Update the categories
        const updatedCategories = [...generatedGameData.categories];
        updatedCategories[catIndex] = {
          ...category,
          clues: [...category.clues],
        };
        updatedCategories[catIndex].clues[clueIndex] = {
          ...clue,
          clue: rewrittenClue.clue,
        };

        // Update the game
        const updatedGame: Game = {
          ...generatedGameData.game,
          categories: updatedCategories.map(cat => ({
            title: cat.title,
            clues: cat.clues.map(clue => ({
              value: clue.value,
              clue: clue.clue,
              response: clue.response,
            })),
          })),
        };

        setGeneratedGameData({
          ...generatedGameData,
          game: updatedGame,
          categories: updatedCategories,
        });

        setAiPreviewData(prev => ({
          ...prev,
          categories: updatedCategories,
        }));
        return rewrittenClue.clue;
      }
      return null;
    } finally {
      setRewritingClue(null);
    }
  }, [generatedGameData, aiAvailable, aiGenerate]);

  const handleRegenerateTitle = useCallback(async (titleIndex: number) => {
    if (!generatedGameData || !aiAvailable) return null;

    setRewritingTitle(titleIndex);

    try {
      const theme = generatedGameData.theme || 'general';
      const otherTitles = generatedGameData.titles.filter((_, i) => i !== titleIndex);

      // Build context with game content for better titles
      const titleContext: Record<string, any> = {
        theme,
        count: 1,
        existingTitles: otherTitles,
        hasContent: true,
      };

      // Include the actual categories and clues in the context
      if (generatedGameData.categories && generatedGameData.categories.length > 0) {
        const categorySummaries = generatedGameData.categories.map(cat => {
          const clueText = cat.clues
            .slice(0, 2) // Just first 2 clues per category
            .map(c => `  $${c.value} ${c.clue} (${c.response})`)
            .join('\n');
          return `${cat.title}\n${clueText}`;
        }).join('\n\n');
        titleContext.sampleContent = `Game Categories:\n\n${categorySummaries}`;
      }

      const result = await aiGenerate(
        'game-title',
        titleContext,
        generatedGameData.difficulty
      );

      if (result && typeof result === 'object' && 'titles' in result) {
        const titlesData = result as { titles: Array<{ title: string; subtitle: string }> };
        if (titlesData.titles && titlesData.titles.length > 0) {
          // Update the titles
          const updatedTitles = [...generatedGameData.titles];
          updatedTitles[titleIndex] = titlesData.titles[0];

          setGeneratedGameData({
            ...generatedGameData,
            titles: updatedTitles,
          });

          setAiPreviewData(prev => ({
            ...prev,
            titles: updatedTitles,
          }));
          return titlesData.titles[0];
        }
      }
      return null;
    } finally {
      setRewritingTitle(null);
    }
  }, [generatedGameData, aiAvailable, aiGenerate]);

  const handleRegenerateAllTitles = useCallback(async () => {
    if (!generatedGameData || !aiAvailable) return;

    setRewritingTitle(0); // Set to 0 to indicate all are regenerating

    try {
      const theme = generatedGameData.theme || 'general';

      // Build context with actual game content for better titles
      const titleContext: Record<string, any> = { theme, count: 3 };

      // Include the actual categories and clues in the context
      if (generatedGameData.categories && generatedGameData.categories.length > 0) {
        titleContext.hasContent = true;
        // Build a summary of all categories with sample clues
        const categorySummaries = generatedGameData.categories.map(cat => {
          const clueText = cat.clues
            .slice(0, 2) // Just first 2 clues per category
            .map(c => `  $${c.value} ${c.clue} (${c.response})`)
            .join('\n');
          return `${cat.title}\n${clueText}`;
        }).join('\n\n');
        titleContext.sampleContent = `Game Categories:\n\n${categorySummaries}`;
      }

      const result = await aiGenerate(
        'game-title',
        titleContext,
        generatedGameData.difficulty
      );

      if (result && typeof result === 'object' && 'titles' in result) {
        const titlesData = result as { titles: Array<{ title: string; subtitle: string }> };
        if (titlesData.titles && titlesData.titles.length >= 3) {
          setGeneratedGameData({
            ...generatedGameData,
            titles: titlesData.titles,
          });

          setAiPreviewData(prev => ({
            ...prev,
            titles: titlesData.titles,
          }));
        }
      }
    } finally {
      setRewritingTitle(null);
    }
  }, [generatedGameData, aiAvailable, aiGenerate]);

  const handleRegenerateTeamName = useCallback(async (teamIndex: number) => {
    if (!generatedGameData || !aiAvailable) return null;

    setRewritingTeamName(teamIndex);

    try {
      const theme = generatedGameData.theme || 'general';
      const otherNames = generatedGameData.suggestedTeamNames.filter((_, i) => i !== teamIndex);

      const result = await aiGenerate('team-name-random', {
        count: 1,
        existingNames: otherNames,
        gameTopic: theme,
      });

      if (result && typeof result === 'object' && 'names' in result) {
        const names = result as { names: string[] };
        if (names.names && names.names.length > 0) {
          // Update the team names
          const updatedNames = [...generatedGameData.suggestedTeamNames];
          updatedNames[teamIndex] = names.names[0];

          setGeneratedGameData({
            ...generatedGameData,
            suggestedTeamNames: updatedNames,
          });

          setAiPreviewData(prev => ({
            ...prev,
            suggestedTeamNames: updatedNames,
          }));
          return names.names[0];
        }
      }
      return null;
    } finally {
      setRewritingTeamName(null);
    }
  }, [generatedGameData, aiAvailable, aiGenerate]);

  const handleRegenerateAllTeamNames = useCallback(async () => {
    if (!generatedGameData || !aiAvailable) return;

    setRewritingTeamName(0); // Set to 0 to indicate all are regenerating

    try {
      const theme = generatedGameData.theme || 'general';

      const result = await aiGenerate('team-name-random', {
        count: 4,
        existingNames: [],
        gameTopic: theme,
      });

      if (result && typeof result === 'object' && 'names' in result) {
        const names = result as { names: string[] };
        if (names.names && names.names.length >= 4) {
          setGeneratedGameData({
            ...generatedGameData,
            suggestedTeamNames: names.names,
          });

          setAiPreviewData(prev => ({
            ...prev,
            suggestedTeamNames: names.names,
          }));
        }
      }
    } finally {
      setRewritingTeamName(null);
    }
  }, [generatedGameData, aiAvailable, aiGenerate]);

  const handleRegenerateCategory = useCallback(async (catIndex: number) => {
    if (!generatedGameData || !aiAvailable) return;

    setRegeneratingCategory(catIndex);

    try {
      const category = generatedGameData.categories[catIndex];
      const contentTopic = category.contentTopic || category.title;
      const theme = generatedGameData.theme || contentTopic;

      // Collect all existing answers from OTHER categories to avoid duplicates
      const existingAnswers = generatedGameData.categories
        .filter((_, i) => i !== catIndex)
        .flatMap(cat => cat.clues.map(c => c.response));

      // Use per-category sourceMaterial if available, otherwise fall back to global
      const sourceMaterial = category.sourceMaterial || generatedGameData.referenceMaterial;

      const result = await aiGenerate(
        'category-replace-all',
        {
          categoryTitle: category.title,
          contentTopic,
          theme,
          existingClues: category.clues,
          existingAnswers,
          referenceMaterial: sourceMaterial,
        },
        generatedGameData.difficulty
      );

      if (result && typeof result === 'object') {
        const catData = result as { category?: typeof category; title?: string; clues?: typeof category.clues };
        const newCat = catData.category || (catData.title && catData.clues ? { title: catData.title, clues: catData.clues } : null);
        if (newCat) {
          const updatedCategories = [...generatedGameData.categories];
          // Preserve sourceMaterial and sourceUrl when updating category
          updatedCategories[catIndex] = {
            ...newCat,
            sourceMaterial: category.sourceMaterial,
            sourceUrl: category.sourceUrl,
          };

          const updatedGame: Game = {
            ...generatedGameData.game,
            categories: updatedCategories.map(cat => ({
              title: cat.title,
              clues: cat.clues.map(clue => ({
                value: clue.value,
                clue: clue.clue,
                response: clue.response,
                completed: false,
              })),
            })),
          };

          setGeneratedGameData({
            ...generatedGameData,
            game: updatedGame,
            categories: updatedCategories,
          });

          setAiPreviewData(prev => ({
            ...prev,
            categories: updatedCategories,
          }));
          setRegeneratedItems(prev => new Set(prev).add(`cat-${catIndex}`));
        }
      }
    } finally {
      setRegeneratingCategory(null);
    }
  }, [generatedGameData, aiAvailable, aiGenerate]);

  const handleCreateNewCategory = useCallback(async (catIndex: number) => {
    if (!generatedGameData || !aiAvailable) return;

    setCreatingNewCategory(catIndex);

    try {
      const theme = generatedGameData.theme || 'general';

      // Get existing category titles to avoid duplicates
      const existingCategories = generatedGameData.categories
        .filter((_, i) => i !== catIndex)
        .map(c => ({ title: c.title, subtitle: '' }));

      const result = await aiGenerate(
        'categories-generate',
        {
          theme,
          count: 1,
          existingTitles: existingCategories,
        },
        generatedGameData.difficulty
      );

      if (result && typeof result === 'object' && 'categories' in result) {
        const catData = result as { categories: Array<{ title: string; clues: Array<{ value: number; clue: string; response: string }> }> };
        if (catData.categories && catData.categories.length > 0) {
          const newCat = catData.categories[0];
          const updatedCategories = [...generatedGameData.categories];
          updatedCategories[catIndex] = {
            title: newCat.title,
            contentTopic: newCat.title, // Use title as content topic for new categories
            clues: newCat.clues,
          };

          const updatedGame: Game = {
            ...generatedGameData.game,
            categories: updatedCategories.map(cat => ({
              title: cat.title,
              clues: cat.clues.map(clue => ({
                value: clue.value,
                clue: clue.clue,
                response: clue.response,
                completed: false,
              })),
            })),
          };

          setGeneratedGameData({
            ...generatedGameData,
            game: updatedGame,
            categories: updatedCategories,
          });

          setAiPreviewData(prev => ({
            ...prev,
            categories: updatedCategories,
          }));
          setRegeneratedItems(prev => new Set(prev).add(`cat-${catIndex}`));
        }
      }
    } finally {
      setCreatingNewCategory(null);
    }
  }, [generatedGameData, aiAvailable, aiGenerate]);

  const handleRegenerateClue = useCallback(async (catIndex: number, clueIndex: number) => {
    if (!generatedGameData || !aiAvailable) return;

    setRegeneratingClue({ catIndex, clueIndex });

    try {
      const category = generatedGameData.categories[catIndex];
      const clue = category.clues[clueIndex];

      // Collect all existing answers to avoid duplicates
      const existingAnswers = generatedGameData.categories
        .flatMap(cat => cat.clues.map(c => c.response))
        .filter((answer, index, self) => answer !== clue.response && self.indexOf(answer) === index);

      // Use per-category sourceMaterial if available, otherwise fall back to global
      const sourceMaterial = category.sourceMaterial || generatedGameData.referenceMaterial;

      const result = await aiGenerate(
        'question-generate-single',
        {
          categoryTitle: category.title,
          contentTopic: category.contentTopic || category.title,
          value: clue.value,
          currentClue: clue.clue,
          currentResponse: clue.response,
          existingClues: category.clues.filter((_, i) => i !== clueIndex),
          existingAnswers,
          referenceMaterial: sourceMaterial,
        },
        generatedGameData.difficulty
      );

      if (result && typeof result === 'object' && 'clue' in result) {
        const clueData = result as { clue: { value: number; clue: string; response: string } };
        const updatedCategories = [...generatedGameData.categories];
        updatedCategories[catIndex] = {
          ...category,
          clues: [...category.clues],
        };
        updatedCategories[catIndex].clues[clueIndex] = clueData.clue;

        const updatedGame: Game = {
          ...generatedGameData.game,
          categories: updatedCategories.map(cat => ({
            title: cat.title,
            clues: cat.clues.map(clue => ({
              value: clue.value,
              clue: clue.clue,
              response: clue.response,
            })),
          })),
        };

        setGeneratedGameData({
          ...generatedGameData,
          game: updatedGame,
          categories: updatedCategories,
        });

        setAiPreviewData(prev => ({
          ...prev,
          categories: updatedCategories,
        }));
        setRegeneratedItems(prev => new Set(prev).add(`cat-${catIndex}-clue-${clueIndex}`));
      }
    } finally {
      setRegeneratingClue(null);
    }
  }, [generatedGameData, aiAvailable, aiGenerate]);

  const handleEnhanceTitle = useCallback(async (titleIndex: number) => {
    if (!generatedGameData || !aiAvailable) return null;

    setEnhancingTitle(titleIndex);

    try {
      const theme = generatedGameData.theme || 'general';

      // For title enhancement, build context with game content and existing titles to avoid
      const otherTitles = generatedGameData.titles.filter((_, i) => i !== titleIndex);
      const titleContext: Record<string, any> = {
        theme,
        count: 1,
        existingTitles: otherTitles,
        hasContent: true,
      };

      // Include the actual categories and clues in the context
      if (generatedGameData.categories && generatedGameData.categories.length > 0) {
        const categorySummaries = generatedGameData.categories.map(cat => {
          const clueText = cat.clues
            .slice(0, 2) // Just first 2 clues per category
            .map(c => `  $${c.value} ${c.clue} (${c.response})`)
            .join('\n');
          return `${cat.title}\n${clueText}`;
        }).join('\n\n');
        titleContext.sampleContent = `Game Categories:\n\n${categorySummaries}`;
      }

      const result = await aiGenerate(
        'game-title',
        titleContext,
        generatedGameData.difficulty
      );

      if (result && typeof result === 'object' && 'titles' in result) {
        const titlesData = result as { titles: Array<{ title: string; subtitle: string }> };
        if (titlesData.titles && titlesData.titles.length > 0) {
          const updatedTitles = [...generatedGameData.titles];
          updatedTitles[titleIndex] = titlesData.titles[0];

          setGeneratedGameData({
            ...generatedGameData,
            titles: updatedTitles,
          });

          setAiPreviewData(prev => ({
            ...prev,
            titles: updatedTitles,
          }));

          return titlesData.titles[0].title;
        }
      }
      return null;
    } finally {
      setEnhancingTitle(null);
    }
  }, [generatedGameData, aiAvailable, aiGenerate]);

  const handleEnhanceTeamName = useCallback(async (teamIndex: number) => {
    if (!generatedGameData || !aiAvailable) return null;

    setEnhancingTeamName(teamIndex);

    try {
      const theme = generatedGameData.theme || 'general';
      const currentName = generatedGameData.suggestedTeamNames[teamIndex];
      const otherNames = generatedGameData.suggestedTeamNames.filter((_, i) => i !== teamIndex);

      const result = await aiGenerate('team-name-enhance', {
        currentName,
        existingNames: otherNames,
        gameTopic: theme,
      });

      if (result && typeof result === 'object' && 'name' in result) {
        const enhanced = result as { name: string };
        if (enhanced.name) {
          const updatedNames = [...generatedGameData.suggestedTeamNames];
          updatedNames[teamIndex] = enhanced.name;

          setGeneratedGameData({
            ...generatedGameData,
            suggestedTeamNames: updatedNames,
          });

          setAiPreviewData(prev => ({
            ...prev,
            suggestedTeamNames: updatedNames,
          }));

          return enhanced.name;
        }
      }
      return null;
    } finally {
      setEnhancingTeamName(null);
    }
  }, [generatedGameData, aiAvailable, aiGenerate]);

  // ==================== MANUAL EDIT HANDLERS ====================

  const handleEditCategoryTitle = useCallback((catIndex: number, newTitle: string) => {
    if (!generatedGameData) return;

    const updatedCategories = [...generatedGameData.categories];
    updatedCategories[catIndex] = {
      ...updatedCategories[catIndex],
      title: newTitle,
    };

    const updatedGame: Game = {
      ...generatedGameData.game,
      categories: updatedCategories.map(cat => ({
        title: cat.title,
        clues: cat.clues.map(clue => ({
          value: clue.value,
          clue: clue.clue,
          response: clue.response,
        })),
      })),
    };

    setGeneratedGameData({
      ...generatedGameData,
      game: updatedGame,
      categories: updatedCategories,
    });

    setAiPreviewData(prev => ({
      ...prev,
      categories: updatedCategories,
    }));
  }, [generatedGameData]);

  const handleEditClue = useCallback((catIndex: number, clueIndex: number, newClue: string) => {
    if (!generatedGameData) return;

    const updatedCategories = [...generatedGameData.categories];
    updatedCategories[catIndex] = {
      ...updatedCategories[catIndex],
      clues: [...updatedCategories[catIndex].clues],
    };
    updatedCategories[catIndex].clues[clueIndex] = {
      ...updatedCategories[catIndex].clues[clueIndex],
      clue: newClue,
    };

    const updatedGame: Game = {
      ...generatedGameData.game,
      categories: updatedCategories.map(cat => ({
        title: cat.title,
        clues: cat.clues.map(clue => ({
          value: clue.value,
          clue: clue.clue,
          response: clue.response,
        })),
      })),
    };

    setGeneratedGameData({
      ...generatedGameData,
      game: updatedGame,
      categories: updatedCategories,
    });

    setAiPreviewData(prev => ({
      ...prev,
      categories: updatedCategories,
    }));
  }, [generatedGameData]);

  const handleEditAnswer = useCallback((catIndex: number, clueIndex: number, newAnswer: string) => {
    if (!generatedGameData) return;

    const updatedCategories = [...generatedGameData.categories];
    updatedCategories[catIndex] = {
      ...updatedCategories[catIndex],
      clues: [...updatedCategories[catIndex].clues],
    };
    updatedCategories[catIndex].clues[clueIndex] = {
      ...updatedCategories[catIndex].clues[clueIndex],
      response: newAnswer,
    };

    const updatedGame: Game = {
      ...generatedGameData.game,
      categories: updatedCategories.map(cat => ({
        title: cat.title,
        clues: cat.clues.map(clue => ({
          value: clue.value,
          clue: clue.clue,
          response: clue.response,
        })),
      })),
    };

    setGeneratedGameData({
      ...generatedGameData,
      game: updatedGame,
      categories: updatedCategories,
    });

    setAiPreviewData(prev => ({
      ...prev,
      categories: updatedCategories,
    }));
  }, [generatedGameData]);

  const handleEditTitle = useCallback((titleIndex: number, newTitle: string, newSubtitle?: string) => {
    if (!generatedGameData) return;

    const updatedTitles = [...generatedGameData.titles];
    updatedTitles[titleIndex] = {
      title: newTitle,
      subtitle: newSubtitle ?? updatedTitles[titleIndex].subtitle,
    };

    setGeneratedGameData({
      ...generatedGameData,
      titles: updatedTitles,
    });

    setAiPreviewData(prev => ({
      ...prev,
      titles: updatedTitles,
    }));
  }, [generatedGameData]);

  const handleEditTeamName = useCallback((teamIndex: number, newName: string) => {
    if (!generatedGameData) return;

    const updatedNames = [...generatedGameData.suggestedTeamNames];
    updatedNames[teamIndex] = newName;

    setGeneratedGameData({
      ...generatedGameData,
      suggestedTeamNames: updatedNames,
    });

    setAiPreviewData(prev => ({
      ...prev,
      suggestedTeamNames: updatedNames,
    }));
  }, [generatedGameData]);

  const currentThemeData = themes[currentTheme];

  return (
    <div
      className="min-h-screen p-6 transition-all duration-500"
      style={{
        background: `linear-gradient(135deg, ${currentThemeData.bgStart} 0%, ${currentThemeData.bgMid} 50%, ${currentThemeData.bgEnd} 100%)`,
      }}
    >
      {/* Animated background effects */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 rounded-full blur-3xl animate-pulse"
             style={{ background: `${currentThemeData.accent}20` }} />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 rounded-full blur-3xl animate-pulse delay-1000"
             style={{ background: `${currentThemeData.primary}20` }} />
      </div>

      <div className="relative max-w-7xl mx-auto">
        {/* Header */}
        <header className="text-center mb-8 relative">
          {/* Auth button - top right */}
          <div className="absolute top-0 right-0">
            <SignedIn>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="gap-2">
                    <span className="w-6 h-6 rounded-full bg-yellow-500/20 text-yellow-500 flex items-center justify-center text-xs font-medium">
                      {user?.firstName?.charAt(0) || 'U'}
                    </span>
                    <span className="hidden sm:inline">{user?.firstName || 'User'}</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  <div className="px-3 py-2 text-sm border-b border-slate-700">
                    <div className="font-medium">{user?.fullName || 'User'}</div>
                    <div className="text-xs text-slate-400">{user?.emailAddresses[0]?.emailAddress}</div>
                  </div>
                  <DropdownMenuItem onClick={() => signOut()} className="text-red-400 focus:text-red-300">
                    <LogOut className="w-4 h-4 mr-2" />
                    <span>Sign Out</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </SignedIn>
            <SignedOut>
              <SignInButton mode="modal">
                <Button variant="outline" size="sm" className="gap-2 border-yellow-500/50 text-yellow-500 hover:bg-yellow-500/10">
                  <LogIn className="w-4 h-4" />
                  <span>Sign In</span>
                </Button>
              </SignInButton>
            </SignedOut>
          </div>

          <h1 className="text-6xl font-black text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 to-yellow-200 mb-2">
            JEOPARDY
          </h1>
          <p className="text-slate-400 text-lg">The Ultimate Quiz Experience</p>
        </header>

        {/* Main content grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Games panel */}
          <div className="lg:col-span-1 bg-slate-900/50 backdrop-blur-sm border border-slate-800 rounded-xl p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Gamepad2 className="w-5 h-5 text-yellow-500" />
                <h2 className="text-lg font-semibold">Select Game</h2>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-xs">
                  {sortedGames.length} games
                </Badge>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="sm" className="h-7 px-2 text-slate-400 hover:text-slate-300 hover:bg-slate-700">
                      <ArrowUpDown className="w-3 h-3" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56">
                    <div className="px-3 py-2 text-xs text-slate-500 border-b border-slate-700">
                      Sort by
                    </div>
                    <DropdownMenuItem onClick={() => setGameSort('newest')} className={gameSort === 'newest' ? 'bg-yellow-500/10' : ''}>
                      <span className="flex-1">Newest First</span>
                      {gameSort === 'newest' && <span className="ml-auto text-xs text-yellow-500">✓</span>}
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setGameSort('oldest')} className={gameSort === 'oldest' ? 'bg-yellow-500/10' : ''}>
                      <span className="flex-1">Oldest First</span>
                      {gameSort === 'oldest' && <span className="ml-auto text-xs text-yellow-500">✓</span>}
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setGameSort('recentlyPlayed')} className={gameSort === 'recentlyPlayed' ? 'bg-yellow-500/10' : ''}>
                      <span className="flex-1">Recently Played</span>
                      {gameSort === 'recentlyPlayed' && <span className="ml-auto text-xs text-yellow-500">✓</span>}
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setGameSort('mostPlayed')} className={gameSort === 'mostPlayed' ? 'bg-yellow-500/10' : ''}>
                      <span className="flex-1">Most Played</span>
                      {gameSort === 'mostPlayed' && <span className="ml-auto text-xs text-yellow-500">✓</span>}
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setGameSort('inProgress')} className={gameSort === 'inProgress' ? 'bg-yellow-500/10' : ''}>
                      <span className="flex-1">In Progress First</span>
                      {gameSort === 'inProgress' && <span className="ml-auto text-xs text-yellow-500">✓</span>}
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setGameSort('notStarted')} className={gameSort === 'notStarted' ? 'bg-yellow-500/10' : ''}>
                      <span className="flex-1">Not Started First</span>
                      {gameSort === 'notStarted' && <span className="ml-auto text-xs text-yellow-500">✓</span>}
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setGameSort('completed')} className={gameSort === 'completed' ? 'bg-yellow-500/10' : ''}>
                      <span className="flex-1">% Completed</span>
                      {gameSort === 'completed' && <span className="ml-auto text-xs text-yellow-500">✓</span>}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>

            <Input
              placeholder="Search games..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="mb-4 bg-slate-800/50 border-slate-700"
            />

            <div key={gameStateRefreshKey} className="space-y-2 max-h-80 overflow-y-auto pr-2">
              {sortedGames.map((game) => {
                const gameData = loadCustomGames().find(g => g.id === game.id);
                const savedState = loadGameState(game.id);
                const inProgress = savedState && savedState.used && Object.keys(savedState.used).length > 0;
                return (
                  <div
                    key={game.id}
                    className={`relative group`}
                  >
                    <button
                      onClick={() => {
                        setSelectedGameId(game.id);
                      }}
                      className={`w-full text-left p-3 rounded-lg border transition-all pr-10 ${
                        selectedGameId === game.id
                          ? 'bg-yellow-500/20 border-yellow-500/50'
                          : 'bg-slate-800/30 border-slate-700/50 hover:border-slate-600 hover:bg-slate-800/50'
                      }`}
                    >
                      <div className="flex items-start gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-sm truncate">{game.title}</div>
                          {game.subtitle && (
                            <div className="text-xs text-slate-400 mt-1 truncate">{game.subtitle}</div>
                          )}
                        </div>
                        {inProgress && (
                          <Badge variant="outline" className="text-xs bg-green-500/20 text-green-400 border-green-500/50 flex-shrink-0 self-start">
                            In Progress
                          </Badge>
                        )}
                      </div>
                    </button>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="absolute top-2 right-2 h-7 w-7 p-0 opacity-0 group-hover:opacity-100 transition-opacity bg-slate-800/80 hover:bg-slate-700"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedGameId(game.id);
                          }}
                        >
                          <MoreVertical className="w-4 h-4 text-slate-400" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-48">
                        {/* Play - main action */}
                        <DropdownMenuItem onClick={() => {
                          const fullGame = gameData?.game || {
                            id: game.id,
                            title: game.title,
                            subtitle: game.subtitle || '',
                            categories: [],
                            rows: 5,
                          };
                          recordGamePlay(game.id);
                          onSelectGame(game.id, fullGame, teams);
                        }}>
                          <Play className="w-4 h-4 mr-2 text-green-400" />
                          <span>Play Game</span>
                        </DropdownMenuItem>

                        {/* Edit section */}
                        <DropdownMenuSub>
                          <DropdownMenuSubTrigger>
                            <Edit className="w-4 h-4 mr-2 text-blue-400" />
                            <span>Edit</span>
                          </DropdownMenuSubTrigger>
                          <DropdownMenuSubContent>
                            <DropdownMenuItem onClick={() => {
                              const fullGame = gameData?.game || {
                                id: game.id,
                                title: game.title,
                                subtitle: game.subtitle || '',
                                categories: [],
                                rows: 5,
                              };
                              handleEditWithAIPreview(fullGame);
                            }}>
                              <Sparkles className="w-4 h-4 mr-2 text-purple-400" />
                              <span>AI Editor</span>
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => {
                              const fullGame = gameData?.game || {
                                id: game.id,
                                title: game.title,
                                subtitle: game.subtitle || '',
                                categories: [],
                                rows: 5,
                              };
                              onOpenEditor(fullGame);
                            }}>
                              <Wand2 className="w-4 h-4 mr-2 text-blue-400" />
                              <span>Board Editor</span>
                            </DropdownMenuItem>
                          </DropdownMenuSubContent>
                        </DropdownMenuSub>

                        <DropdownMenuSeparator />

                        {/* Info */}
                        {gameData?.game?.metadata && (
                          <DropdownMenuItem onClick={() => setGameInfoMetadata(gameData?.game?.metadata)}>
                            <Info className="w-4 h-4 mr-2 text-blue-400" />
                            <span>Game Info</span>
                          </DropdownMenuItem>
                        )}

                        <DropdownMenuSeparator />

                        {/* Utilities */}
                        <DropdownMenuItem onClick={() => handleExportGame(game)}>
                          <Download className="w-4 h-4 mr-2 text-green-400" />
                          <span>Export</span>
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleResetGame(game.id)}>
                          <RotateCcw className="w-4 h-4 mr-2 text-orange-400" />
                          <span>Reset Progress</span>
                        </DropdownMenuItem>

                        {/* Danger zone */}
                        {game.source === 'custom' && (
                          <>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              onClick={() => handleDeleteGame(game.id)}
                              className="text-red-400 focus:text-red-300"
                            >
                              <Trash2 className="w-4 h-4 mr-2" />
                              <span>Delete Game</span>
                            </DropdownMenuItem>
                          </>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                );
              })}
            </div>

            <div className="flex flex-col gap-2 mt-4">
              <Button
                variant="default"
                className="w-full bg-gradient-to-r from-purple-500 to-purple-600 hover:from-purple-400 hover:to-purple-500 text-white border-0"
                disabled={aiLoading}
                onClick={() => {
                  if (!isSignedIn) {
                    setShowSignInPrompt(true);
                  } else {
                    setShowWizard(true);
                  }
                }}
              >
                <Plus className="w-4 h-4 mr-2" />
                Create Game
              </Button>
            </div>
          </div>

          {/* Center panel - Start game */}
          <div className="lg:col-span-1 flex flex-col items-center justify-center">
            <Button
              onClick={handleStartGame}
              disabled={!selectedGameId}
              size="lg"
              className="w-full max-w-xs h-32 text-xl font-bold bg-gradient-to-br from-yellow-500 to-yellow-600 hover:from-yellow-400 hover:to-yellow-500 text-black shadow-lg shadow-yellow-500/20"
            >
              START GAME
            </Button>

            <div className="mt-6 flex gap-2">
              {/* TTS Settings - only in local development */}
              {import.meta.env.DEV && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      className="border-slate-700"
                      title="Text-to-Speech Settings"
                    >
                      <Gamepad2 className="w-4 h-4 mr-2" />
                      TTS Settings
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-64">
                    <TTSDirectSettings />
                  </DropdownMenuContent>
                </DropdownMenu>
              )}

              {/* Theme dropdown */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="border-slate-700"
                  >
                    <Palette className="w-4 h-4 mr-2" />
                    Theme
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  {Object.entries(themes).map(([key, theme]) => (
                    <DropdownMenuItem
                      key={key}
                      onClick={() => handleThemeChange(key as ThemeKey)}
                      className={currentTheme === key ? 'bg-yellow-500/10' : ''}
                    >
                      <div
                        className="w-4 h-4 rounded mr-2 flex-shrink-0"
                        style={{
                          background: `linear-gradient(135deg, ${theme.primary}, ${theme.secondary})`,
                        }}
                      />
                      <span className="flex-1">{theme.name}</span>
                      {currentTheme === key && (
                        <span className="ml-auto text-xs text-yellow-500 flex-shrink-0">✓</span>
                      )}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>

              {/* Icon Size dropdown */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="border-slate-700"
                  >
                    <Image className="w-4 h-4 mr-2" />
                    Icon Size
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  {(['128', '256', '512', '1024'] as IconSize[]).map((size) => (
                    <DropdownMenuItem
                      key={size}
                      onClick={() => handleIconSizeChange(size)}
                      className={iconSize === size ? 'bg-yellow-500/10' : ''}
                    >
                      <span className="mr-2 font-mono text-xs text-slate-400">{size}</span>
                      <span className="flex-1">pixels</span>
                      {iconSize === size && (
                        <span className="ml-auto text-xs text-yellow-500 flex-shrink-0">✓</span>
                      )}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>

              {/* AI Model dropdown menu - hidden by default, shown with Cmd/Ctrl+Shift+S */}
              {showAIModelSelector && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="border-slate-700"
                  >
                    <Sparkles className="w-4 h-4 mr-2" />
                    AI Model
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-64">
                  {availableModels.length === 0 ? (
                    <DropdownMenuItem disabled>
                      <span className="text-slate-500 text-xs">No models available</span>
                    </DropdownMenuItem>
                  ) : (
                    <>
                      {/* Performance stats header */}
                      <div className="px-3 py-2 text-xs text-slate-500 border-b border-slate-700">
                        Performance based on your history
                      </div>

                      {/* OpenRouter section */}
                      <DropdownMenuSub>
                        <DropdownMenuSubTrigger>
                          <span className="text-blue-400 mr-2">🤖</span>
                          <span>OpenRouter</span>
                        </DropdownMenuSubTrigger>
                        <DropdownMenuSubContent sideOffset={5} className="max-h-80 overflow-y-auto w-56">
                          {availableModels.filter(m => m.provider === 'openrouter').map((model) => {
                            const stats = getModelStats(model.id);
                            const costEstimate = getCostEstimate(model.id);
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
                                  <div className="text-xs text-slate-500 mt-0.5 flex items-center gap-2">
                                    {stats && (
                                      <span>{formatTime(stats.averageTimeMs)} avg • {stats.count} use{stats.count > 1 ? 's' : ''}</span>
                                    )}
                                    <span className="text-green-400">💰 {costEstimate}</span>
                                  </div>
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
                                  <div className="text-xs text-slate-500 mt-0.5 flex items-center gap-2">
                                    {stats && (
                                      <span>{formatTime(stats.averageTimeMs)} avg • {stats.count} use{stats.count > 1 ? 's' : ''}</span>
                                    )}
                                    <span className="text-green-400">🆓 Free</span>
                                  </div>
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
                            const costEstimate = aiModel ? getCostEstimate(aiModel) : null;
                            const isOllama = availableModels.find(m => m.id === aiModel)?.provider === 'ollama';
                            return (
                              <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                                {stats && (
                                  <span className="text-xs text-slate-600">
                                    Avg: {formatTime(stats.averageTimeMs)} • {stats.count} generated
                                  </span>
                                )}
                                {fastestModel && fastestModel.modelId === aiModel && (
                                  <span className="text-xs text-green-500">⚡ Fastest</span>
                                )}
                                {costEstimate && !isOllama && (
                                  <span className="text-xs text-green-500">💰 {costEstimate}</span>
                                )}
                                {isOllama && (
                                  <span className="text-xs text-green-500">🆓 Free</span>
                                )}
                              </div>
                            );
                          })()}
                        </div>
                      </DropdownMenuItem>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
              )}
            </div>
          </div>

          {/* Teams panel */}
          <div className="lg:col-span-1 bg-slate-900/50 backdrop-blur-sm border border-slate-800 rounded-xl p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Users className="w-5 h-5 text-yellow-500" />
                <h2 className="text-lg font-semibold">Teams</h2>
              </div>
              {aiAvailable && (
                <div className="flex gap-1">
                  <Button
                    onClick={handleAIGenerateAllTeamNames}
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-xs text-yellow-500 hover:text-yellow-400 hover:bg-yellow-500/10"
                    title="Generate names for all teams"
                  >
                    <Dice1 className="w-3 h-3 mr-1" />
                    Generate All
                  </Button>
                </div>
              )}
            </div>

            <div className="space-y-3 max-h-80 overflow-y-auto pr-2">
              {teams.map((team, index) => (
                <div key={team.id} className="flex items-center gap-2">
                  <Input
                    value={team.name}
                    onChange={(e) => handleUpdateTeamName(team.id, e.target.value)}
                    className="bg-slate-800/50 border-slate-700 flex-1"
                  />
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0 text-slate-400 hover:text-slate-300 hover:bg-slate-700"
                      >
                        <MoreVertical className="w-4 h-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-48">
                      {aiAvailable && (
                        <>
                          <DropdownMenuItem onClick={() => handleAIGenerateTeamName(index)}>
                            <Dice1 className="w-4 h-4 mr-2 text-yellow-400" />
                            <span>Generate Random Name</span>
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleAIEnhanceTeamName(index)}>
                            <Sparkles className="w-4 h-4 mr-2 text-purple-400" />
                            <span>Enhance Name</span>
                          </DropdownMenuItem>
                        </>
                      )}
                      {teams.length > 1 && (
                        <DropdownMenuItem onClick={() => handleRemoveTeam(team.id)} className="text-red-400 focus:text-red-300">
                          <Trash2 className="w-4 h-4 mr-2" />
                          <span>Remove Team</span>
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              ))}
            </div>

            <Button
              onClick={handleAddTeam}
              variant="outline"
              className="w-full mt-4 border-slate-700"
              disabled={teams.length >= 4}
            >
              + Add Team ({teams.length}/4)
            </Button>
          </div>
        </div>

        {/* Footer */}
        <footer className="mt-8 text-center text-sm text-slate-500">
          Jeop3 v3.1 • Built with React + shadcn/ui
        </footer>
      </div>

      {/* New Game Wizard */}
      <NewGameWizard
        open={showWizard && !wizardHidden}
        onClose={() => {
          setShowWizard(false);
          setWizardHidden(false);
        }}
        onComplete={handleWizardComplete}
        onOpenEditor={onOpenEditor}
        onImportJSON={handleCreateGameImport}
        isLoading={isWizardGenerating}
        error={wizardError}
      />

      {/* Hidden file input for import */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".json"
        onChange={handleImportGame}
        style={{ display: 'none' }}
      />

      {/* AI Preview Dialog */}
      <AIPreviewDialog
        open={aiPreviewOpen}
        type={aiPreviewType}
        data={aiPreviewData}
        onConfirm={handleAIPreviewConfirm}
        onCancel={handleAIPreviewCancel}
        onRegenerateAll={handleRegenerateAll}
        onRewriteCategoryTitle={handleRewriteCategoryTitle}
        onRewriteClue={handleRewriteClue}
        onRegenerateCategory={handleRegenerateCategory}
        onCreateNewCategory={handleCreateNewCategory}
        onRegenerateClue={handleRegenerateClue}
        onRegenerateTitle={handleRegenerateTitle}
        onRegenerateAllTitles={handleRegenerateAllTitles}
        onEnhanceTitle={handleEnhanceTitle}
        onRegenerateTeamName={handleRegenerateTeamName}
        onEnhanceTeamName={handleEnhanceTeamName}
        onRegenerateAllTeamNames={handleRegenerateAllTeamNames}
        // Manual editing handlers
        onEditCategoryTitle={handleEditCategoryTitle}
        onEditClue={handleEditClue}
        onEditAnswer={handleEditAnswer}
        onEditTitle={handleEditTitle}
        onEditTeamName={handleEditTeamName}
        isLoading={isRegenerating}
        regeneratedItems={regeneratedItems}
        regeneratingCounts={regeneratingCounts}
        rewritingCategory={rewritingCategory}
        rewritingClue={rewritingClue}
        regeneratingCategory={regeneratingCategory}
        creatingNewCategory={creatingNewCategory}
        regeneratingClue={regeneratingClue}
        rewritingTitle={rewritingTitle}
        enhancingTitle={enhancingTitle}
        rewritingTeamName={rewritingTeamName}
        enhancingTeamName={enhancingTeamName}
        metadata={generatedGameData?.metadata}
        onBack={handleAIPreviewBack}
      />

      {/* Game Info Dialog */}
      <AlertDialog open={!!gameInfoMetadata} onOpenChange={(open) => !open && setGameInfoMetadata(null)}>
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>Game Information</AlertDialogTitle>
          </AlertDialogHeader>
          <GameMetadata metadata={gameInfoMetadata} collapsible={false} />
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => setGameInfoMetadata(null)}>
              Close
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Game Confirmation Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Game</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this game? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setShowDeleteDialog(false)}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDeleteGame}
              className="bg-red-600 hover:bg-red-500"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Sign-in Required Dialog */}
      <SignedOut>
        <AlertDialog open={showSignInPrompt} onOpenChange={setShowSignInPrompt}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Sign In Required</AlertDialogTitle>
              <AlertDialogDescription>
                Creating games with AI requires you to sign in with an approved account.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => setShowSignInPrompt(false)}>
                Cancel
              </AlertDialogCancel>
              <SignInButton mode="modal">
                <AlertDialogAction className="bg-purple-600 hover:bg-purple-500">
                  Sign In
                </AlertDialogAction>
              </SignInButton>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </SignedOut>
    </div>
  );
}
