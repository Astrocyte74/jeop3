import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
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
import type { Game, Category, Clue } from '@/lib/storage';
import { Save, Home, Plus, Trash2, Sparkles, Wand2, X } from 'lucide-react';

interface EditorBoardProps {
  game: Game;
  onSave: (game: Game) => void;
  onExit: () => void;
  onCancel: () => void;
}

export function EditorBoard({ game, onSave, onExit, onCancel }: EditorBoardProps) {
  const [editingGame, setEditingGame] = useState<Game>({ ...game });
  const [editingCell, setEditingCell] = useState<{ categoryId: number; clueIndex: number } | null>(null);
  const [editingCategory, setEditingCategory] = useState<number | null>(null);
  const [hasChanges, setHasChanges] = useState(false);
  const [showCancelDialog, setShowCancelDialog] = useState(false);

  const categories = editingGame.categories || [];
  const rowCount = editingGame.rows || categories[0]?.clues?.length || 5;

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

  const removeCategory = (index: number) => {
    if (categories.length <= 1) return;
    const newCategories = categories.filter((_, i) => i !== index);
    setEditingGame({ ...editingGame, categories: newCategories });
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

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-4">
      {/* Top bar */}
      <div className="max-w-7xl mx-auto mb-4">
        <div className="flex items-center justify-between gap-4">
          <div className="flex-1">
            <Input
              value={editingGame.title}
              onChange={(e) => setEditingGame({ ...editingGame, title: e.target.value })}
              className="text-2xl font-bold bg-slate-800/50 border-slate-700 text-yellow-500"
            />
            <Input
              value={editingGame.subtitle || ''}
              onChange={(e) => setEditingGame({ ...editingGame, subtitle: e.target.value })}
              className="mt-2 bg-slate-800/50 border-slate-700 text-slate-400"
              placeholder="Add a subtitle..."
            />
          </div>

          <div className="flex gap-2">
            <Button
              onClick={addCategory}
              variant="outline"
              size="sm"
              className="border-green-500/50 text-green-500"
            >
              <Plus className="w-4 h-4 mr-2" />
              Add Column
            </Button>
            <Button
              onClick={handleSave}
              size="sm"
              className="bg-green-600 hover:bg-green-500"
            >
              <Save className="w-4 h-4 mr-2" />
              Save
            </Button>
            <Button
              onClick={handleCancel}
              variant="outline"
              size="sm"
              className="border-slate-600 hover:bg-slate-800"
            >
              <X className="w-4 h-4 mr-2" />
              Cancel
            </Button>
          </div>
        </div>
      </div>

      {/* Editor hint */}
      <div className="max-w-7xl mx-auto mb-4">
        <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-3 flex items-center gap-3">
          <Sparkles className="w-5 h-5 text-yellow-500" />
          <p className="text-sm text-yellow-200">
            <strong>Editor Mode:</strong> Click any card to edit its clue and answer. Click category headers to rename them.
          </p>
        </div>
      </div>

      {/* Game board editor */}
      <div className="max-w-7xl mx-auto">
        <div
          className="grid gap-2"
          style={{
            gridTemplateColumns: `repeat(${categories.length}, 1fr)`,
          }}
        >
          {/* Category headers */}
          {categories.map((category, categoryIndex) => (
            <div
              key={categoryIndex}
              className="relative bg-slate-800 border-2 border-slate-700 rounded-lg p-2 group"
            >
              <Input
                value={category.title}
                onChange={(e) => updateCategoryTitle(categoryIndex, e.target.value)}
                className="bg-transparent border-none text-sm font-bold text-yellow-500 text-center"
              />
              {categories.length > 1 && (
                <Button
                  onClick={() => removeCategory(categoryIndex)}
                  variant="ghost"
                  size="sm"
                  className="absolute -top-2 -right-2 w-6 h-6 p-0 bg-red-600 hover:bg-red-500 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <Trash2 className="w-3 h-3" />
                </Button>
              )}
            </div>
          ))}

          {/* Clue cells */}
          {Array.from({ length: rowCount }).map((_, rowIndex) =>
            categories.map((category, categoryIndex) => {
              const clue = category.clues?.[rowIndex];

              return (
                <button
                  key={`${categoryIndex}-${rowIndex}`}
                  onClick={() => setEditingCell({ categoryId: categoryIndex, clueIndex: rowIndex })}
                  className="aspect-square bg-slate-800 border-2 border-purple-500 rounded-lg p-2 hover:bg-slate-700 transition-all text-left overflow-hidden"
                >
                  <div className="text-xs text-purple-400 font-bold mb-1">${clue?.value || (rowIndex + 1) * 200}</div>
                  <div className="text-xs text-slate-300 line-clamp-3">{clue?.clue || 'Click to add clue...'}</div>
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* Edit clue modal */}
      {editingCell && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            onClick={() => setEditingCell(null)}
          />
          <div className="relative w-full max-w-lg bg-slate-900 border-2 border-purple-500 rounded-xl shadow-2xl p-6">
            <h3 className="text-lg font-semibold text-purple-400 mb-4">Edit Clue</h3>

            <div className="space-y-4">
              <div>
                <Label htmlFor="clue-value" className="text-slate-300">Value</Label>
                <Input
                  id="clue-value"
                  type="number"
                  value={categories[editingCell.categoryId]?.clues?.[editingCell.clueIndex]?.value || ''}
                  onChange={(e) => updateClue(
                    editingCell.categoryId,
                    editingCell.clueIndex,
                    { value: parseInt(e.target.value) || 0 }
                  )}
                  className="bg-slate-800 border-slate-700"
                />
              </div>

              <div>
                <Label htmlFor="clue-text" className="text-slate-300">Clue (Question)</Label>
                <Textarea
                  id="clue-text"
                  value={categories[editingCell.categoryId]?.clues?.[editingCell.clueIndex]?.clue || ''}
                  onChange={(e) => updateClue(
                    editingCell.categoryId,
                    editingCell.clueIndex,
                    { clue: e.target.value }
                  )}
                  className="bg-slate-800 border-slate-700 min-h-[100px]"
                  placeholder="Enter the clue..."
                />
              </div>

              <div>
                <Label htmlFor="clue-response" className="text-slate-300">Response (Answer)</Label>
                <Textarea
                  id="clue-response"
                  value={categories[editingCell.categoryId]?.clues?.[editingCell.clueIndex]?.response || ''}
                  onChange={(e) => updateClue(
                    editingCell.categoryId,
                    editingCell.clueIndex,
                    { response: e.target.value }
                  )}
                  className="bg-slate-800 border-slate-700 min-h-[80px]"
                  placeholder="Enter the answer..."
                />
              </div>

              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="flex-1 border-purple-500/50 text-purple-500"
                >
                  <Wand2 className="w-4 h-4 mr-2" />
                  AI Enhance
                </Button>
              </div>
            </div>

            <div className="flex gap-2 mt-6">
              <Button
                onClick={() => setEditingCell(null)}
                variant="outline"
                className="flex-1"
              >
                Cancel
              </Button>
              <Button
                onClick={() => setEditingCell(null)}
                className="flex-1 bg-purple-600 hover:bg-purple-500"
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
    </div>
  );
}
