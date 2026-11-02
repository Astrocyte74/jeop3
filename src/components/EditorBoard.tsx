import { VerificationBadge } from './ai/VerificationBadge';
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
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
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import type { Game, Category, Clue } from '@/lib/storage';
import {
  Save, Home, Plus, MoreVertical, X, Wand2, Sparkles, RefreshCw, Dice1, AlertCircle, Check, BookOpen,
  Eye, EyeOff, PencilLine, ChevronLeft, ChevronRight, Users, ChevronDown,
} from 'lucide-react';
import { useAIGeneration } from '@/lib/ai';
import { generateContentSpan } from '@/lib/ai/board';
import { EDITOR_NAME, StatusDot, StatusSummary, countStatuses, getClueStatus, readShowAnswers, writeShowAnswers } from './editor/clueStatus';

interface EditorBoardProps {
  game: Game;
  onSave: (game: Game) => void;
  onExit: () => void;
  onCancel: () => void;
}

const IS_MAC = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

export function EditorBoard({ game, onSave, onExit, onCancel }: EditorBoardProps) {
  const [editingGame, setEditingGame] = useState<Game>({ ...game });
  const [editingCell, setEditingCell] = useState<{ categoryId: number; clueIndex: number } | null>(null);
  // Which action a pending "unsaved changes" confirmation will run.
  const [pendingLeave, setPendingLeave] = useState<'discard' | 'menu' | null>(null);
  const [showAnswers, setShowAnswers] = useState<boolean>(readShowAnswers);
  const [teamsOpen, setTeamsOpen] = useState(false);
  const [teams, setTeams] = useState<{ id: string; name: string }[]>([
    { id: '1', name: 'Team 1' },
    { id: '2', name: 'Team 2' },
  ]);
  // Only write team names back into the game once the user actually edits them.
  const teamsTouched = useRef(false);
  const updateTeams = (updater: (prev: { id: string; name: string }[]) => { id: string; name: string }[]) => {
    teamsTouched.current = true;
    setTeams(updater);
  };

  // AI state
  const { generate, isLoading: aiLoading, isAvailable: aiAvailable } = useAIGeneration();
  // Per-clue / per-category regen busy state (smart-AI drawer actions).
  const [regeneratingClue, setRegeneratingClue] = useState(false);
  const [regeneratingCategory, setRegeneratingCategory] = useState<number | null>(null);
  // Alternatives pool (filled by per-category regen; consumed by per-clue regen).
  // Empty until a category is regenerated in this session — alternatives don't
  // persist across reloads.
  const [alternatives, setAlternatives] = useState<NonNullable<import('@/lib/ai/board').ContentSpanResult['alternatives']>>([]);

  const categories = editingGame.categories || [];
  const rowCount = editingGame.rows || categories[0]?.clues?.length || 5;

  // Calculate grid columns for teams
  const teamCount = teams.length;
  const teamGridCols = teamCount <= 2 ? 1 : teamCount <= 4 ? 2 : 3;

  // Helper functions for metadata display
  const formatModelName = (modelId?: string): string => {
    if (!modelId) return 'Unknown';
    const parts = modelId.split(':');
    const provider = parts[0];
    const modelName = parts.slice(1).join(':');
    if (provider === 'or' || provider === 'openrouter') {
      return `🤖 ${modelName}`;
    } else if (provider === 'ollama') {
      return `🦙 ${modelName}`;
    }
    return modelName;
  };

  const formatGenerationTime = (ms?: number): string => {
    if (!ms) return '';
    if (ms < 1000) return `${ms}ms`;
    const seconds = Math.floor(ms / 1000);
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return remainingSeconds > 0
      ? `${minutes} min ${remainingSeconds}s`
      : `${minutes} min`;
  };

  const formatTimestamp = (iso?: string): string => {
    if (!iso) return '';
    const date = new Date(iso);
    return date.toLocaleString();
  };

  // Check if game has changed from original
  const hasChanges = useMemo(
    () => JSON.stringify(editingGame) !== JSON.stringify(game),
    [editingGame, game],
  );

  // Load suggested team names from game on mount
  useEffect(() => {
    if (game.suggestedTeamNames && game.suggestedTeamNames.length > 0) {
      // Load suggested team names, keeping at least 2 teams
      const teamCount = Math.max(2, game.suggestedTeamNames.length);
      setTeams(
        Array.from({ length: teamCount }, (_, i) => ({
          id: crypto.randomUUID(),
          name: game.suggestedTeamNames?.[i] || `Team ${i + 1}`,
        }))
      );
    }
  }, [game]);

  // Team names edited here are saved with the game (as its suggested names).
  useEffect(() => {
    if (!teamsTouched.current) return;
    const names = teams.map((t) => t.name);
    setEditingGame((g) => (JSON.stringify(g.suggestedTeamNames) === JSON.stringify(names) ? g : { ...g, suggestedTeamNames: names }));
  }, [teams]);

  const toggleAnswers = () => {
    setShowAnswers((prev) => {
      const next = !prev;
      writeShowAnswers(next);
      return next;
    });
  };

  const updateCategoryTitle = (index: number, title: string) => {
    const newCategories = [...categories];
    newCategories[index] = { ...newCategories[index], title };
    setEditingGame({ ...editingGame, categories: newCategories });
  };

  const moveCategory = (index: number, delta: -1 | 1) => {
    const target = index + delta;
    if (target < 0 || target >= categories.length) return;
    const newCategories = [...categories];
    [newCategories[index], newCategories[target]] = [newCategories[target], newCategories[index]];
    setEditingGame({ ...editingGame, categories: newCategories });
  };

  const updateClue = (categoryId: number, clueIndex: number, updates: Partial<Clue>) => {
    const newCategories = [...categories];
    const category = { ...newCategories[categoryId] };
    const newClues = [...category.clues];
    newClues[clueIndex] = { ...newClues[clueIndex], ...updates };
    category.clues = newClues;
    newCategories[categoryId] = category;
    setEditingGame({ ...editingGame, categories: newCategories });
  };

  const addCategory = () => {
    const newCategory: Category = {
      title: 'New Category',
      clues: Array.from({ length: rowCount }, (_, i) => ({
        value: (i + 1) * 200,
        clue: '',
        response: '',
      })),
    };
    setEditingGame({
      ...editingGame,
      categories: [...categories, newCategory],
    });
  };

  const handleSave = () => {
    onSave(editingGame);
  };

  // Cmd/Ctrl+S saves. Kept in a ref so the listener is registered once.
  const saveRef = useRef(handleSave);
  saveRef.current = handleSave;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 's') {
        e.preventDefault();
        saveRef.current();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Esc closes the clue drawer.
  useEffect(() => {
    if (!editingCell) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setEditingCell(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [editingCell]);

  // Browser-level guard against losing edits on reload/close.
  useEffect(() => {
    if (!hasChanges) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [hasChanges]);

  // Leaving without saving only asks when there is something to lose.
  const requestLeave = (kind: 'discard' | 'menu') => {
    if (hasChanges) setPendingLeave(kind);
    else if (kind === 'discard') onCancel();
    else onExit();
  };

  const confirmLeave = () => {
    const kind = pendingLeave;
    setPendingLeave(null);
    if (kind === 'discard') onCancel();
    else if (kind === 'menu') onExit();
  };

  const updateGameTitle = (title: string) => {
    setEditingGame({ ...editingGame, title });
  };

  const updateGameSubtitle = (subtitle: string) => {
    setEditingGame({ ...editingGame, subtitle });
  };

  const handleAddTeam = () => {
    const newId = crypto.randomUUID();
    updateTeams((prev) => [...prev, { id: newId, name: `Team ${prev.length + 1}` }]);
  };

  const handleUpdateTeamName = (id: string, name: string) => {
    updateTeams((prev) => prev.map((t) => (t.id === id ? { ...t, name } : t)));
  };

  const handleRemoveTeam = (id: string) => {
    if (teams.length <= 1) return;
    updateTeams((prev) => prev.filter((t) => t.id !== id));
  };

  // ==================== AI TEAM NAME HANDLERS ====================

  const handleAIGenerateTeamName = async (teamIndex: number) => {
    if (!aiAvailable) return;

    const otherTeamNames = teams
      .map((t, i) => (i === teamIndex ? null : t.name))
      .filter((n): n is string => Boolean(n?.trim()));

    // Build game topic with categories for better context
    const categoryTopics = editingGame.categories.map(c => c.title).join(', ') || '';
    const gameTopic = `${editingGame.title}${editingGame.subtitle ? ': ' + editingGame.subtitle : ''}${categoryTopics ? '. Categories: ' + categoryTopics : ''}`;

    const result = await generate('team-name-random', {
      count: 1,
      existingNames: otherTeamNames,
      gameTopic,
    });

    if (result && typeof result === 'object' && 'names' in result) {
      const names = result as { names: string[] };
      if (names.names[0]) {
        updateTeams((prev) =>
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

    // Build game topic with categories for better context
    const categoryTopics = editingGame.categories.map(c => c.title).join(', ') || '';
    const gameTopic = `${editingGame.title}${editingGame.subtitle ? ': ' + editingGame.subtitle : ''}${categoryTopics ? '. Categories: ' + categoryTopics : ''}`;

    const result = await generate('team-name-enhance', {
      currentName,
      existingNames: otherTeamNames,
      gameTopic,
    });

    if (result && typeof result === 'object' && 'name' in result) {
      const enhanced = result as { name: string };
      if (enhanced.name) {
        updateTeams((prev) =>
          prev.map((t, i) => (i === teamIndex ? { ...t, name: enhanced.name } : t))
        );
      }
    }
  };

  const handleAIGenerateAllTeamNames = async () => {
    if (!aiAvailable) return;

    // Build game topic with categories for better context
    const categoryTopics = editingGame.categories.map(c => c.title).join(', ') || '';
    const gameTopic = `${editingGame.title}${editingGame.subtitle ? ': ' + editingGame.subtitle : ''}${categoryTopics ? '. Categories: ' + categoryTopics : ''}`;

    const result = await generate('team-name-random', {
      count: teams.length,
      existingNames: [],
      gameTopic,
    });

    if (result && typeof result === 'object' && 'names' in result) {
      const names = result as { names: string[] };
      if (names.names.length === teams.length) {
        updateTeams((prev) =>
          prev.map((t, i) => ({ ...t, name: names.names[i] || t.name }))
        );
      }
    }
  };

  // ==================== AI HANDLERS ====================

  const handleAIGenerateClue = useCallback(async () => {
    if (!editingCell) return;
    const { categoryId, clueIndex } = editingCell;
    const category = categories[categoryId];
    const clue = category?.clues[clueIndex];

    // Collect all existing answers from all categories to prevent duplicates
    const allExistingAnswers = editingGame.categories.flatMap(cat =>
      cat.clues.filter(c => c.response).map(c => c.response)
    );

    const result = await generate('editor-generate-clue', {
      categoryTitle: category.title,
      contentTopic: (category as any).contentTopic || category.title,
      value: clue?.value || (clueIndex + 1) * 200,
      existingClues: category.clues,
      existingAnswers: allExistingAnswers,
      referenceMaterial: editingGame.metadata?.sourceMaterial,
    });

    if (result && typeof result === 'object' && 'clue' in result && 'response' in result) {
      updateClue(categoryId, clueIndex, {
        clue: result.clue as string,
        response: result.response as string,
      });
    }
  }, [editingCell, categories, generate, editingGame]);

  const handleAIRewriteClue = useCallback(async () => {
    if (!editingCell) return;
    const { categoryId, clueIndex } = editingCell;
    const category = categories[categoryId];
    const clue = category?.clues[clueIndex];
    if (!clue?.clue) return;

    // Collect all existing answers except the current one
    const allExistingAnswers = editingGame.categories.flatMap(cat =>
      cat.clues.filter(c => c.response && c !== clue).map(c => c.response)
    );

    const result = await generate('editor-rewrite-clue', {
      currentClue: clue.clue,
      categoryTitle: category.title,
      value: clue.value,
      existingAnswers: allExistingAnswers,
      referenceMaterial: editingGame.metadata?.sourceMaterial,
    });

    if (result && typeof result === 'object' && 'clue' in result) {
      updateClue(categoryId, clueIndex, { clue: result.clue as string });
    }
  }, [editingCell, categories, generate, editingGame]);

  const handleAIGenerateAnswer = useCallback(async () => {
    if (!editingCell) return;
    const { categoryId, clueIndex } = editingCell;
    const category = categories[categoryId];
    const clue = category?.clues[clueIndex];
    if (!clue?.clue) return;

    const result = await generate('editor-generate-answer', {
      clue: clue.clue,
      categoryTitle: category.title,
      value: clue.value,
    });

    if (result && typeof result === 'object' && 'response' in result) {
      updateClue(categoryId, clueIndex, { response: result.response as string });
    }
  }, [editingCell, categories, generate]);

  const handleAIValidateClue = useCallback(async () => {
    if (!editingCell) return;
    const { categoryId, clueIndex } = editingCell;
    const category = categories[categoryId];
    const clue = category?.clues[clueIndex];
    if (!clue?.clue || !clue?.response) return;

    const result = await generate('editor-validate', {
      clue: clue.clue,
      response: clue.response,
      categoryTitle: category.title,
      value: clue.value,
    });

    if (result && typeof result === 'object' && 'valid' in result) {
      // Validation result is handled by toast in the hook
      console.log('Validation result:', result);
    }
  }, [editingCell, categories, generate]);

  // ==================== SMART AI (drawer) ====================
  // Regenerate the current clue: pull from the alternatives pool first
  // (instant swap of a known-good judged clue), fall back to a fresh
  // editor-generate-clue call when the pool is empty. The pool fills when a
  // category is regenerated (handleRegenerateCategoryEditor).
  const handleRegenerateClueEditor = useCallback(async () => {
    if (!editingCell) return;
    const { categoryId, clueIndex } = editingCell;
    const category = categories[categoryId];
    const clue = category?.clues[clueIndex];
    if (!category || !clue) return;

    setRegeneratingClue(true);
    try {
      // Pool-first: find a qualified alternative for this category, re-validated
      // against the live board (the pool was deduped at generation but the board
      // may have changed since).
      const norm = (s: string) => s.toLowerCase().replace(/^(the|a|an)\s+/, '').replace(/[^a-z0-9\s]/g, '').trim();
      const usedNorms = new Set(
        editingGame.categories
          .flatMap((c, ci) => ci !== categoryId ? c.clues.map(cl => cl.response) : [])
          .concat(category.clues.filter((_, i) => i !== clueIndex).map(cl => cl.response))
          .map(norm)
      );
      const pool = alternatives.find(a => a.title.toLowerCase() === category.title.toLowerCase())?.clues || [];
      const candidate = pool.find(a => !usedNorms.has(norm(a.response)));

      if (candidate) {
        // Instant swap — re-value to the target clue's dollar amount.
        updateClue(categoryId, clueIndex, {
          verification: candidate.verification,
          clue: candidate.clue,
          response: candidate.response,
          provenance: 'answer_first',
        });
        // Decrement the pool so the next regen pulls the next alternative.
        setAlternatives(prev => prev
          .map(a => a.title.toLowerCase() === category.title.toLowerCase()
            ? { ...a, clues: a.clues.filter(c => !(c.clue === candidate.clue && c.response === candidate.response)) }
            : a)
          .filter(a => a.clues.length > 0));
        return; // pool hit — no fresh AI call needed
      }

      // Fallback: pool empty (or no candidate) → fresh single-clue generation.
      await handleAIGenerateClue();
    } finally {
      setRegeneratingClue(false);
    }
  }, [editingCell, categories, editingGame, alternatives, handleAIGenerateClue, updateClue]);

  // Regenerate the whole category through the answer-first pipeline so the
  // live-game edit meets the same quality bar as initial generation
  // (extract → clues → judge → select), instead of single-pass. Fills the
  // alternatives pool from the run, feeding per-clue regen-from-pool.
  const handleRegenerateCategoryEditor = useCallback(async (categoryId: number) => {
    const category = categories[categoryId];
    if (!category) return;
    setRegeneratingCategory(categoryId);
    try {
      // Existing answers from OTHER categories — preserves cross-category dedup.
      const existingAnswers = editingGame.categories
        .filter((_, i) => i !== categoryId)
        .flatMap(cat => cat.clues.map(c => c.response));

      // Source material: per-category if carried, else the game's metadata source.
      const sourceMaterial = category.sourceMaterial || (editingGame.metadata as any)?.sourceMaterial;
      if (!sourceMaterial) {
        // No source to ground in (e.g. a scratch category). The drawer's
        // "Generate Q&A" (single-clue) still works; whole-category pipeline
        // regen needs a source. Surface nothing here — the button is still
        // clickable but this is a no-op guard.
        console.warn('[EditorBoard] No source material for category — skipping pipeline regen');
        return;
      }

      const span = await generateContentSpan(generate as any, {
        referenceMaterial: sourceMaterial,
        theme: category.contentTopic || editingGame.title || category.title,
        titles: [category.title],
        count: 1,
        difficulty: 'normal',
        existingAnswers,
        sourceMaterial,
        sourceUrl: category.sourceUrl,
        categoryGrounding: [{ ...category, sourceMaterial }],
      });

      const newCat = span.categories[0];
      if (newCat && newCat.clues?.length) {
        // Replace the category's clues with the pipeline-curated set.
        const newCategories = [...categories];
        newCategories[categoryId] = {
          ...category,
          title: newCat.title,
          clues: newCat.clues.map(c => ({ ...c, value: c.value, clue: c.clue, response: c.response, provenance: c.provenance })),
        };
        setEditingGame({ ...editingGame, categories: newCategories });

        // Fill the alternatives pool from the run — per-clue regen pulls from this.
        if (span.alternatives?.length) {
          setAlternatives(prev => [
            ...prev.filter(a => a.title.toLowerCase() !== category.title.toLowerCase()),
            ...span.alternatives!,
          ]);
        }
      }
    } catch (err) {
      console.error('[EditorBoard] Category regen failed:', err);
    } finally {
      setRegeneratingCategory(null);
    }
  }, [categories, editingGame, generate]);

  // Get the current clue being edited
  const getCurrentEditingClue = () => {
    if (!editingCell) return null;
    const { categoryId, clueIndex } = editingCell;
    const category = categories[categoryId];
    const clue = category?.clues[clueIndex];
    return { category, clue, categoryId, clueIndex };
  };

  const currentClue = getCurrentEditingClue();
  const counts = countStatuses(categories);
  const anyBusy = regeneratingClue || regeneratingCategory !== null;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-slate-100">
      {/* Persistent top bar: identity on the left, document actions on the right. */}
      <header className="sticky top-0 z-30 border-b border-white/10 bg-slate-950/90 backdrop-blur">
        <div className="mx-auto flex max-w-[1680px] items-center gap-4 px-5 py-3">
          <div className="flex shrink-0 items-center gap-2 text-purple-300">
            <PencilLine className="h-4 w-4" aria-hidden />
            <span className="text-sm font-semibold">{EDITOR_NAME}</span>
          </div>
          <div className="h-8 w-px shrink-0 bg-white/10" aria-hidden />

          <div className="min-w-0 flex-1">
            <Input
              aria-label="Game title"
              value={editingGame.title}
              onChange={(e) => updateGameTitle(e.target.value)}
              className="h-9 border-transparent bg-transparent px-2 text-2xl text-yellow-400 shadow-none hover:border-white/15 focus-visible:border-yellow-500/50 focus-visible:ring-0 md:text-2xl"
              style={{ fontFamily: 'var(--font-board)', letterSpacing: '0.02em' }}
            />
            <Input
              aria-label="Game subtitle"
              value={editingGame.subtitle || ''}
              onChange={(e) => updateGameSubtitle(e.target.value)}
              placeholder="Add a subtitle"
              className="h-6 border-transparent bg-transparent px-2 text-sm text-slate-300 shadow-none hover:border-white/15 focus-visible:border-white/30 focus-visible:ring-0 md:text-sm"
            />
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <span
              role="status"
              aria-live="polite"
              className={`mr-1 hidden items-center gap-2 text-sm lg:inline-flex ${hasChanges ? 'text-amber-300' : 'text-slate-500'}`}
            >
              <span className={`size-2 rounded-full ${hasChanges ? 'bg-amber-400' : 'bg-slate-600'}`} aria-hidden />
              {hasChanges ? 'Unsaved changes' : 'No changes'}
            </span>

            <Button
              variant="outline"
              size="sm"
              aria-pressed={showAnswers}
              aria-label={showAnswers ? 'Hide answers' : 'Show answers'}
              onClick={toggleAnswers}
              className="border-slate-700 bg-slate-900/60 text-slate-200"
            >
              {showAnswers ? <EyeOff className="mr-1.5 h-4 w-4" /> : <Eye className="mr-1.5 h-4 w-4" />}
              {showAnswers ? 'Hide answers' : 'Show answers'}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={addCategory}
              aria-label="Add category"
              className="border-slate-700 bg-slate-900/60 text-slate-200"
            >
              <Plus className="mr-1.5 h-4 w-4" /> Add category
            </Button>

            <div className="mx-1 h-8 w-px bg-white/10" aria-hidden />

            <Button
              variant="outline"
              size="sm"
              onClick={() => requestLeave('discard')}
              aria-label={hasChanges ? 'Discard changes' : 'Close editor'}
              className="border-slate-600 bg-transparent text-slate-200"
            >
              <X className="mr-1.5 h-4 w-4" />
              {hasChanges ? 'Discard' : 'Close'}
            </Button>
            <Button
              size="sm"
              onClick={handleSave}
              aria-label="Save game"
              className="bg-yellow-500 font-semibold text-black hover:bg-yellow-400"
            >
              <Save className="mr-1.5 h-4 w-4" /> Save
              <kbd className="ml-2 hidden rounded bg-black/15 px-1.5 py-0.5 text-[11px] font-medium md:inline">
                {IS_MAC ? '⌘S' : 'Ctrl+S'}
              </kbd>
            </Button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" aria-label="More editor actions" className="text-slate-300">
                  <MoreVertical className="h-5 w-5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuItem onClick={() => requestLeave('menu')}>
                  <Home className="mr-2 h-4 w-4" />
                  Exit to main menu
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1680px] px-5 pb-12 pt-4">
        {/* Summary strip: legend for the dots on the cards, plus build info. */}
        <div className="mb-3 flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-1">
            <StatusSummary counts={counts} />
            <span className="text-xs text-slate-500">Click a card to edit its clue and answer.</span>
          </div>
          {editingGame.metadata && (editingGame.metadata.modelUsed || editingGame.metadata.generatedAt || editingGame.metadata.generationTimeMs) && (
            <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
              {editingGame.metadata.modelUsed && (
                <span>Model: <span className="font-medium text-slate-400">{formatModelName(editingGame.metadata.modelUsed)}</span></span>
              )}
              {editingGame.metadata.generationTimeMs && (
                <span>Time: <span className="font-medium text-slate-400">{formatGenerationTime(editingGame.metadata.generationTimeMs)}</span></span>
              )}
              {editingGame.metadata.generatedAt && (
                <span>Generated: <span className="font-medium text-slate-400">{formatTimestamp(editingGame.metadata.generatedAt)}</span></span>
              )}
            </div>
          )}
        </div>

        {/* Teams — collapsed by default; names are saved with the game. */}
        <div className="mb-4">
          <button
            type="button"
            onClick={() => setTeamsOpen((o) => !o)}
            aria-expanded={teamsOpen}
            className="inline-flex items-center gap-2 rounded-md px-2 py-1 text-sm text-slate-300 hover:bg-white/5"
          >
            <Users className="h-4 w-4 text-slate-400" />
            Teams
            <span className="text-slate-500">{teams.map((t) => t.name).join(', ')}</span>
            <ChevronDown className={`h-4 w-4 text-slate-500 transition-transform ${teamsOpen ? 'rotate-180' : ''}`} />
          </button>
          {teamsOpen && (
            <div
              className="mt-2 grid max-w-3xl gap-2"
              style={{ gridTemplateColumns: `repeat(${Math.max(2, teamGridCols + 1)}, minmax(0, 1fr))` }}
            >
              {teams.map((team, index) => (
                <div key={team.id} className="group relative flex items-center gap-1">
                  <Input
                    aria-label={`Team ${index + 1} name`}
                    value={team.name}
                    onChange={(e) => handleUpdateTeamName(team.id, e.target.value)}
                    className="border-slate-700 bg-slate-800/50 text-sm font-medium text-slate-200"
                  />
                  {aiAvailable && (
                    <div className="flex gap-0.5">
                      <button
                        onClick={() => handleAIGenerateTeamName(index)}
                        className="flex h-6 w-6 items-center justify-center rounded bg-yellow-500/20 text-yellow-500 hover:bg-yellow-500/40"
                        title="Generate random name"
                        aria-label={`Generate random name for team ${index + 1}`}
                      >
                        <Dice1 className="h-3 w-3" />
                      </button>
                      <button
                        onClick={() => handleAIEnhanceTeamName(index)}
                        className="flex h-6 w-6 items-center justify-center rounded bg-purple-500/20 text-purple-400 hover:bg-purple-500/40"
                        title="Enhance this name"
                        aria-label={`Enhance name for team ${index + 1}`}
                      >
                        <Sparkles className="h-3 w-3" />
                      </button>
                    </div>
                  )}
                  {teams.length > 1 && (
                    <button
                      onClick={() => handleRemoveTeam(team.id)}
                      className="flex h-6 w-6 items-center justify-center rounded text-slate-500 hover:bg-white/10 hover:text-slate-200"
                      title="Remove team"
                      aria-label={`Remove team ${index + 1}`}
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              ))}
              {teams.length < 6 && (
                <button
                  onClick={handleAddTeam}
                  className="rounded-md border border-dashed border-slate-700 px-3 py-2 text-left text-sm text-slate-500 transition-colors hover:border-slate-500 hover:text-slate-300"
                >
                  + Add team
                </button>
              )}
              {aiAvailable && teams.length > 1 && (
                <button
                  onClick={handleAIGenerateAllTeamNames}
                  className="flex items-center gap-2 rounded-md border border-dashed border-yellow-500/50 px-3 py-2 text-left text-sm text-yellow-500 transition-colors hover:border-yellow-500 hover:text-yellow-400"
                  title="Generate names for all teams"
                >
                  <Dice1 className="h-3 w-3" />
                  Name all teams
                </button>
              )}
            </div>
          )}
        </div>

        {/* The board. Category headers rename inline; cards show value, clue,
            answer (when toggled) and a verification dot. */}
        <div className="overflow-x-auto rounded-2xl border border-white/10 p-3" style={{ background: 'linear-gradient(180deg, rgba(255,255,255,0.03), transparent 40%), rgb(11, 18, 40)' }}>
          <div
            className="grid gap-2"
            style={{ gridTemplateColumns: `repeat(${Math.max(categories.length, 1)}, minmax(168px, 1fr))` }}
          >
            {categories.map((category, index) => {
              const catSource = (category as any)?.sourceType as string | undefined;
              return (
                <div
                  key={`h-${index}`}
                  className="group/cat rounded-lg shadow-md"
                  style={{ background: 'linear-gradient(145deg, var(--theme-primary, #0055a4), var(--theme-secondary, #003366))' }}
                >
                  <div className="px-2 pt-2">
                    <Input
                      aria-label={`Category ${index + 1} title`}
                      value={category.title}
                      onChange={(e) => updateCategoryTitle(index, e.target.value)}
                      onFocus={(e) => e.currentTarget.select()}
                      title="Click to rename"
                      className="h-9 border-transparent bg-transparent px-2 text-center text-[13px] font-extrabold uppercase tracking-wide text-white shadow-none hover:border-white/30 hover:bg-black/15 focus-visible:border-white/60 focus-visible:bg-black/25 focus-visible:ring-0 md:text-[13px]"
                    />
                  </div>
                  <div className="flex items-center justify-between px-1.5 pb-1.5 pt-0.5">
                    <div className="flex items-center gap-0.5 opacity-60 transition-opacity group-hover/cat:opacity-100 group-focus-within/cat:opacity-100">
                      <button
                        type="button"
                        onClick={() => moveCategory(index, -1)}
                        disabled={index === 0}
                        aria-label={`Move ${category.title} left`}
                        title="Move left"
                        className="flex h-6 w-6 items-center justify-center rounded text-white/80 hover:bg-black/25 disabled:opacity-25 disabled:hover:bg-transparent"
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => moveCategory(index, 1)}
                        disabled={index === categories.length - 1}
                        aria-label={`Move ${category.title} right`}
                        title="Move right"
                        className="flex h-6 w-6 items-center justify-center rounded text-white/80 hover:bg-black/25 disabled:opacity-25 disabled:hover:bg-transparent"
                      >
                        <ChevronRight className="h-4 w-4" />
                      </button>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {catSource === 'retrieved' && (
                        <span className="inline-flex items-center gap-1 text-[11px] text-white/70" title="Grounded in Wikipedia">
                          <BookOpen className="h-3 w-3" /> Wikipedia
                        </span>
                      )}
                      {catSource === 'ai_synthesized' && (
                        <span className="inline-flex items-center gap-1 text-[11px] text-amber-200/90" title="No Wikipedia match, AI fact-sheet source">
                          <Sparkles className="h-3 w-3" /> AI fact-sheet
                        </span>
                      )}
                      {aiAvailable && (
                        <button
                          type="button"
                          onClick={() => handleRegenerateCategoryEditor(index)}
                          disabled={aiLoading || anyBusy}
                          aria-label={`Regenerate category ${category.title}`}
                          title="Re-run the answer-first pipeline for this category"
                          className="flex h-6 w-6 items-center justify-center rounded text-white/80 opacity-60 transition-opacity hover:bg-black/25 hover:opacity-100 focus-visible:opacity-100 group-hover/cat:opacity-100 disabled:opacity-30"
                        >
                          {regeneratingCategory === index ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}

            {Array.from({ length: rowCount }).map((_, rowIndex) =>
              categories.map((category, categoryIndex) => {
                const clue = category.clues?.[rowIndex];
                const status = getClueStatus(clue, category.title);
                const value = clue?.value || (rowIndex + 1) * 200;
                const prov = (clue as any)?.provenance;
                const srcType = (category as any)?.sourceType;
                const isPatched = prov === 'fallback';
                const isCurated = prov === 'answer_first' || srcType === 'retrieved';
                // Left accent keeps the existing provenance tint.
                const accent = isPatched ? 'border-l-amber-500/70'
                  : isCurated ? 'border-l-emerald-500/60'
                  : 'border-l-white/10';
                const filled = !!clue?.clue;

                return (
                  <button
                    type="button"
                    key={`${categoryIndex}-${rowIndex}`}
                    aria-label={`Edit ${filled ? '' : 'empty '}clue, ${category.title} for ${value}`}
                    onClick={() => setEditingCell({ categoryId: categoryIndex, clueIndex: rowIndex })}
                    className={`group/card relative flex min-h-[100px] flex-col gap-1 rounded-md border border-l-[3px] p-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yellow-400/70 ${accent} ${
                      filled
                        ? 'border-white/10 bg-slate-900/70 hover:border-white/25 hover:bg-slate-800/80'
                        : 'border-dashed border-purple-400/30 bg-transparent hover:bg-purple-500/10'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-[22px] leading-none text-yellow-400" style={{ fontFamily: 'var(--font-board)' }}>
                        ${value}
                      </span>
                      {status && <StatusDot status={status} className="mt-1" />}
                    </div>
                    {filled ? (
                      <>
                        <p className={`text-[13px] leading-snug text-slate-200 ${showAnswers ? 'line-clamp-2' : 'line-clamp-3'}`}>{clue!.clue}</p>
                        {showAnswers && (
                          <p className="mt-auto line-clamp-2 border-t border-white/10 pt-1.5 text-xs font-medium leading-snug text-emerald-300">
                            {clue!.response || <span className="font-normal italic text-slate-500">No answer yet</span>}
                          </p>
                        )}
                      </>
                    ) : (
                      <span className="m-auto flex items-center gap-1 text-sm text-purple-300/70">
                        <Plus className="h-4 w-4" /> Add clue
                      </span>
                    )}
                  </button>
                );
              })
            )}
          </div>
        </div>
      </main>

      {/* Edit clue drawer — slides in from the right, grid visible behind scrim.
          Holds the full smart-AI workflow (provenance, regen-from-pool,
          per-category regen through the pipeline). */}
      {editingCell && currentClue && (
        <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="Edit clue">
          {/* Scrim — click to close */}
          <div
            className="absolute inset-0 bg-black/50 transition-opacity"
            onClick={() => setEditingCell(null)}
          />
          {/* Drawer */}
          <div className="absolute right-0 top-0 h-full w-full max-w-md bg-slate-900 border-l-2 border-purple-500/50 shadow-2xl shadow-purple-500/20 overflow-y-auto">
            <div className="p-6 space-y-5">
              {/* Header */}
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-purple-400">Edit clue</h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    in <span className="text-slate-300 font-medium">{currentClue.category.title}</span>
                    {' · '}
                    <span className="text-yellow-500 text-base" style={{ fontFamily: 'var(--font-board)' }}>${currentClue.clue?.value || (editingCell.clueIndex + 1) * 200}</span>
                  </p>
                </div>
                <button
                  onClick={() => setEditingCell(null)}
                  className="text-slate-400 hover:text-white transition-colors p-1"
                  title="Close"
                  aria-label="Close clue editor"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Provenance badge area — shows the clue's origin/quality.
                  Empty for older saved games without provenance data. */}
              {(() => {
                const prov = (currentClue.clue as any)?.provenance;
                const srcType = (currentClue.category as any)?.sourceType;
                return (
                  <div className="flex flex-wrap gap-2">
                    <VerificationBadge clue={currentClue.clue} category={currentClue.category.title} />
                    {prov === 'fallback' && (
                      <Badge variant="outline" className="text-amber-400/80 border-amber-500/40 bg-amber-500/10 text-[11px]" title="Filled from fallback — click regenerate for a better clue">
                        <AlertCircle className="w-3 h-3 mr-0.5" /> Patched
                      </Badge>
                    )}
                    {prov === 'answer_first' && (
                      <Badge variant="outline" className="text-emerald-400/80 border-emerald-500/40 bg-emerald-500/10 text-[11px]" title="Curated through the answer-first pipeline (judged)">
                        <Check className="w-3 h-3 mr-0.5" /> Curated
                      </Badge>
                    )}
                    {srcType === 'retrieved' && (
                      <Badge variant="outline" className="text-emerald-400/80 border-emerald-500/40 bg-emerald-500/10 text-[11px]">
                        <BookOpen className="w-3 h-3 mr-0.5" /> Wikipedia
                      </Badge>
                    )}
                    {srcType === 'ai_synthesized' && (
                      <Badge variant="outline" className="text-amber-300/80 border-amber-500/40 bg-amber-500/10 text-[11px]" title="No Wikipedia match — AI fact-sheet source">
                        <Sparkles className="w-3 h-3 mr-0.5" /> AI fact-sheet
                      </Badge>
                    )}
                  </div>
                );
              })()}

              <div>
                <label className="text-sm font-medium text-slate-300 mb-1 block">Value</label>
                <Input
                  type="number"
                  value={currentClue.clue?.value || (editingCell.clueIndex + 1) * 200}
                  onChange={(e) => updateClue(currentClue.categoryId, editingCell.clueIndex, { value: parseInt(e.target.value) || 0 })}
                  className="bg-slate-800 border-slate-700"
                />
              </div>

              <div>
                <label className="text-sm font-medium text-slate-300 mb-1 block">Clue</label>
                <Textarea
                  value={currentClue.clue?.clue || ''}
                  onChange={(e) => updateClue(currentClue.categoryId, editingCell.clueIndex, { clue: e.target.value })}
                  className="bg-slate-800 border-slate-700 min-h-[100px]"
                  placeholder="Enter the clue..."
                />
              </div>

              <div>
                <label className="text-sm font-medium text-slate-300 mb-1 block">Answer</label>
                <Textarea
                  value={currentClue.clue?.response || ''}
                  onChange={(e) => updateClue(currentClue.categoryId, editingCell.clueIndex, { response: e.target.value })}
                  className="bg-slate-800 border-slate-700 min-h-[80px]"
                  placeholder="Enter the answer..."
                />
              </div>

              {/* Smart AI actions. Regenerate pulls from the pool first
                  (filled by per-category regen), falling back to a fresh
                  editor-generate-clue call when the pool is empty. The other
                  actions are the existing single-clue helpers. */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-300 block">AI actions</label>
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    variant="outline"
                    className="border-purple-500/50 text-purple-500 hover:bg-purple-500/10"
                    disabled={!aiAvailable || aiLoading || regeneratingClue || regeneratingCategory !== null}
                    onClick={handleRegenerateClueEditor}
                    title="Swap in a judged alternative (instant) or generate a fresh clue"
                  >
                    {(regeneratingClue) ? <><RefreshCw className="w-4 h-4 mr-2 animate-spin" /> Working…</>
                      : <><Sparkles className="w-4 h-4 mr-2" /> Regenerate</>}
                  </Button>
                  <Button
                    variant="outline"
                    className="border-blue-500/50 text-blue-400 hover:bg-blue-500/10"
                    disabled={!aiAvailable || aiLoading || !currentClue.clue?.clue}
                    onClick={handleAIRewriteClue}
                    title="Rephrase the existing clue, same answer"
                  >
                    <RefreshCw className="w-4 h-4 mr-2" /> Rephrase
                  </Button>
                  <Button
                    variant="outline"
                    className="border-purple-500/50 text-purple-500 hover:bg-purple-500/10"
                    disabled={!aiAvailable || aiLoading || regeneratingCategory !== null}
                    onClick={() => handleRegenerateCategoryEditor(currentClue.categoryId)}
                    title="Re-run the answer-first pipeline for this whole category"
                  >
                    {(regeneratingCategory) ? <><RefreshCw className="w-4 h-4 mr-2 animate-spin" /> Working…</>
                      : <><RefreshCw className="w-4 h-4 mr-2" /> Regen category</>}
                  </Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="outline"
                        className="border-slate-600 text-slate-300 hover:bg-slate-700/50"
                        disabled={!aiAvailable || aiLoading}
                      >
                        <Wand2 className="w-4 h-4 mr-2" /> More
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="w-56">
                      <DropdownMenuItem onClick={handleAIGenerateClue}>
                        <Sparkles className="w-4 h-4 mr-2" />
                        Generate Q & A from scratch
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={handleAIGenerateAnswer} disabled={!currentClue.clue?.clue}>
                        <Sparkles className="w-4 h-4 mr-2" />
                        Generate Answer only
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={handleAIValidateClue} disabled={!currentClue.clue?.clue || !currentClue.clue?.response}>
                        <Wand2 className="w-4 h-4 mr-2" />
                        Validate Clue
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <Button
                  onClick={() => setEditingCell(null)}
                  variant="outline"
                  className="flex-1"
                >
                  Done
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Unsaved-changes confirmation — only reachable when there are edits. */}
      <AlertDialog open={pendingLeave !== null} onOpenChange={(open) => { if (!open) setPendingLeave(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard unsaved changes?</AlertDialogTitle>
            <AlertDialogDescription>
              Your edits to this game haven't been saved. Leaving now will lose them.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep editing</AlertDialogCancel>
            <AlertDialogAction onClick={confirmLeave} className="bg-red-600 hover:bg-red-500">
              Discard changes
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
