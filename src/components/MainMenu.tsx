import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import type { GameMeta, Team, Game, Category, Clue } from '@/lib/storage';
import { loadCustomGames, saveCustomGames, getSelectedGameId } from '@/lib/storage';
import { themes, applyTheme, getStoredTheme, type ThemeKey } from '@/lib/themes';
import { useAIGeneration } from '@/lib/ai/hooks';
import { AIPreviewDialog } from '@/components/ai/AIPreviewDialog';
import { NewGameWizard } from '@/components/NewGameWizard';
import type { AIPromptType, AIContext, AIDifficulty } from '@/lib/ai/types';
import type { PreviewData } from '@/components/ai';
import { Gamepad2, Users, Sparkles, Palette, Settings, Wand2, Dice1 } from 'lucide-react';

interface MainMenuProps {
  onSelectGame: (gameId: string, game: any) => void;
  onOpenEditor: (game?: Game) => void;
}

interface GeneratedGameData {
  game: Game;
  categories: Array<{
    title: string;
    contentTopic?: string;
    clues: Array<{ value: number; clue: string; response: string }>;
  }>;
  titles: Array<{ title: string; subtitle: string }>;
  suggestedTeamNames: string[];
  theme: string;
  difficulty: AIDifficulty;
}

export function MainMenu({ onSelectGame, onOpenEditor }: MainMenuProps) {
  const [games, setGames] = useState<GameMeta[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedGameId, setSelectedGameId] = useState<string | null>(null);
  const [teams, setTeams] = useState<Team[]>([
    { id: '1', name: 'Team 1', score: 0 },
    { id: '2', name: 'Team 2', score: 0 },
  ]);
  const [currentTheme, setCurrentTheme] = useState<ThemeKey>(getStoredTheme());
  const [showThemePicker, setShowThemePicker] = useState(false);
  const [showWizard, setShowWizard] = useState(false);

  // AI Preview state
  const [aiPreviewOpen, setAiPreviewOpen] = useState(false);
  const [aiPreviewType, setAiPreviewType] = useState<AIPromptType>('categories-generate');
  const [aiPreviewData, setAiPreviewData] = useState<PreviewData>({});
  const [generatedGameData, setGeneratedGameData] = useState<GeneratedGameData | null>(null);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [dataVersion, setDataVersion] = useState(0);
  const [regeneratedItems, setRegeneratedItems] = useState<Set<string>>(new Set());
  const [isWizardGenerating, setIsWizardGenerating] = useState(false);
  const [regeneratingCounts, setRegeneratingCounts] = useState<{ categories: number; clues: number } | null>(null);
  const [rewritingCategory, setRewritingCategory] = useState<number | null>(null);
  const [rewritingClue, setRewritingClue] = useState<{ catIndex: number; clueIndex: number } | null>(null);
  const [rewritingTitle, setRewritingTitle] = useState<number | null>(null);
  const [rewritingTeamName, setRewritingTeamName] = useState<number | null>(null);

  const { generate: aiGenerate, isLoading: aiLoading, isAvailable: aiAvailable } = useAIGeneration();

  useEffect(() => {
    loadGames();
  }, []);

  const loadGames = async () => {
    try {
      const response = await fetch('/games/index.json');
      const data = await response.json();
      const indexGames: GameMeta[] = (data.games || []).map((g: any) => ({
        ...g,
        source: 'index' as const,
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

  const filteredGames = games.filter((game) =>
    game.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleAddTeam = () => {
    const newId = crypto.randomUUID();
    setTeams([...teams, { id: newId, name: `Team ${teams.length + 1}`, score: 0 }]);
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
    setShowThemePicker(false);
  };

  const handleStartGame = () => {
    if (!selectedGameId) return;
    const game = games.find((g) => g.id === selectedGameId);
    if (!game) return;
    setSelectedGameId(selectedGameId);
    onSelectGame(selectedGameId, game.game);
  };

  // ==================== AI TEAM NAME HANDLERS ====================

  const handleAIGenerateTeamName = async (teamIndex: number) => {
    if (!aiAvailable) return;
    const otherTeamNames = teams
      .map((t, i) => (i === teamIndex ? null : t.name))
      .filter((n): n is string => Boolean(n?.trim()));
    const selectedGame = games.find((g) => g.id === selectedGameId);
    const gameTopic = selectedGame?.title || selectedGame?.subtitle || '';

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
    const gameTopic = selectedGame?.title || selectedGame?.subtitle || '';

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
    const gameTopic = selectedGame?.title || selectedGame?.subtitle || '';

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

  const handleAIGenerateNewGame = () => {
    setShowWizard(true);
  };

  const handleWizardComplete = async (theme: string, difficulty: AIDifficulty) => {
    // Reset data version and regenerated items for new game
    setDataVersion(0);
    setRegeneratedItems(new Set());

    setIsWizardGenerating(true);

    // Generate categories
    const categoriesResult = await aiGenerate(
      'categories-generate',
      { theme: theme || 'random', count: 6 },
      difficulty
    );

    if (!categoriesResult || typeof categoriesResult !== 'object' || !('categories' in categoriesResult)) {
      setIsWizardGenerating(false);
      setShowWizard(false);
      return;
    }

    const categoriesList = (categoriesResult as any).categories as Array<{
      title: string;
      clues: Array<{ value: number; clue: string; response: string }>;
    }>;

    // Generate titles
    const titlesResult = await aiGenerate(
      'game-title',
      { theme: theme || 'random', count: 3 },
      difficulty
    );

    const titlesList = (titlesResult && typeof titlesResult === 'object' && 'titles' in titlesResult)
      ? (titlesResult as any).titles as Array<{ title: string; subtitle: string }>
      : [{ title: `${theme || 'Trivia'} Night`, subtitle: theme || '' }];

    // Generate team names based on theme
    const teamNamesResult = await aiGenerate('team-name-random', {
      count: 4,
      existingNames: [],
      gameTopic: theme || '',
    });

    const suggestedTeamNames = (teamNamesResult && typeof teamNamesResult === 'object' && 'names' in teamNamesResult)
      ? (teamNamesResult as any).names as string[]
      : [];

    setIsWizardGenerating(false);
    setShowWizard(false);

    // Build categories for the Game object
    const gameCategories: Category[] = [];
    for (const cat of categoriesList) {
      const categoryClues: Clue[] = [];
      for (const clue of cat.clues) {
        categoryClues.push({
          value: clue.value,
          clue: clue.clue,
          response: clue.response,
          completed: false,
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
      categories: gameCategories,
      rows: 5,
      suggestedTeamNames: suggestedTeamNames,
    };

    // Store the generated game data for later use
    setGeneratedGameData({
      game: newGame,
      categories: categoriesList,
      titles: titlesList,
      suggestedTeamNames,
      theme,
      difficulty,
    });

    // Show preview dialog
    setAiPreviewData({ categories: categoriesList, titles: titlesList, suggestedTeamNames });
    setAiPreviewType('categories-generate');
    setAiPreviewOpen(true);
  };

  // ==================== AI PREVIEW HANDLERS ====================

  const handleAIPreviewConfirm = useCallback((selected: { title?: number; items: Set<string> }) => {
    setAiPreviewOpen(false);

    if (!generatedGameData) return;

    const { title: selectedTitleIndex, items: checkedItems } = selected;

    // Apply selected title
    const selectedTitle = generatedGameData.titles[selectedTitleIndex ?? 0] ?? generatedGameData.titles[0];

    // Filter out checked items (marked for regeneration) from the game
    let categoriesToApply = generatedGameData.categories;

    if (checkedItems.size > 0) {
      categoriesToApply = generatedGameData.categories.filter((cat, i) => {
        const catId = `cat-${i}`;
        return !checkedItems.has(catId);
      }).map(cat => {
        const catIdx = generatedGameData.categories.indexOf(cat);
        const uncheckedClues = cat.clues.filter((_, j) => {
          const clueId = `cat-${catIdx}-clue-${j}`;
          return !checkedItems.has(clueId);
        });

        if (uncheckedClues.length === 0) {
          return null;
        }

        return {
          ...cat,
          clues: uncheckedClues
        };
      }).filter((cat): cat is typeof cat => cat !== null);
    }

    // Build the final game with selected title and filtered categories
    const finalGame: Game = {
      ...generatedGameData.game,
      title: selectedTitle.title,
      subtitle: selectedTitle.subtitle,
      suggestedTeamNames: generatedGameData.suggestedTeamNames,
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

    // Create game metadata and save to localStorage
    const gameMeta: GameMeta = {
      id: gameId,
      title: finalGame.title,
      subtitle: finalGame.subtitle,
      source: 'custom',
      game: finalGame,
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
    setGeneratedGameData(null);
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

    // Generate titles
    const titlesResult = await aiGenerate(
      'game-title',
      { theme: generatedGameData.theme || 'random', count: 3 },
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
          completed: false,
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

  const handleRegenerateSelected = useCallback(async (checkedItems: Set<string>) => {
    if (!generatedGameData || checkedItems.size === 0) return;

    setIsRegenerating(true);

    // Calculate regenerating counts for display
    let catCount = 0;
    let clueCount = 0;
    generatedGameData.categories.forEach((cat, i) => {
      const catId = `cat-${i}`;
      if (checkedItems.has(catId)) {
        catCount++;
      } else {
        cat.clues.forEach((_, j) => {
          if (checkedItems.has(`cat-${i}-clue-${j}`)) {
            clueCount++;
          }
        });
      }
    });
    setRegeneratingCounts({ categories: catCount, clues: clueCount });

    // Track successfully regenerated items
    const successfullyRegenerated = new Set<string>();

    try {
      // Separate checked items into categories and individual clues
      const updatedCategories = [...generatedGameData.categories];

      for (const [catIndex, category] of updatedCategories.entries()) {
        const catId = `cat-${catIndex}`;

        if (checkedItems.has(catId)) {
          // Regenerate entire category
          const result = await aiGenerate(
            'category-replace-all',
            {
              categoryTitle: category.title,
              contentTopic: category.contentTopic || category.title,
              theme: generatedGameData.theme || category.title,
              existingClues: category.clues,
            },
            generatedGameData.difficulty
          );

          if (result && typeof result === 'object') {
            const catData = result as { category?: typeof category; title?: string; clues?: typeof category.clues };
            const newCat = catData.category || (catData.title && catData.clues ? { title: catData.title, clues: catData.clues } : null);
            if (newCat) {
              updatedCategories[catIndex] = newCat;
              successfullyRegenerated.add(catId);
            }
          }
        } else {
          // Check for individual clues to regenerate
          const cluesToRegenerate: number[] = [];
          category.clues.forEach((_, j) => {
            const clueId = `cat-${catIndex}-clue-${j}`;
            if (checkedItems.has(clueId)) {
              cluesToRegenerate.push(j);
            }
          });

          // Regenerate individual clues (use question-generate-single for each)
          for (const clueIndex of cluesToRegenerate) {
            const result = await aiGenerate(
              'question-generate-single',
              {
                categoryTitle: category.title,
                contentTopic: category.contentTopic || category.title,
                value: category.clues[clueIndex].value,
                existingClues: category.clues.filter((_, i) => !cluesToRegenerate.includes(i)),
              },
              generatedGameData.difficulty
            );

            if (result && typeof result === 'object' && 'clue' in result) {
              const clueData = result as { clue: { value: number; clue: string; response: string } };
              updatedCategories[catIndex].clues[clueIndex] = clueData.clue;
              successfullyRegenerated.add(`cat-${catIndex}-clue-${clueIndex}`);
            }
          }
        }
      }

      // Update the game with regenerated content
      const newGame: Game = {
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
        game: newGame,
        categories: updatedCategories,
      });

      setAiPreviewData({ categories: updatedCategories });
      setRegeneratedItems(successfullyRegenerated);
      setDataVersion(prev => prev + 1);
    } finally {
      setIsRegenerating(false);
      setRegeneratingCounts(null);
    }
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
              completed: false,
            })),
          })),
        };

        setGeneratedGameData({
          ...generatedGameData,
          game: updatedGame,
          categories: updatedCategories,
        });

        setAiPreviewData({ categories: updatedCategories });
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

      const result = await aiGenerate('editor-rewrite-clue', {
        categoryTitle: category.title,
        contentTopic: category.contentTopic || category.title,
        currentClue: clue.clue,
        value: clue.value,
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
              completed: false,
            })),
          })),
        };

        setGeneratedGameData({
          ...generatedGameData,
          game: updatedGame,
          categories: updatedCategories,
        });

        setAiPreviewData({ categories: updatedCategories });
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

      const result = await aiGenerate(
        'game-title',
        { theme, count: 1, existingTitles: otherTitles },
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

      const result = await aiGenerate(
        'game-title',
        { theme, count: 3 },
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
        <header className="text-center mb-8">
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
              <Badge variant="outline" className="text-xs">
                {filteredGames.length} games
              </Badge>
            </div>

            <Input
              placeholder="Search games..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="mb-4 bg-slate-800/50 border-slate-700"
            />

            <div className="space-y-2 max-h-80 overflow-y-auto pr-2">
              {filteredGames.map((game) => (
                <button
                  key={game.id}
                  onClick={() => {
                    setSelectedGameId(game.id);
                  }}
                  className={`w-full text-left p-3 rounded-lg border transition-all ${
                    selectedGameId === game.id
                      ? 'bg-yellow-500/20 border-yellow-500/50'
                      : 'bg-slate-800/30 border-slate-700/50 hover:border-slate-600 hover:bg-slate-800/50'
                  }`}
                >
                  <div className="font-medium text-sm">{game.title}</div>
                  {game.subtitle && (
                    <div className="text-xs text-slate-400 mt-1">{game.subtitle}</div>
                  )}
                </button>
              ))}
            </div>

            <div className="flex flex-col gap-2 mt-4">
              {aiAvailable && (
                <Button
                  onClick={handleAIGenerateNewGame}
                  variant="default"
                  className="w-full bg-gradient-to-r from-purple-500 to-purple-600 hover:from-purple-400 hover:to-purple-500 text-white border-0"
                  disabled={aiLoading}
                >
                  <Wand2 className="w-4 h-4 mr-2" />
                  AI Generate Game
                </Button>
              )}
              <Button
                onClick={() => onOpenEditor()}
                variant="outline"
                className="w-full border-yellow-500/50 text-yellow-500 hover:bg-yellow-500/10"
              >
                <Sparkles className="w-4 h-4 mr-2" />
                Game Creator
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
              <Button
                onClick={() => setShowThemePicker(!showThemePicker)}
                variant="outline"
                size="sm"
                className="border-slate-700"
              >
                <Palette className="w-4 h-4 mr-2" />
                Theme
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="border-slate-700"
              >
                <Settings className="w-4 h-4 mr-2" />
                Settings
              </Button>
            </div>

            {/* Theme picker */}
            {showThemePicker && (
              <div className="mt-4 p-4 bg-slate-900/80 backdrop-blur-sm border border-slate-700 rounded-lg w-full max-w-xs">
                <h3 className="text-sm font-medium mb-3">Choose Theme</h3>
                <div className="grid grid-cols-2 gap-2">
                  {Object.entries(themes).map(([key, theme]) => (
                    <button
                      key={key}
                      onClick={() => handleThemeChange(key as ThemeKey)}
                      className={`text-xs p-3 rounded-lg border-2 transition-all font-medium ${
                        currentTheme === key
                          ? 'border-yellow-500 ring-2 ring-yellow-500/50'
                          : 'border-slate-700 hover:border-slate-500'
                      }`}
                      style={{
                        background: `linear-gradient(135deg, ${theme.primary}, ${theme.secondary})`,
                        color: '#fff',
                        textShadow: '0 1px 2px rgba(0,0,0,0.5)',
                      }}
                    >
                      <div>{theme.name}</div>
                      {currentTheme === key && (
                        <div className="text-xs opacity-75 mt-1">✓ Active</div>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}
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
                    className="bg-slate-800/50 border-slate-700"
                  />
                  {aiAvailable && (
                    <div className="flex gap-1">
                      <Button
                        onClick={() => handleAIGenerateTeamName(index)}
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0 text-yellow-500 hover:text-yellow-400 hover:bg-yellow-500/10"
                        title="Generate random name"
                      >
                        <Dice1 className="w-4 h-4" />
                      </Button>
                      <Button
                        onClick={() => handleAIEnhanceTeamName(index)}
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0 text-purple-500 hover:text-purple-400 hover:bg-purple-500/10"
                        title="Enhance this name"
                      >
                        <Sparkles className="w-4 h-4" />
                      </Button>
                    </div>
                  )}
                  {teams.length > 1 && (
                    <Button
                      onClick={() => handleRemoveTeam(team.id)}
                      variant="ghost"
                      size="sm"
                      className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
                    >
                      ×
                    </Button>
                  )}
                </div>
              ))}
            </div>

            <Button
              onClick={handleAddTeam}
              variant="outline"
              className="w-full mt-4 border-slate-700"
              disabled={teams.length >= 6}
            >
              + Add Team
            </Button>
          </div>
        </div>

        {/* Footer */}
        <footer className="mt-8 text-center text-sm text-slate-500">
          Jeop3 v3.0 • Built with React + shadcn/ui
        </footer>
      </div>

      {/* New Game Wizard */}
      <NewGameWizard
        open={showWizard}
        onClose={() => setShowWizard(false)}
        onComplete={handleWizardComplete}
        isLoading={isWizardGenerating}
      />

      {/* AI Preview Dialog */}
      <AIPreviewDialog
        open={aiPreviewOpen}
        type={aiPreviewType}
        data={aiPreviewData}
        onConfirm={handleAIPreviewConfirm}
        onCancel={handleAIPreviewCancel}
        onRegenerateAll={handleRegenerateAll}
        onRegenerateSelected={handleRegenerateSelected}
        onRewriteCategoryTitle={handleRewriteCategoryTitle}
        onRewriteClue={handleRewriteClue}
        onRegenerateTitle={handleRegenerateTitle}
        onRegenerateAllTitles={handleRegenerateAllTitles}
        onRegenerateTeamName={handleRegenerateTeamName}
        onRegenerateAllTeamNames={handleRegenerateAllTeamNames}
        isLoading={isRegenerating}
        dataVersion={dataVersion}
        regeneratedItems={regeneratedItems}
        regeneratingCounts={regeneratingCounts}
        rewritingCategory={rewritingCategory}
        rewritingClue={rewritingClue}
        rewritingTitle={rewritingTitle}
        rewritingTeamName={rewritingTeamName}
      />
    </div>
  );
}
