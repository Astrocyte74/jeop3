/**
 * AI Preview Dialog Component
 *
 * Shows preview of AI-generated content before applying.
 * Ported from jeop2 with React + shadcn/ui.
 */

import { useState, useCallback, useEffect } from 'react';
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
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Wand2, Sparkles } from 'lucide-react';
import type { AIPromptType } from '@/lib/ai/types';

// ============================================
// TYPES
// ============================================

export interface PreviewData {
  titles?: Array<{ title: string; subtitle: string }>;
  categories?: Array<{
    title: string;
    contentTopic?: string;
    clues: Array<{ value: number; clue: string; response: string }>;
  }>;
  category?: {
    title: string;
    contentTopic?: string;
    clues: Array<{ value: number; clue: string; response: string }>;
  };
  clues?: Array<{ value: number; clue: string; response: string }>;
}

export interface AIPreviewDialogProps {
  open: boolean;
  type: AIPromptType;
  data: PreviewData;
  onConfirm: (selected: number | Set<string>) => void;
  onCancel: () => void;
  onRegenerateAll?: () => void;
  onRegenerateSelected?: (checkedItems: Set<string>) => void;
}

// ============================================
// SUB-COMPONENTS
// ============================================

function TitlesPreview({
  titles,
  onSelect,
  selected
}: {
  titles: Array<{ title: string; subtitle: string }>;
  onSelect: (index: number) => void;
  selected: number | null;
}) {
  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-400">Choose a title for your game:</p>
      {titles.map((option, i) => (
        <button
          key={i}
          onClick={() => onSelect(i)}
          className={`
            w-full text-left p-4 rounded-lg border transition-all
            ${selected === i
              ? 'bg-yellow-500/20 border-yellow-500/50'
              : 'bg-slate-800/50 border-slate-700 hover:border-slate-600'
            }
          `}
        >
          <div className="font-semibold text-base text-slate-200">
            {option.title}
          </div>
          <div className="text-sm text-slate-400 mt-1">
            {option.subtitle}
          </div>
        </button>
      ))}
    </div>
  );
}

