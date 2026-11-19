import { EMPTY_RESEARCH, foldProgress, type ResearchAcc } from '@/components/wizard/researchProgress';
import { useState, useEffect, useCallback, useRef } from 'react';
import { AI_SIGN_IN_REQUIRED, useAuth, useUser, SignInButton, SignedOut, enableDevAuthBypass } from '@/lib/auth';
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
import type { GameMeta, Team, Game, Category, GameState } from '@/lib/storage';
import { loadCustomGames, saveCustomGames, getSelectedGameId, loadGameState, saveGameState, stateKey, recordGamePlay, getGamePlayStats, calculateGameCompletion } from '@/lib/storage';
import { themes, applyTheme, getStoredTheme, setIconSize, getIconSize, type ThemeKey, type IconSize } from '@/lib/themes';
import { getAIApiBase } from '@/lib/ai/service';
import { useAIGeneration } from '@/lib/ai/hooks';
import { checkAbort, isAbort, type GenerationOptions } from '@/lib/ai/progress';
import { generateFinalJeopardy, reviewWholeBoard } from '@/lib/ai/wholeBoard';
import { generateContentSpan, generateTopicSpan } from '@/lib/ai/board';
import { getModelStats, formatTime, getModelsBySpeed, getCostEstimate, initializePricing } from '@/lib/ai/stats';
import { AIPreviewDialog } from '@/components/ai/AIPreviewDialog';
import { NewGameWizard, type WizardCompleteData, type CustomSource } from '@/components/NewGameWizard';
import { GameMetadata } from '@/components/GameMetadata';
import type { AIPromptType, AIDifficulty, Clue as AIClue, AICategory, GenerationProgress, AIContext } from '@/lib/ai/types';
import type { PreviewData } from '@/components/ai';
import { Sparkles } from 'lucide-react';
import './lobby/lobby.css';
import { LobbyLogo } from './lobby/LobbyLogo';
import { GameHero } from './lobby/GameHero';
import { GameCard } from './lobby/GameCard';
import { GameCardMenu } from './lobby/GameCardMenu';
import { NewGameCard } from './lobby/NewGameCard';
import { HowItWorks } from './lobby/HowItWorks';
import { setGameHidden, useHiddenGames } from '@/lib/hiddenGames';
import { TeamRoster } from './lobby/TeamRoster';
import { TableSettings } from './lobby/TableSettings';
import { AccountMenu } from './lobby/AccountMenu';
import { LibraryToolbar, type GameSort, type StatusFilter } from './lobby/LibraryToolbar';
import { summarizeGame, lobbyVars } from './lobby/gameInfo';

interface MainMenuProps {
  onSelectGame: (gameId: string, game: any, teams?: Team[]) => void;
  /** `gameId` is the library game's id when editing an existing one (so saves persist). */
  onOpenEditor: (game?: Game, gameId?: string) => void;
  /** Open the New Game wizard as soon as the menu mounts (the finale's "New game"). One-shot. */
  startWithWizard?: boolean;
  /** Called once `startWithWizard` has been acted on, so the caller can clear its flag. */
  onStartWithWizardHandled?: () => void;
}

interface GeneratedGameData {
  boardReview?: PreviewData['boardReview'];
  finalWarning?: string;
  includeFinalJeopardy?: boolean;
  game: Game;
  categories: Array<{
    title: string;
    contentTopic?: string;
    clues: AIClue[];
    sourceMaterial?: string; // Store source material for this specific category
    sourceUrl?: string; // Store source URL if applicable
  }>;
  /** Judged-but-unpicked clues retained per category, so "regenerate clue" can
   *  swap in a known-good alternative instead of a fresh AI call. Absent for
   *  single-source non-pipeline generation. */
  alternatives?: import('@/lib/ai/board').ContentSpanResult['alternatives'];
  titles: Array<{ title: string; subtitle: string }>;
  suggestedTeamNames: string[];
  theme: string;
  difficulty: AIDifficulty;
  sourceMode?: 'scratch' | 'paste' | 'url' | 'custom';
  referenceUrl?: string;
  referenceMaterial?: string; // Store source material for single-source mode
  sourceCharacters?: number;
  /** Preserved wizard inputs so "Regenerate All" can re-run the same pipeline
   *  with the same sources (theme/difficulty/sourceMode/customSources). */
  customSources?: Array<{
    id: string;
    type: 'topic' | 'paste' | 'url';
    topic?: string;
    content?: string;
    url?: string;
    categoryCount: number;
    fetchedContent?: string;
    suggestedTitles?: string[];
  }>;
  metadata?: {
    modelUsed?: string;
    generatedAt?: string;
    generationTimeMs?: number;
  };
}

// Set before the dev-bypass reload so the New Game wizard reopens afterwards.
const RESUME_WIZARD_KEY = 'jeop3:resumeWizard';

