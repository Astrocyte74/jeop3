import { useState, useEffect, useCallback } from 'react';
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
import type { Game, Category, Clue } from '@/lib/storage';
import { Save, Home, Plus, MoreVertical, X, Wand2, Sparkles, RefreshCw } from 'lucide-react';
import { useAIGeneration } from '@/lib/ai';
import { AIPreviewDialog } from '@/components/ai';
import type { PreviewData } from '@/components/ai';
import type { AIPromptType } from '@/lib/ai';

interface EditorBoardProps {
  game: Game;
  onSave: (game: Game) => void;
  onExit: () => void;
  onCancel: () => void;
}

export function EditorBoard({ game, onSave, onExit, onCancel }: EditorBoardProps) {
  const [editingGame, setEditingGame] = useState<Game>({ ...game });
  const [editingCell, setEditingCell] = useState<{ categoryId: number; clueIndex: number } | null>(null);
  const [hasChanges, setHasChanges] = useState(false);
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [teams, setTeams] = useState<{ id: string; name: string }[]>([
    { id: '1', name: 'Team 1' },
    { id: '2', name: 'Team 2' },
  ]);

  // AI state
  const { generate, isLoading: aiLoading, isAvailable: aiAvailable } = useAIGeneration();
  const [aiPreview, setAiPreview] = useState<{
    open: boolean;
    type: AIPromptType;
    data: PreviewData;
  }>({ open: false, type: 'editor-generate-clue', data: {} });

  const categories = editingGame.categories || [];
  const rowCount = editingGame.rows || categories[0]?.clues?.length || 5;

  // Calculate grid columns for teams
  const teamCount = teams.length;
  const teamGridCols = teamCount <= 2 ? 1 : teamCount <= 4 ? 2 : 3;

  // Check if game has changed from original
  useEffect(() => {
    const changed = JSON.stringify(editingGame) !== JSON.stringify(game);
    setHasChanges(changed);
  }, [editingGame, game]);

  const updateCategoryTitle = (index: number, title: string) => {
    const newCategories = [...categories];
    newCategories[index] = { ...newCategories[index], title };
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

  const handleCancel = () => {
    if (hasChanges) {
      setShowCancelDialog(true);
    } else {
      onCancel();
    }
  };

  const confirmCancel = () => {
    setShowCancelDialog(false);
    onCancel();
  };

  const updateGameTitle = (title: string) => {
    setEditingGame({ ...editingGame, title });
  };

  const updateGameSubtitle = (subtitle: string) => {
    setEditingGame({ ...editingGame, subtitle });
  };

  const handleAddTeam = () => {
    const newId = String(teams.length + 1);
    setTeams([...teams, { id: newId, name: `Team ${teams.length + 1}` }]);
  };

  const handleUpdateTeamName = (id: string, name: string) => {
    setTeams(teams.map((t) => (t.id === id ? { ...t, name } : t)));
  };

  const handleRemoveTeam = (id: string) => {
    if (teams.length <= 1) return;
    setTeams(teams.filter((t) => t.id !== id));
  };

  // ==================== AI HANDLERS ====================

  const handleAIGenerateClue = useCallback(async () => {
    if (!editingCell) return;
    const { categoryId, clueIndex } = editingCell;
    const category = categories[categoryId];
    const clue = category?.clues[clueIndex];

    const result = await generate('editor-generate-clue', {
      categoryTitle: category.title,
      contentTopic: (category as any).contentTopic || category.title,
      value: clue?.value || (clueIndex + 1) * 200,
      existingClues: category.clues,
    });

    if (result && typeof result === 'object' && 'clue' in result && 'response' in result) {
      updateClue(categoryId, clueIndex, {
        clue: result.clue as string,
        response: result.response as string,
      });
    }
  }, [editingCell, categories, generate]);

  const handleAIRewriteClue = useCallback(async () => {
    if (!editingCell) return;
    const { categoryId, clueIndex } = editingCell;
    const category = categories[categoryId];
    const clue = category?.clues[clueIndex];
    if (!clue?.clue) return;

    const result = await generate('editor-rewrite-clue', {
      currentClue: clue.clue,
      categoryTitle: category.title,
      value: clue.value,
    });

    if (result && typeof result === 'object' && 'clue' in result) {
      updateClue(categoryId, clueIndex, { clue: result.clue as string });
    }
  }, [editingCell, categories, generate]);

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

  // Get the current clue being edited
  const getCurrentEditingClue = () => {
    if (!editingCell) return null;
    const { categoryId, clueIndex } = editingCell;
    const category = categories[categoryId];
    const clue = category?.clues[clueIndex];
    return { category, clue, categoryId, clueIndex };
  };

  const currentClue = getCurrentEditingClue();

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
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem onClick={addCategory}>
              <Plus className="w-4 h-4 mr-2" />
              Add Column
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleSave}>
              <Save className="w-4 h-4 mr-2" />
              Save
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleCancel}>
              <X className="w-4 h-4 mr-2" />
              Cancel
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onExit} className="text-red-400">
              <Home className="w-4 h-4 mr-2" />
              Main Menu
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Editor hint banner */}
      <div className="max-w-7xl mx-auto mb-4">
        <div className="bg-purple-500/10 border border-purple-500/30 rounded-lg p-3 flex items-center gap-3">
          <Wand2 className="w-5 h-5 text-purple-400" />
          <p className="text-sm text-purple-200">
            <strong>Editor Mode:</strong> Click any card to edit. Click category headers to rename them. Use the menu to add columns or save.
          </p>
        </div>
      </div>

      {/* Header with teams and title */}
      <div className="max-w-7xl mx-auto mb-8">
        <div className="flex items-center gap-8">
          {/* Teams - top left, grid layout with edit controls */}
          <div
            className="grid gap-2"
            style={{
              gridTemplateColumns: `repeat(${teamGridCols}, 1fr)`,
              gridTemplateRows: `repeat(${Math.ceil(teamCount / teamGridCols)}, auto)`,
            }}
          >
            {teams.map((team) => (
              <div key={team.id} className="relative group">
                <Input
                  value={team.name}
                  onChange={(e) => handleUpdateTeamName(team.id, e.target.value)}
                  className="px-3 py-2 bg-slate-800/50 border-2 border-slate-700 rounded-lg text-left min-w-[120px] font-medium text-sm text-slate-200"
                />
                {teams.length > 1 && (
                  <button
                    onClick={() => handleRemoveTeam(team.id)}
                    className="absolute -top-2 -right-2 w-5 h-5 bg-red-500 hover:bg-red-400 rounded-full text-white text-xs opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                  >
                    ×
                  </button>
                )}
              </div>
            ))}
            {teams.length < 6 && (
              <button
                onClick={handleAddTeam}
                className="px-3 py-2 border-2 border-dashed border-slate-700 rounded-lg text-left min-w-[120px] text-sm text-slate-500 hover:text-slate-300 hover:border-slate-600 transition-colors"
              >
                + Add Team
              </button>
            )}
          </div>

          {/* Title - center, editable */}
          <div className="flex-1 text-center pr-16">
            <Input
              value={editingGame.title}
              onChange={(e) => updateGameTitle(e.target.value)}
              className="text-3xl md:text-4xl font-black text-center bg-transparent border-none text-yellow-500 p-0 mb-2 focus-visible:ring-0 focus-visible:ring-offset-0"
              style={{ textShadow: '0 4px 12px rgba(0,0,0,0.5)' }}
            />
            <Input
              value={editingGame.subtitle || ''}
              onChange={(e) => updateGameSubtitle(e.target.value)}
              placeholder="Add a subtitle..."
              className="text-sm md:text-base text-center bg-transparent border-none text-slate-300 font-medium p-0 focus-visible:ring-0 focus-visible:ring-offset-0"
            />
          </div>
        </div>
      </div>

      {/* Game board - same style as play mode */}
      <div className="max-w-7xl mx-auto">
        <div className="board-wrap">
          <div
            className="game-board"
            style={{
              gridTemplateColumns: `repeat(${categories.length}, 1fr)`,
            }}
          >
            {/* Category headers - editable on click */}
            {categories.map((category, index) => (
              <div key={index} className="cell cell-header">
                <Input
                  value={category.title}
                  onChange={(e) => updateCategoryTitle(index, e.target.value)}
                  className="bg-transparent border-none text-center font-bold text-sm w-full"
                  onClick={(e) => (e.target as HTMLInputElement).select()}
                />
              </div>
            ))}

            {/* Clue cells - clickable for editing */}
            {Array.from({ length: rowCount }).map((_, rowIndex) =>
              categories.map((category, categoryIndex) => {
                const clue = category.clues?.[rowIndex];

                return (
                  <div key={`${categoryIndex}-${rowIndex}`} className="cell cursor-pointer hover:bg-slate-700/30 transition-colors" onClick={() => setEditingCell({ categoryId: categoryIndex, clueIndex: rowIndex })}>
                    <div className="w-full h-full flex items-center justify-center">
                      {clue?.clue ? (
                        <div className="text-xs text-center p-2 line-clamp-3 opacity-50">
                          {clue.clue || '(empty)'}
                        </div>
                      ) : (
                        <span className="text-purple-500/50 text-sm">Click to add</span>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* Edit clue modal */}
      {editingCell && currentClue && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="relative w-full max-w-lg bg-slate-900 border-2 border-purple-500 rounded-xl shadow-2xl shadow-purple-500/20 p-6"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-purple-400">Edit Clue</h3>
              <button
                onClick={() => setEditingCell(null)}
                className="text-slate-400 hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              {/* Category and value info */}
              <div className="flex items-center gap-3 text-sm text-slate-400">
                <span className="bg-slate-800 px-3 py-1 rounded">{currentClue.category.title}</span>
                <span className="bg-yellow-500/20 text-yellow-500 px-3 py-1 rounded font-bold">${currentClue.clue?.value || (editingCell.clueIndex + 1) * 200}</span>
              </div>

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
                <label className="text-sm font-medium text-slate-300 mb-1 block">Clue (Question)</label>
                <Textarea
                  value={currentClue.clue?.clue || ''}
                  onChange={(e) => updateClue(currentClue.categoryId, editingCell.clueIndex, { clue: e.target.value })}
                  className="bg-slate-800 border-slate-700 min-h-[100px]"
                  placeholder="Enter the clue..."
                />
              </div>

              <div>
                <label className="text-sm font-medium text-slate-300 mb-1 block">Response (Answer)</label>
                <Textarea
                  value={currentClue.clue?.response || ''}
                  onChange={(e) => updateClue(currentClue.categoryId, editingCell.clueIndex, { response: e.target.value })}
                  className="bg-slate-800 border-slate-700 min-h-[80px]"
                  placeholder="Enter the answer..."
                />
              </div>

              <div className="flex gap-2">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="outline"
                      className="flex-1 border-purple-500/50 text-purple-500"
                      disabled={!aiAvailable || aiLoading}
                    >
                      <Wand2 className="w-4 h-4 mr-2" />
                      {aiLoading ? 'AI Working...' : 'AI Enhance'}
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56">
                    <DropdownMenuItem onClick={handleAIGenerateClue}>
                      <Sparkles className="w-4 h-4 mr-2" />
                      Generate Question & Answer
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={handleAIRewriteClue} disabled={!currentClue.clue?.clue}>
                      <RefreshCw className="w-4 h-4 mr-2" />
                      Rewrite Question
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={handleAIGenerateAnswer} disabled={!currentClue.clue?.clue}>
                      <Sparkles className="w-4 h-4 mr-2" />
                      Generate Answer
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

            <div className="flex gap-2 mt-6">
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
      )}

      {/* Cancel confirmation dialog */}
      <AlertDialog open={showCancelDialog} onOpenChange={setShowCancelDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard Changes?</AlertDialogTitle>
            <AlertDialogDescription>
              You have unsaved changes. Are you sure you want to exit without saving?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep Editing</AlertDialogCancel>
            <AlertDialogAction onClick={confirmCancel} className="bg-red-600 hover:bg-red-500">
              Discard & Exit
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* AI Preview Dialog */}
      <AIPreviewDialog
        open={aiPreview.open}
        type={aiPreview.type}
        data={aiPreview.data}
        onConfirm={() => {
          // Apply the AI-generated content
          setAiPreview({ open: false, type: 'editor-generate-clue', data: {} });
        }}
        onCancel={() => setAiPreview({ open: false, type: 'editor-generate-clue', data: {} })}
        onRegenerateAll={() => {
          // Regenerate with the same context
        }}
      />
    </div>
  );
}