function CategoryPreview({
  category,
  showRegeneratedBadge = false
}: {
  category: { title: string; contentTopic?: string; clues: Array<{ value: number; clue: string; response: string }> };
  showRegeneratedBadge?: boolean;
}) {
  return (
    <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-4">
      <div className="flex items-center gap-2 mb-3">
        <h4 className="font-semibold text-slate-200">{category.title}</h4>
        {category.contentTopic && category.contentTopic !== category.title && (
          <Badge variant="outline" className="text-xs">
            📝 {category.contentTopic}
          </Badge>
        )}
        {showRegeneratedBadge && (
          <Badge className="bg-purple-500 text-xs">
            ✨ Regenerated
          </Badge>
        )}
      </div>
      <ul className="space-y-2">
        {category.clues.map((clue, j) => (
          <li key={j} className="flex items-start gap-3 text-sm">
            <span className="text-yellow-500 font-bold min-w-[50px]">
              ${clue.value}
            </span>
            <span className="text-slate-300 flex-1">{clue.clue}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function CategoriesPreview({
  categories,
  checkedItems,
  regeneratedItems,
  onToggleCategory,
  onToggleClue
}: {
  categories: Array<{
    title: string;
    contentTopic?: string;
    clues: Array<{ value: number; clue: string; response: string }>;
  }>;
  checkedItems: Set<string>;
  regeneratedItems: Set<string>;
  onToggleCategory: (catIndex: number) => void;
  onToggleClue: (catIndex: number, clueIndex: number) => void;
}) {
  const [counts, setCounts] = useState({ categories: 0, clues: 0 });

  useEffect(() => {
    let catCount = 0;
    let clueCount = 0;

    categories.forEach((cat, i) => {
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

    setCounts({ categories: catCount, clues: clueCount });
  }, [checkedItems, categories]);

  const getSummary = () => {
    if (counts.categories === 0 && counts.clues === 0) {
      return 'Check items above to regenerate them';
    }
    if (counts.categories > 0 && counts.clues === 0) {
      return `Regenerate ${counts.categories} categor${counts.categories === 1 ? 'y' : 'ies'}`;
    }
    if (counts.categories === 0 && counts.clues > 0) {
      return `Regenerate ${counts.clues} question${counts.clues === 1 ? '' : 's'}`;
    }
    return `Regenerate ${counts.categories} categor${counts.categories === 1 ? 'y' : 'ies'} and ${counts.clues} question${counts.clues === 1 ? '' : 's'}`;
  };

  return (
    <div className="space-y-4">
      {/* Instructions */}
      <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-4 text-sm">
        <p className="font-medium text-slate-300 mb-2">Review the generated content:</p>
        <ul className="space-y-1 text-slate-400 text-xs">
          <li>• All items will be applied when you click "Done"</li>
          <li>• Check categories/questions to regenerate with AI</li>
          <li>• Click "Regenerate Selected" to regenerate checked items</li>
        </ul>
      </div>

      {/* Categories with checkboxes */}
      {categories.map((cat, i) => {
        const catId = `cat-${i}`;
        const isCatChecked = checkedItems.has(catId);
        const isCatRegenerated = regeneratedItems.has(catId);

        return (
          <div key={i} className={`bg-slate-800/50 border rounded-lg p-4 ${isCatRegenerated ? 'border-purple-500/50' : 'border-slate-700'}`}>
            {/* Category header with checkbox */}
            <div className="flex items-center gap-3 mb-3">
              <Checkbox
                id={catId}
                checked={isCatChecked}
                onCheckedChange={() => onToggleCategory(i)}
              />
              <label htmlFor={catId} className="flex items-center gap-2 flex-1 cursor-pointer">
                <span className="font-semibold text-slate-200">{i + 1}. {cat.title}</span>
                {cat.contentTopic && cat.contentTopic !== cat.title && (
                  <Badge variant="outline" className="text-xs">
                    📝 {cat.contentTopic}
                  </Badge>
                )}
                {isCatRegenerated && (
                  <Badge className="bg-purple-500 text-xs">Regenerated</Badge>
                )}
              </label>
            </div>

            {/* Clues */}
            <ul className="space-y-2 ml-6">
              {cat.clues.map((clue, j) => {
                const clueId = `cat-${i}-clue-${j}`;
                const isClueChecked = checkedItems.has(clueId);
                const isClueRegenerated = regeneratedItems.has(clueId);

                return (
                  <li key={j} className={`flex items-start gap-3 text-sm ${isClueRegenerated ? 'bg-purple-500/10 -mx-2 px-2 py-1 rounded' : ''}`}>
                    <Checkbox
                      id={clueId}
                      checked={isClueChecked}
                      onCheckedChange={() => onToggleClue(i, j)}
                      className="mt-0.5"
                    />
                    <label htmlFor={clueId} className="flex items-center gap-3 flex-1 cursor-pointer">
                      <span className="text-yellow-500 font-bold min-w-[50px]">
                        ${clue.value}
                      </span>
                      <span className="text-slate-300 flex-1">{clue.clue}</span>
                      {isClueRegenerated && (
                        <Badge className="bg-purple-500 text-xs">✨ New</Badge>
                      )}
                    </label>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}

      {/* Summary and Regenerate button */}
      <div className="flex items-center justify-between bg-slate-800/50 border border-slate-700 rounded-lg p-3">
        <span className="text-sm text-slate-400">{getSummary()}</span>
        <Button
          size="sm"
          variant="outline"
          disabled={counts.categories === 0 && counts.clues === 0}
          onClick={() => {
            // This will be handled by parent
          }}
        >
          Regenerate Selected
        </Button>
      </div>
    </div>
  );
}

// ============================================
// MAIN DIALOG
// ============================================

export function AIPreviewDialog({
  open,
  type,
  data,
  onConfirm,
  onCancel,
  onRegenerateAll,
  onRegenerateSelected
}: AIPreviewDialogProps) {
  const [selectedTitle, setSelectedTitle] = useState<number | null>(null);
  const [checkedItems, setCheckedItems] = useState<Set<string>>(new Set());
  const [regeneratedItems, setRegeneratedItems] = useState<Set<string>>(new Set());

  // Reset state when dialog opens
  useEffect(() => {
    if (open) {
      setSelectedTitle(null);
      setCheckedItems(new Set());
      setRegeneratedItems(new Set());
    }
  }, [open, type]);

  const handleToggleCategory = useCallback((catIndex: number) => {
    const catId = `cat-${catIndex}`;
    setCheckedItems(prev => {
      const next = new Set(prev);
      if (next.has(catId)) {
        // Remove category and all its clues
        next.delete(catId);
        data.categories?.[catIndex].clues.forEach((_, j) => {
          next.delete(`cat-${catIndex}-clue-${j}`);
        });
      } else {
        // Add category and all its clues
        next.add(catId);
        data.categories?.[catIndex].clues.forEach((_, j) => {
          next.add(`cat-${catIndex}-clue-${j}`);
        });
      }
      return next;
    });
  }, [data.categories]);

  const handleToggleClue = useCallback((catIndex: number, clueIndex: number) => {
    const clueId = `cat-${catIndex}-clue-${clueIndex}`;
    setCheckedItems(prev => {
      const next = new Set(prev);
      if (next.has(clueId)) {
        next.delete(clueId);
      } else {
        next.add(clueId);
      }
      return next;
    });
  }, []);

  const handleConfirm = () => {
    if (type === 'game-title') {
      onConfirm(selectedTitle ?? 0);
    } else {
      onConfirm(checkedItems);
    }
  };

  const handleRegenerateSelected = () => {
    onRegenerateSelected?.(checkedItems);
  };

  const getTypeLabel = () => {
    const labels: Record<AIPromptType, string> = {
      'game-title': 'Generate Title & Subtitle',
      'categories-generate': 'Generate All Categories',
      'category-rename': 'Rename Category',
      'category-generate-clues': 'Generate Missing Clues',
      'category-replace-all': 'Replace All Clues',
      'questions-generate-five': 'Generate 5 Questions',
      'question-generate-single': 'Generate Question',
      'editor-generate-clue': 'Generate Clue',
      'editor-rewrite-clue': 'Enhance Clue',
      'editor-generate-answer': 'Generate Answer',
      'editor-validate': 'Validate Clue',
      'team-name-random': 'Generate Team Names',
      'team-name-enhance': 'Enhance Team Name'
    };
    return labels[type] || 'AI Generation';
  };

  const renderContent = () => {
    switch (type) {
      case 'game-title':
        return data.titles ? (
          <TitlesPreview
            titles={data.titles}
            onSelect={setSelectedTitle}
            selected={selectedTitle}
          />
        ) : null;

      case 'categories-generate':
        return data.categories ? (
          <CategoriesPreview
            categories={data.categories}
            checkedItems={checkedItems}
            regeneratedItems={regeneratedItems}
            onToggleCategory={handleToggleCategory}
            onToggleClue={handleToggleClue}
          />
        ) : null;

      case 'category-replace-all':
        return data.category ? (
          <CategoryPreview category={data.category} />
        ) : null;

      case 'category-generate-clues':
      case 'questions-generate-five':
        return data.clues ? (
          <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-4">
            <ul className="space-y-2">
              {data.clues.map((clue, i) => (
                <li key={i} className="flex items-start gap-3 text-sm">
                  <span className="text-yellow-500 font-bold min-w-[50px]">
                    ${clue.value}
                  </span>
                  <span className="text-slate-300 flex-1">{clue.clue}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null;

      default:
        return null;
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={(open) => !open && onCancel()}>
      <AlertDialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
        <AlertDialogHeader>
          <div className="flex items-center gap-3">
            <div className="p-2 bg-purple-500/20 rounded-lg">
              <Wand2 className="w-5 h-5 text-purple-400" />
            </div>
            <div>
              <AlertDialogTitle>🪄 AI Preview</AlertDialogTitle>
              <AlertDialogDescription>{getTypeLabel()}</AlertDialogDescription>
            </div>
          </div>
        </AlertDialogHeader>

        <div className="py-4">
          {renderContent()}
        </div>

        <AlertDialogFooter>
          <div className="flex gap-2 w-full">
            <AlertDialogCancel onClick={onCancel}>Cancel</AlertDialogCancel>
            {onRegenerateAll && type !== 'game-title' && (
              <Button
                variant="outline"
                onClick={() => {
                  onRegenerateAll();
                  onCancel();
                }}
              >
                <Sparkles className="w-4 h-4 mr-2" />
                Regenerate All
              </Button>
            )}
            {type === 'categories-generate' && onRegenerateSelected && (
              <Button
                variant="outline"
                onClick={handleRegenerateSelected}
                disabled={checkedItems.size === 0}
              >
                <Sparkles className="w-4 h-4 mr-2" />
                Regenerate Selected
              </Button>
            )}
            <AlertDialogAction
              onClick={handleConfirm}
              disabled={type === 'game-title' && selectedTitle === null}
              className="bg-yellow-500 hover:bg-yellow-400 text-black"
            >
              Done
            </AlertDialogAction>
          </div>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