export function MainMenu({ onSelectGame, onOpenEditor, startWithWizard, onStartWithWizardHandled }: MainMenuProps) {
  // Clerk auth
  const { isSignedIn, isLoaded: authLoaded } = useAuth();
  const { user } = useUser();
  const isLocalDev = typeof window !== 'undefined' &&
    (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');

  // Simple slugify function for safe filenames
  const slugify = (str: string) => {
    return str
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
  };

  const [games, setGames] = useState<GameMeta[]>([]);
  // True until the first loadGames() settles, so the menu doesn't flash an
  // empty list and default "Team 1/Team 2" names while data is on its way.
  const [gamesLoading, setGamesLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedGameId, setSelectedGameId] = useState<string | null>(null);
  const [gameSort, setGameSort] = useState<GameSort>('newest');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const hiddenIds = useHiddenGames();
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
  const wizardRunRef = useRef(0);
  const wizardAbortRef = useRef<AbortController | null>(null);
  const [generationEvent, setGenerationEvent] = useState<GenerationProgress | null>(null);
  // Sources, warnings and repairs folded from EVERY event (React batches same-tick events, so the latest
  // event alone would drop e.g. "found N sources" when the next stage starts immediately).
  const [generationResearch, setGenerationResearch] = useState<ResearchAcc>(EMPTY_RESEARCH);
  useEffect(() => () => wizardAbortRef.current?.abort(), []);
  const [wizardStage, setWizardStage] = useState<string>('');
  // Per-source progress for multi-source generation. Null for single-source
  // games (which keep the legacy single-line stage display).
  const [wizardProgress, setWizardProgress] = useState<{
    sourceIndex: number;     // 0-based, the source currently generating
    sourceTotal: number;     // total sources in this game
    sourceLabels: string[];  // every source's label (so the table can render all rows)
    stage: string;           // granular stage from the pipeline ("Judging quality…")
  } | null>(null);
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
  // What the user was trying to do when the prompt opened, so the dev-bypass
  // reload can resume it instead of dropping them back on the menu.
  const signInIntent = useRef<'create' | 'import'>('create');
  useEffect(() => {
    if (!isSignedIn) return;
    try {
      if (sessionStorage.getItem(RESUME_WIZARD_KEY) === 'true') {
        sessionStorage.removeItem(RESUME_WIZARD_KEY);
        setShowWizard(true);
      }
    } catch {
      // sessionStorage unavailable — user just clicks Create Game again
    }
  }, [isSignedIn]);

  // "New game" from the finale: behave exactly like clicking Create Game once auth is settled, then
  // tell the caller to clear its one-shot flag. (Signed out -> the usual sign-in prompt.)
  useEffect(() => {
    if (!startWithWizard || !authLoaded) return;
    if (isSignedIn) {
      setShowWizard(true);
    } else {
      signInIntent.current = 'create';
      setShowSignInPrompt(true);
    }
    onStartWithWizardHandled?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startWithWizard, authLoaded, isSignedIn]);

  // Game info dialog state
  const [gameInfoMetadata, setGameInfoMetadata] = useState<any>(null);

  // AI Model button visibility (hidden by default, shown with keyboard shortcut)
  const [showAIModelSelector, setShowAIModelSelector] = useState(false);

  const { generate: aiGenerate, isLoading: aiLoading, isAvailable: aiAvailable } = useAIGeneration();

  useEffect(() => {
    loadGames();
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
            const defaultId = data.defaultModel || data.models[0].id;
            setAIModel(defaultId);
            localStorage.setItem('jeop3:aiModel', defaultId);
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
    } finally {
      setGamesLoading(false);
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
      signInIntent.current = 'import';
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
    setWizardProgress(null); // Cleared until the multi-source loop populates it
    wizardAbortRef.current?.abort();
    const controller = new AbortController();
    wizardAbortRef.current = controller;
    setGenerationEvent(null);
    setGenerationResearch(EMPTY_RESEARCH);
    const runStarted = Date.now();
    const runId = ++wizardRunRef.current;
    const isStale = () => runId !== wizardRunRef.current || controller.signal.aborted;
    const setRunError = (message: string) => {
      if (!isStale()) setWizardError(message);
    };
    const options: GenerationOptions = {
      signal: controller.signal,
      model: localStorage.getItem('jeop3:aiModel') || aiModel,
      onProgress: event => {
        if (isStale()) return;
        setGenerationEvent(event);
        setGenerationResearch(prev => foldProgress(prev, event));
        if (event.message) setWizardStage(event.message);
      },
    };
    const runGenerate = async (type: AIPromptType, context: AIContext, level: AIDifficulty = 'normal') => {
      checkAbort(controller.signal);
      const result = await aiGenerate(type, context, level, {
        ...options,
        onError: err => {
          if (!isStale() && err.message === AI_SIGN_IN_REQUIRED) {
            setRunError(AI_SIGN_IN_REQUIRED);
            controller.abort(err);
          }
        },
      });
      checkAbort(controller.signal);
      return result;
    };
    const emit = (stage: GenerationProgress['stage'], message: string) => options.onProgress?.({ stage, message });
    setIsWizardGenerating(true);

    try {
      let categoriesList: Array<{
        title: string;
        clues: AIClue[];
      }> = [];
      let categoriesMetadata: any = undefined;
      // Accumulate judged-but-unpicked alternatives across spans for the
      // regen-from-pool handler. (Only the answer-first pipeline produces these.)
      let alternativesList: GeneratedGameData['alternatives'] = [];

      // NORMALIZE single-source modes into the custom-sources path so they go
      // through the same answer-first pipeline (extract → clues → judge →
      // select + alternatives + provenance). This closes the last quality gap:
      // single-source paste/URL/scratch previously used legacy single-pass
      // 'categories-generate(-from-content)' with no judging.
      //   paste/url with material → one paste-style source
      //   scratch (theme only)    → one topic-style source
      let effectiveSourceMode = sourceMode;
      let effectiveCustomSources = customSources;
      if (sourceMode !== 'custom' && (!customSources || customSources.length === 0)) {
        if (sourceMode !== 'scratch' && referenceMaterial) {
          effectiveCustomSources = [{
            id: 'single-source',
            type: 'paste' as const,
            content: referenceMaterial,
            categoryCount: 6,
          }];
          effectiveSourceMode = 'custom';
        } else if (theme && theme !== 'random') {
          // Scratch with a real theme → treat as a single topic source so it
          // gets fact-sheet grounding + the full pipeline.
          effectiveCustomSources = [{
            id: 'single-source',
            type: 'topic' as const,
            topic: theme,
            categoryCount: 6,
          }];
          effectiveSourceMode = 'custom';
        }
        // else: scratch + 'random' theme stays single-pass (no source/topic to
        // ground in — the model picks freely, which is the intended mode).
      }

      // Handle custom sources mode - generate categories from each source
      if (effectiveSourceMode === 'custom' && effectiveCustomSources && effectiveCustomSources.length > 0) {
        const customSourcesLoop = effectiveCustomSources;

        // Collect all successful results and track failures
        const failedSources: Array<{ source: CustomSource; error: string }> = [];

        // Spans run SEQUENTIALLY so each span's `existingAnswers` (below) sees
        // the prior span's clues — this is what guarantees no answer repeats
        // across a multi-span game.
        // TODO(future): span-level parallelism. The true version would be:
        //   - generate all spans concurrently (existingAnswers = [] each)
        //   - post-pass cross-span dedup over the merged board
        //   - regenerate ONLY colliding clues
        //   - re-judge replacements before the final merge
        // Skipped for now: most games are single-span (no gain), and this
        // sequential loop's strong dedup guarantee isn't worth trading away
        // for a power-user-only speedup (~60s → ~35s for multi-span only).
        const sourceLabels: string[] = customSourcesLoop.map(s => {
          if (s.type === 'topic') return s.topic || 'Untitled topic';
          if (s.type === 'paste') return `Pasted content (${(s.content || '').length.toLocaleString()} chars)`;
          return s.url || 'URL source';
        });
        for (let sourceIdx = 0; sourceIdx < customSourcesLoop.length; sourceIdx++) {
          checkAbort(controller.signal);
          const source = customSourcesLoop[sourceIdx];
          const hasContent = (source.type === 'paste' && source.content) ||
                            (source.type === 'url' && source.fetchedContent);
          const sourceMaterial = source.type === 'paste' ? source.content :
                                 source.type === 'url' ? source.fetchedContent : undefined;
          const sourceUrl = source.type === 'url' ? source.url : undefined;
          const existingAnswers = categoriesList.length > 0
            ? categoriesList.flatMap(c => c.clues.map(cl => cl.response))
            : [];

          // Per-source progress: the wizard shows a table of all sources with
          // the active one highlighted. Wrap setWizardStage so granular
          // pipeline stages ("Judging quality…") update the active row.
          const updateProgress = (stage: string) => {
            if (isStale()) return;
            setWizardStage(stage);
            setWizardProgress({
              sourceIndex: sourceIdx,
              sourceTotal: customSourcesLoop.length,
              sourceLabels,
              stage,
            });
          };
          updateProgress('Starting…');

          console.log('[MainMenu] Generating from source:', { type: source.type, categoryCount: source.categoryCount, answerFirst: hasContent });
          try {
            let spanCategories: Array<{ title: string; clues: AIClue[]; [k: string]: any }>;

            if (hasContent && sourceMaterial) {
              // A+ answer-first pipeline (board.ts): extract specific answers -> filter ->
              // clues for FIXED answers; patch thin-source gaps from a single-pass fallback,
              // then independently verify all clues before accepting a complete board.
              const span = await generateContentSpan(runGenerate, {
                ...options,
                referenceMaterial: sourceMaterial,
                theme: source.topic || theme || 'random',
                titles: source.suggestedTitles,
                count: source.categoryCount,
                difficulty: difficulty || 'normal',
                existingAnswers,
                sourceMaterial,
                sourceUrl,
                onStage: (stage: string) => updateProgress(stage),
              });
              spanCategories = span.categories;
              if (span.alternatives) alternativesList.push(...span.alternatives);
            } else {
              // Topic (no content): route through the answer-first pipeline too,
              // via a synthesized grounding fact-sheet (topic-mode parity). This
              // gives topics the same extract → clues → judge → select curation
              // that content gets. Verification failures remain visible in the wizard.
              const span = await generateTopicSpan(runGenerate, {
                ...options,
                topic: source.topic || 'random',
                titles: source.suggestedTitles,
                count: source.categoryCount,
                difficulty: difficulty || 'normal',
                existingAnswers,
                // Server endpoints don't enforce Clerk auth today (no auth
                // middleware on the AI server). Threading the token here is
                // forward-compatible if that changes.
                authToken: null,
                onStage: (stage: string) => updateProgress(stage),
              });
              // Stamp per-category source-type provenance (retrieved vs
              // ai_synthesized) onto the category objects so the preview UI
              // can label grounding honestly.
              const sourcesByTitle = new Map(
                (span.categorySources || []).map(cs => [cs.title.toLowerCase(), cs])
              );
              spanCategories = span.categories.map((cat: any) => {
                const cs = sourcesByTitle.get((cat.title || '').toLowerCase());
                return cs ? { ...cat, sourceType: cs.sourceType, sourceUrl: cs.url } : cat;
              });
              if (span.alternatives) alternativesList.push(...span.alternatives);
            }

            if (!spanCategories || spanCategories.length === 0) {
              failedSources.push({ source, error: 'No categories generated' });
              continue;
            }
            // Category titles alone aren't a result: if every AI call after the
            // titles failed (server hiccup, expired sign-in token…) the pipeline
            // still returns the skeleton. Treat that as a failure so the wizard
            // reports it instead of previewing an empty board as a success.
            const generatedClueCount = spanCategories.reduce(
              (n: number, c: any) => n + (Array.isArray(c?.clues) ? c.clues.length : 0), 0
            );
            if (generatedClueCount === 0) {
              failedSources.push({ source, error: 'No clues were generated (the AI service may have been unavailable)' });
              continue;
            }
            categoriesList.push(...spanCategories);
            updateProgress('Done');
          } catch (error) {
            if (isAbort(error, controller.signal)) throw error;
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
          setRunError(`Could not complete the requested board from ${sourceNames}. ${failedSources.map(f => f.error).join(' ')}`);
          if (!isStale()) setIsWizardGenerating(false);
          return;
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
        emit('categories', 'Choosing categories and clues…');
        const categoriesResult = await runGenerate(
          promptType,
          context,
          difficulty
        );

        console.log('[MainMenu] AI generation result:', { categoriesResult, promptType, hasCategories: categoriesResult && 'categories' in categoriesResult });

        if (!categoriesResult || typeof categoriesResult !== 'object' || !('categories' in categoriesResult)) {
          console.error('[MainMenu] Invalid categories result:', categoriesResult);
          setRunError('Failed to generate categories. The AI returned an invalid response. Please try again.');
          if (!isStale()) setIsWizardGenerating(false);
          return; // Keep wizard open
        }

        const allCategories = (categoriesResult as any).categories as Array<{
          title: string;
          clues: AIClue[];
        }>;

        // Validate we got 6 categories as requested
        if (allCategories.length !== 6) {
          console.warn(`[MainMenu] AI returned ${allCategories.length} categories but requested 6. Adjusting...`);
        }
        // Only take the first 6 categories
        const sliceCategories = allCategories.slice(0, 6);

        // Validate we have at least some categories
        if (sliceCategories.length === 0) {
          console.error('[MainMenu] No categories generated from AI');
          setRunError('Failed to generate any categories. Please try again with a different topic or content.');
          if (!isStale()) setIsWizardGenerating(false);
          return; // Keep wizard open
        }

        // Attach source material to each category for later AI operations (single-source mode)
        categoriesList = sliceCategories.map(cat => ({
          ...cat,
          sourceMaterial: referenceMaterial, // All categories share the same source in single-source mode
          sourceUrl: referenceUrl,
        }));

        // Capture metadata from categories generation
        categoriesMetadata = (categoriesResult as any)._metadata;
      }

      checkAbort(controller.signal);
      const finalResult = wizardData.includeFinalJeopardy === false ? {} : await generateFinalJeopardy(runGenerate, categoriesList, theme || 'random', options);
      const finalJeopardy = finalResult.final;
      const boardReview = await reviewWholeBoard(runGenerate, categoriesList, finalJeopardy, options);
      checkAbort(controller.signal);

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
      emit('titles', 'Generating title options…');
      const titlesResult = await runGenerate(
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
      emit('teams', 'Generating team names…');
      const teamNamesResult = await runGenerate('team-name-random', teamNamesContext, difficulty);

      let suggestedTeamNames = ['Team 1', 'Team 2', 'Team 3', 'Team 4'];
      if (teamNamesResult && typeof teamNamesResult === 'object' && 'names' in teamNamesResult) {
        const names = (teamNamesResult as any).names as string[];
        if (Array.isArray(names) && names.length === 4) {
          suggestedTeamNames = names;
        }
      }

      // Build game structure
      const gameCategories: Array<{ title: string; clues: AIClue[] }> = [];
      for (const cat of categoriesList) {
        const categoryClues: AIClue[] = [];
        for (const clue of cat.clues) {
          categoryClues.push({
            ...clue,
            value: clue.value,
            clue: clue.clue,
            response: clue.response,
          });
        }
        gameCategories.push({
          ...cat,
          title: cat.title,
          clues: categoryClues,
        });
      }

      // Build enhanced metadata with source info
      const enhancedMetadata = {
        ...categoriesMetadata,
        modelUsed: options.model,
        generatedAt: new Date().toISOString(),
        generationTimeMs: Date.now() - runStarted,
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
        finalJeopardy,
        suggestedTeamNames: suggestedTeamNames,
        metadata: enhancedMetadata,
      };

      // Store the generated game data for later use
      if (isStale()) return;
      setGeneratedGameData({
        includeFinalJeopardy: wizardData.includeFinalJeopardy !== false,
        boardReview, finalWarning: finalResult.warning,
        game: newGame,
        categories: categoriesList,
        alternatives: alternativesList.length ? alternativesList : undefined,
        titles: titlesList,
        suggestedTeamNames,
        theme: theme || 'random',
        difficulty: difficulty || 'normal',
        sourceMode,
        referenceUrl,
        referenceMaterial: sourceMode !== 'custom' ? referenceMaterial : undefined, // Store for single-source mode
        sourceCharacters: referenceMaterial?.length,
        // Preserve the (possibly normalized) custom sources so "Regenerate
        // All" can re-run the pipeline. For single-source modes that we
        // normalized into customSources above, this is the synthetic one-source
        // array; for genuine custom mode it's the wizard's inputs.
        customSources: effectiveCustomSources,
        metadata: enhancedMetadata,
      });

      // Cancelled while generating: drop the late result
      if (isStale()) return;

      // Success! Hide wizard and show preview dialog
      setIsWizardGenerating(false);
      setWizardHidden(true);

      setAiPreviewData({ categories: categoriesList, titles: titlesList, suggestedTeamNames, finalJeopardy, finalWarning: finalResult.warning, boardReview });
      setAiPreviewType('categories-generate');
      setAiPreviewOpen(true);

    } catch (error) {
      if (isAbort(error, controller.signal)) return;
      console.error('[MainMenu] AI generation error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to generate game. Please try again.';
      setRunError(errorMessage);
      if (!isStale()) setIsWizardGenerating(false);
      // Keep wizard open on error
    } finally {
      if (runId === wizardRunRef.current) {
        setIsWizardGenerating(false);
        wizardAbortRef.current = null;
      }
    }
  };

  // Retry handler for wizard errors
  const handleWizardCancel = useCallback(() => {
    wizardAbortRef.current?.abort();
    wizardAbortRef.current = null;
    setGenerationEvent(null);
    setGenerationResearch(EMPTY_RESEARCH);
    // Invalidate late callbacks as a backstop to transport cancellation.
    wizardRunRef.current += 1;
    setIsWizardGenerating(false);
    setWizardProgress(null);
    setWizardError(null);
  }, []);

  const handleWizardRetry = useCallback(() => {
    setWizardError(null);
    // The user can retry by clicking Generate Game again
  }, []);

  // ==================== AI PREVIEW HANDLERS ====================

  const handleAIPreviewConfirm = useCallback((selected: { title?: number; items: Set<string> }, destination: 'play' | 'library') => {
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
        ...cat,
        title: cat.title,
        clues: cat.clues.map(clue => ({ ...clue,
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

    setAiPreviewOpen(false);
    setShowWizard(false);
    setWizardHidden(false);
    if (destination === 'play') onSelectGame(gameId, finalGame);
    setGeneratedGameData(null);
  }, [generatedGameData, onSelectGame, user]);

  const handleAIPreviewCancel = () => {
    setAiPreviewOpen(false);
    setShowWizard(false);
    setWizardHidden(false);
    setGeneratedGameData(null);
  };

  const handleAIPreviewBack = () => {
    setAiPreviewOpen(false);
    setWizardHidden(false);
    setWizardError(null); // Clear any stale errors when going back
  };

  const handleRegenerateAll = useCallback(async () => {
    setAiPreviewOpen(false);

    if (!generatedGameData) return;

    // Reset regenerated items since we're regenerating everything
    setRegeneratedItems(new Set());

    // RE-ROUTE THROUGH THE PIPELINE: if the original generation went through
    // the answer-first pipeline (custom multi-source mode, or single-source
    // paste/URL with material preserved), re-run handleWizardComplete with the
    // same inputs. This keeps regenerated boards at the same quality bar
    // (extract → clues → judge → select + alternatives + provenance) instead
    // of dropping back to the legacy single-pass 'categories-generate'.
    // We can re-route through the pipeline iff custom sources were preserved
    // (true for genuine custom mode AND single-source modes that we normalized
    // into a one-element customSources array at generation time). Scratch+random
    // has no source to ground in → falls through to the legacy single-pass path.
    const canReroute = !!generatedGameData.customSources?.length;

    if (canReroute) {
      await handleWizardComplete({
        mode: 'ai',
        theme: generatedGameData.theme,
        difficulty: generatedGameData.difficulty,
        sourceMode: generatedGameData.sourceMode,
        referenceMaterial: generatedGameData.referenceMaterial,
        referenceUrl: generatedGameData.referenceUrl,
        customSources: generatedGameData.customSources,
        includeFinalJeopardy: generatedGameData.includeFinalJeopardy,
      });
      return; // handleWizardComplete reopens the preview with fresh data.
    }

    // FALLBACK: scratch/random themes with no preserved source. No pipeline to
    // route through, so use the legacy single-pass path. Carries forward
    // sourceMaterial per-category (by title) so per-clue regen still works.
    const result = await aiGenerate(
      'categories-generate',
      { theme: generatedGameData.theme || 'random', count: 6 },
      generatedGameData.difficulty
    );

    if (!result || typeof result !== 'object' || !('categories' in result)) {
      return;
    }

    const categoriesList = ((result as any).categories as Array<{
      title: string;
      clues: AIClue[];
    }>).map(cat => ({
      ...cat,
      sourceMaterial: generatedGameData.categories.find(c => c.title === cat.title)?.sourceMaterial,
      sourceUrl: generatedGameData.categories.find(c => c.title === cat.title)?.sourceUrl,
    }));

    const categoriesMetadata = (result as any)._metadata;
    const titleContext: Record<string, any> = {
      theme: generatedGameData.theme || 'random',
      count: 3,
      hasContent: true,
    };
    if (categoriesList && categoriesList.length > 0) {
      const categorySummaries = categoriesList.map(cat => {
        const clueText = (cat.clues || [])
          .slice(0, 2)
          .map(c => `  $${c.value} ${c.clue} (${c.response})`)
          .join('\n');
        return `${cat.title}\n${clueText}`;
      }).join('\n\n');
      titleContext.sampleContent = `Game Categories:\n\n${categorySummaries}`;
    }

    const titlesResult = await aiGenerate('game-title', titleContext, generatedGameData.difficulty);
    const titlesList = (titlesResult && typeof titlesResult === 'object' && 'titles' in titlesResult)
      ? (titlesResult as any).titles as Array<{ title: string; subtitle: string }>
      : generatedGameData.titles;

    const teamNamesResult = await aiGenerate('team-name-random', {
      count: 2, existingNames: [], gameTopic: generatedGameData.theme || '',
    });
    const suggestedTeamNames = (teamNamesResult && typeof teamNamesResult === 'object' && 'names' in teamNamesResult)
      ? (teamNamesResult as any).names as string[]
      : generatedGameData.suggestedTeamNames;

    const gameCategories: Category[] = categoriesList.map(cat => ({
      ...cat,
      title: cat.title,
      clues: cat.clues.map(clue => ({ ...clue })),
    }));

    const newGame: Game = {
      title: titlesList[0].title,
      subtitle: titlesList[0].subtitle,
      suggestedTeamNames,
      categories: gameCategories,
      rows: 5,
      metadata: categoriesMetadata,
    };

    setGeneratedGameData({
      ...generatedGameData,
      game: newGame,
      categories: categoriesList,
      titles: titlesList,
      suggestedTeamNames,
      alternatives: undefined, // legacy path has no judged pool
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
            ...cat,
            title: cat.title,
            clues: cat.clues.map(clue => ({ ...clue,
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
            ...cat,
            title: cat.title,
            clues: cat.clues.map(clue => ({ ...clue,
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

      // SOURCE-AWARE REGENERATION — route through the same answer-first
      // pipeline that initial generation uses, so regenerated categories meet
      // the same quality bar (extract → clues → judge → select). This is the
      // key fix: the old path used 'category-replace-all' (single-pass, no
      // judging), which is exactly the quality regression we built the pipeline
      // to prevent. Now:
      //   - content category (has sourceMaterial) → generateContentSpan
      //   - topic category (has sourceType, no material) → generateTopicSpan
      //   - scratch/random (no source) → fall back to category-replace-all
      const sourceMaterial = category.sourceMaterial || generatedGameData.referenceMaterial;
      const isTopicCat = (category as any).sourceType;
      let newCat: AICategory | null = null;

      if (sourceMaterial && !(category as any).sourceType) {
        const span = await generateContentSpan(aiGenerate as any, {
          referenceMaterial: sourceMaterial,
          theme,
          titles: [category.title],
          count: 1,
          difficulty: generatedGameData.difficulty,
          existingAnswers,
          sourceMaterial,
          sourceUrl: category.sourceUrl,
        });
        newCat = span.categories[0] || null;
        // Refresh this category's alternatives from the fresh pipeline run.
        if (span.alternatives?.length) {
          const others = (generatedGameData.alternatives || []).filter(a => a.title.toLowerCase() !== category.title.toLowerCase());
          setGeneratedGameData(prev => prev ? { ...prev, alternatives: [...others, ...span.alternatives!] } : prev);
        }
      } else if (isTopicCat) {
        const span = await generateTopicSpan(aiGenerate as any, {
          topic: theme,
          titles: [category.title],
          count: 1,
          difficulty: generatedGameData.difficulty,
          existingAnswers,
        });
        newCat = span.categories[0] || null;
        if (span.alternatives?.length) {
          const others = (generatedGameData.alternatives || []).filter(a => a.title.toLowerCase() !== category.title.toLowerCase());
          setGeneratedGameData(prev => prev ? { ...prev, alternatives: [...others, ...span.alternatives!] } : prev);
        }
      } else {
        // No source to ground in — fall back to the legacy single-pass path.
        const result = await aiGenerate(
          'category-replace-all',
          { categoryTitle: category.title, contentTopic, theme, existingClues: category.clues, existingAnswers, referenceMaterial: sourceMaterial },
          generatedGameData.difficulty
        );
        if (result && typeof result === 'object') {
          const catData = result as { category?: typeof category; title?: string; clues?: typeof category.clues };
          newCat = catData.category || (catData.title && catData.clues ? { title: catData.title, clues: catData.clues } : null);
        }
      }

      if (newCat && newCat.clues?.length) {
        const updatedCategories = [...generatedGameData.categories];
        updatedCategories[catIndex] = {
          ...category,
          ...newCat,
        } as typeof category;

        const updatedGame: Game = {
          ...generatedGameData.game,
          categories: updatedCategories.map(cat => ({
            ...cat,
            title: cat.title,
            clues: cat.clues.map(clue => ({ ...clue,
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
        const catData = result as { categories: Array<{ title: string; clues: AIClue[] }> };
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
              ...cat,
              title: cat.title,
              clues: cat.clues.map(clue => ({ ...clue,
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

      // Collect all existing answers (excluding the clue being regenerated) to
      // avoid duplicates in both the pool lookup and any fresh AI call.
      const existingAnswers = generatedGameData.categories
        .flatMap(cat => cat.clues.map(c => c.response))
        .filter((answer, index, self) => answer !== clue.response && self.indexOf(answer) === index);

      // ----- POOL-FIRST: pull a judged alternative if one is available -----
      // The answer-first pipeline retains judged-but-unpicked clues per
      // category. Swapping one in is instant (no AI call) and higher-quality
      // than a fresh single-clue call (it was already curated + judged).
      // Re-validate against the live board: the pool was deduped at generation
      // time, but the board may have changed since.
      const norm = (s: string) => s.toLowerCase().replace(/^(the|a|an)\s+/, '').replace(/[^a-z0-9\s]/g, '').trim();
      const usedNorms = new Set(existingAnswers.map(norm));
      const pool = (generatedGameData.alternatives || []).find(
        a => a.title.toLowerCase() === category.title.toLowerCase()
      )?.clues || [];
      const candidate = pool.find(a => !usedNorms.has(norm(a.response)));

      if (candidate) {
        const replacement = {
          value: clue.value,
          clue: candidate.clue,
          response: candidate.response,
          provenance: 'answer_first' as const,
          verification: candidate.verification,
        };
        const updatedCategories = [...generatedGameData.categories];
        updatedCategories[catIndex] = { ...category, clues: [...category.clues] };
        updatedCategories[catIndex].clues[clueIndex] = replacement;

        const updatedGame: Game = {
          ...generatedGameData.game,
          categories: updatedCategories.map(cat => ({
            ...cat,
            title: cat.title,
            clues: cat.clues.map(cl => ({ ...cl })),
          })),
        };

        // Decrement the pool: remove the used alternative so the next regen
        // pulls the next one, not the same one.
        const updatedAlternatives = (generatedGameData.alternatives || []).map(a =>
          a.title.toLowerCase() === category.title.toLowerCase()
            ? { ...a, clues: a.clues.filter(c => !(c.clue === candidate.clue && c.response === candidate.response)) }
            : a
        ).filter(a => a.clues.length > 0);

        setGeneratedGameData({
          ...generatedGameData,
          game: updatedGame,
          categories: updatedCategories,
          alternatives: updatedAlternatives.length ? updatedAlternatives : undefined,
        });
        setAiPreviewData(prev => ({ ...prev, categories: updatedCategories }));
        setRegeneratedItems(prev => new Set(prev).add(`cat-${catIndex}-clue-${clueIndex}`));
        return; // pool hit — skip the fresh AI call entirely
      }

      // ----- FRESH-CALL FALLBACK: pool exhausted (or none), generate anew -----
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
            ...cat,
            title: cat.title,
            clues: cat.clues.map(clue => ({ ...clue,
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
        ...cat,
        title: cat.title,
        clues: cat.clues.map(clue => ({ ...clue,
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
        ...cat,
        title: cat.title,
        clues: cat.clues.map(clue => ({ ...clue,
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
        ...cat,
        title: cat.title,
        clues: cat.clues.map(clue => ({ ...clue,
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

  const customGamesNow = loadCustomGames();
  // Built-in games carry their data on the list entry itself; only custom games are in customGamesNow.
  const fullGameFor = (game: GameMeta): Game =>
    customGamesNow.find((g) => g.id === game.id)?.game ||
    game.game ||
    ({ id: game.id, title: game.title, subtitle: game.subtitle || '', categories: [], rows: 5 } as Game);

  // Presentation-only derived data for the lobby (progress rings, hero preview, filter chips)
  const summaryById = new Map(games.map((g) => [g.id, summarizeGame(g)]));
  // Hidden games leave the shelf (nothing is deleted); they show only under the Hidden filter.
  const visibleGames = sortedGames.filter((g) => !hiddenIds.has(g.id));
  const statusCounts: Record<StatusFilter, number> = {
    all: visibleGames.length, inProgress: 0, new: 0, done: 0, hidden: sortedGames.length - visibleGames.length,
  };
  for (const g of visibleGames) {
    const st = summaryById.get(g.id)?.status;
    if (st) statusCounts[st]++;
  }
  const shelfGames =
    statusFilter === 'hidden'
      ? sortedGames.filter((g) => hiddenIds.has(g.id))
      : visibleGames.filter((g) => statusFilter === 'all' || summaryById.get(g.id)?.status === statusFilter);
  // First run: the library holds only the built-in boards, so show how it works beside "New game".
  const firstRun = !gamesLoading && games.length > 0 && games.every((g) => g.source === 'index');
  const toggleHidden = (id: string) => {
    const hide = !hiddenIds.has(id);
    setGameHidden(id, hide);
    // Don't leave a game that just left the shelf selected in the hero.
    if (hide && selectedGameId === id) {
      const next = visibleGames.find((g) => g.id !== id);
      if (next) setSelectedGameId(next.id);
    }
  };
  const selectedSummary = selectedGameId ? summaryById.get(selectedGameId) ?? null : null;

  const handleCreateClick = () => {
    if (!isSignedIn) {
      signInIntent.current = 'create';
      setShowSignInPrompt(true);
    } else {
      setShowWizard(true);
    }
  };

  return (
    <div className="lobby-root px-5 py-6 xl:px-10" style={lobbyVars(currentThemeData)}>
      <div className="relative mx-auto grid max-w-[1920px] gap-8 lg:grid-cols-[clamp(24rem,30vw,40rem)_minmax(0,1fr)]">
        {/* Stage: logo, selected game, teams */}
        <aside className="lobby-scroll -mx-2 flex flex-col gap-4 px-2 pb-2 pt-1 [&>*]:shrink-0 lg:sticky lg:top-6 lg:max-h-[calc(100vh-3rem)] lg:self-start lg:overflow-y-auto">
          <LobbyLogo />
          <GameHero
            game={selectedSummary}
            loading={gamesLoading}
            onPlay={handleStartGame}
            onCreate={handleCreateClick}
            createDisabled={aiLoading}
          />
          <TeamRoster
            teams={teams}
            loading={gamesLoading}
            aiAvailable={Boolean(aiAvailable)}
            onRename={handleUpdateTeamName}
            onRemove={handleRemoveTeam}
            onAdd={handleAddTeam}
            onGenerateAll={handleAIGenerateAllTeamNames}
            onGenerateName={handleAIGenerateTeamName}
            onEnhanceName={handleAIEnhanceTeamName}
          />
        </aside>

        {/* Library shelf */}
        <main className="flex min-w-0 flex-col gap-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-baseline gap-3">
              <h2 className="lobby-display m-0 text-[2rem] leading-none">Game library</h2>
              <span className="text-sm text-white/55">
                {gamesLoading ? '…' : `${sortedGames.length} ${sortedGames.length === 1 ? 'game' : 'games'}`}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
            {/* AI Model dropdown menu - hidden by default, shown with Cmd/Ctrl+Shift+S */}
            {showAIModelSelector && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-10 border-white/25 bg-transparent text-white hover:bg-white/10"
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

                    {(['codex', 'openai'] as const).map(provider => availableModels.some(m => m.provider === provider) && (
                      <DropdownMenuSub key={provider}>
                        <DropdownMenuSubTrigger>{provider === 'codex' ? 'Subscription · local' : 'OpenAI API'}</DropdownMenuSubTrigger>
                        <DropdownMenuSubContent sideOffset={5} className="max-h-80 overflow-y-auto w-64">
                          {availableModels.filter(m => m.provider === provider).map(model => (
                            <DropdownMenuItem key={model.id} onClick={() => handleAIModelChange(model.id)}>
                              {model.name}{aiModel === model.id ? ' ✓' : ''}
                            </DropdownMenuItem>
                          ))}
                        </DropdownMenuSubContent>
                      </DropdownMenuSub>
                    ))}
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

              <TableSettings
                currentTheme={currentTheme}
                onThemeChange={handleThemeChange}
                iconSize={iconSize}
                onIconSizeChange={handleIconSizeChange}
              />
              <AccountMenu />
            </div>
          </div>

          <LibraryToolbar
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            sort={gameSort}
            onSortChange={setGameSort}
            filter={statusFilter}
            onFilterChange={setStatusFilter}
            counts={statusCounts}
          />

          <div
            key={gameStateRefreshKey}
            className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(15rem,1fr))]"
            aria-busy={gamesLoading}
          >
            {gamesLoading ? (
              <>
                {[0, 1, 2, 3].map((i) => (
                  <div key={i} className="h-[13.5rem] animate-pulse rounded-[18px] border border-white/10 bg-white/5" />
                ))}
              </>
            ) : (
              <>
                {statusFilter !== 'hidden' && <NewGameCard onClick={handleCreateClick} disabled={aiLoading} />}
                {firstRun && statusFilter !== 'hidden' && <HowItWorks />}
                {shelfGames.map((game) => {
                  const gameData = customGamesNow.find((g) => g.id === game.id);
                  const summary = summaryById.get(game.id);
                  if (!summary) return null;
                  return (
                    <GameCard
                      key={game.id}
                      game={summary}
                      selected={selectedGameId === game.id}
                      onSelect={() => setSelectedGameId(game.id)}
                      onPlay={() => {
                        recordGamePlay(game.id);
                        onSelectGame(game.id, fullGameFor(game), teams);
                      }}
                      menu={
                        <GameCardMenu
                          onOpen={() => setSelectedGameId(game.id)}
                          onPlay={() => {
                            recordGamePlay(game.id);
                            onSelectGame(game.id, fullGameFor(game), teams);
                          }}
                          onEditBoard={() => onOpenEditor(fullGameFor(game), game.id)}
                          onInfo={gameData?.game?.metadata ? () => setGameInfoMetadata(gameData?.game?.metadata) : undefined}
                          onExport={() => handleExportGame(game)}
                          onReset={() => handleResetGame(game.id)}
                          hidden={hiddenIds.has(game.id)}
                          onToggleHidden={() => toggleHidden(game.id)}
                          onDelete={game.source === 'custom' ? () => handleDeleteGame(game.id) : undefined}
                        />
                      }
                    />
                  );
                })}
                {shelfGames.length === 0 && games.length > 0 && (
                  <div className="col-span-full flex flex-col items-start gap-2 rounded-2xl border border-dashed border-white/15 p-6 text-sm text-white/65">
                    <span>
                      {statusFilter === 'hidden' && !searchQuery
                        ? 'No hidden games.'
                        : statusFilter === 'all' && !searchQuery && visibleGames.length === 0 && statusCounts.hidden > 0
                          ? 'Every game is hidden. Nothing was deleted.'
                          : `No games match${searchQuery ? ` "${searchQuery}"` : ' this filter'}.`}
                    </span>
                    {statusFilter === 'all' && !searchQuery && visibleGames.length === 0 && statusCounts.hidden > 0 && (
                      <button
                        type="button"
                        className="text-[var(--lb-accent)] underline underline-offset-4"
                        onClick={() => setStatusFilter('hidden')}
                      >
                        Show hidden games
                      </button>
                    )}
                    <button
                      type="button"
                      className="text-[var(--lb-accent)] underline underline-offset-4"
                      onClick={() => {
                        setSearchQuery('');
                        setStatusFilter('all');
                      }}
                    >
                      Clear search and filters
                    </button>
                  </div>
                )}
              </>
            )}
          </div>

          <footer className="mt-4 text-sm text-white/40">Jeop3 v3.1 • Built with React + shadcn/ui</footer>
        </main>
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
        loadingStage={wizardStage}
        generationEvent={generationEvent}
        research={generationResearch}
        progress={wizardProgress}
        error={wizardError}
        onRetry={handleWizardRetry}
        onCancelGeneration={handleWizardCancel}
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
        data={{ ...aiPreviewData, finalJeopardy: generatedGameData?.game.finalJeopardy, boardReview: generatedGameData?.boardReview, finalWarning: generatedGameData?.finalWarning }}
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
                <AlertDialogAction className="bg-purple-600 hover:bg-purple-500 text-white">
                  Sign In
                </AlertDialogAction>
              </SignInButton>
            </AlertDialogFooter>
            {isLocalDev && (
              <button
                type="button"
                onClick={() => {
                  enableDevAuthBypass();
                  if (signInIntent.current === 'create') {
                    try { sessionStorage.setItem(RESUME_WIZARD_KEY, 'true'); } catch { /* best effort */ }
                  }
                  window.location.reload();
                }}
                className="mt-3 w-full text-center text-xs text-slate-400 hover:text-slate-200 underline underline-offset-2"
              >
                Skip sign-in (local dev / testing)
              </button>
            )}
          </AlertDialogContent>
        </AlertDialog>
      </SignedOut>
    </div>
  );
}
