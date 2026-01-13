/**
 * AI Preview Dialog Component
 *
 * Shows preview of AI-generated content before applying.
 * Ported from jeop2 with React + shadcn/ui.
 */

import { useState, useCallback, useEffect, useRef } from 'react';
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
import { Wand2, Sparkles, RefreshCw } from 'lucide-react';
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
  suggestedTeamNames?: string[];
}

export interface AIPreviewDialogProps {
  open: boolean;
  type: AIPromptType;
  data: PreviewData;
  onConfirm: (selected: { title?: number; items: Set<string> }) => void;
  onCancel: () => void;
  onRegenerateAll?: () => void;
  onRegenerateSelected?: (checkedItems: Set<string>) => void;
  onRewriteCategoryTitle?: (catIndex: number) => Promise<string | null>;
  onRewriteClue?: (catIndex: number, clueIndex: number) => Promise<string | null>;
  onRegenerateTitle?: (titleIndex: number) => Promise<{ title: string; subtitle: string } | null>;
  onRegenerateAllTitles?: () => Promise<void>;
  onRegenerateTeamName?: (teamIndex: number) => Promise<string | null>;
  onRegenerateAllTeamNames?: () => Promise<void>;
  isLoading?: boolean;
  dataVersion?: number;
  regeneratedItems?: Set<string>;
  regeneratingCounts?: { categories: number; clues: number };
  rewritingCategory?: number | null;
  rewritingClue?: { catIndex: number; clueIndex: number } | null;
  rewritingTitle?: number | null;
  rewritingTeamName?: number | null;
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
  onToggleClue,
  titles,
  selectedTitle,
  onSelectTitle,
  onRewriteCategoryTitle,
  onRewriteClue,
  rewritingCategory,
  rewritingClue,
  onRegenerateTitle,
  onRegenerateAllTitles,
  rewritingTitle,
  suggestedTeamNames,
  onRegenerateTeamName,
  onRegenerateAllTeamNames,
  rewritingTeamName
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
  titles?: Array<{ title: string; subtitle: string }>;
  selectedTitle?: number | null;
  onSelectTitle?: (index: number) => void;
  onRewriteCategoryTitle?: (catIndex: number) => void;
  onRewriteClue?: (catIndex: number, clueIndex: number) => void;
  rewritingCategory?: number | null;
  rewritingClue?: { catIndex: number; clueIndex: number } | null;
  onRegenerateTitle?: (titleIndex: number) => void;
  onRegenerateAllTitles?: () => void;
  rewritingTitle?: number | null;
  suggestedTeamNames?: string[];
  onRegenerateTeamName?: (teamIndex: number) => void;
  onRegenerateAllTeamNames?: () => void;
  rewritingTeamName?: number | null;
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
      {/* Title Selection */}
      {titles && titles.length > 0 && (
        <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-4 mb-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-medium text-slate-300">Choose a title for your game:</p>
            {onRegenerateAllTitles && (
              <Button
                variant="outline"
                size="sm"
                onClick={onRegenerateAllTitles}
                disabled={rewritingTitle !== null}
                className="h-7 px-2 text-xs text-purple-400 hover:text-purple-300 hover:bg-purple-500/10"
              >
                <Sparkles className="w-3 h-3 mr-1" />
                Regenerate All
              </Button>
            )}
          </div>
          <div className="grid grid-cols-3 gap-3">
            {titles.map((option, i) => (
              <button
                key={i}
                onClick={() => onSelectTitle?.(i)}
                className={`
                  relative p-3 pr-10 rounded-lg border transition-all text-left
                  ${selectedTitle === i
                    ? 'bg-yellow-500/20 border-yellow-500/50 ring-2 ring-yellow-500/30'
                    : 'bg-slate-700/50 border-slate-600 hover:border-slate-500'
                  }
                `}
              >
                <div className="font-semibold text-sm text-slate-200">
                  {option.title}
                </div>
                <div className="text-xs text-slate-400 mt-1">
                  {option.subtitle}
                </div>
                {onRegenerateTitle && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      onRegenerateTitle(i);
                    }}
                    disabled={rewritingTitle === i}
                    className="absolute top-2 right-2 h-6 w-6 p-0 text-blue-400 hover:text-blue-300 hover:bg-blue-500/10"
                    title="Regenerate this title"
                  >
                    <RefreshCw className={`w-3 h-3 ${rewritingTitle === i ? 'animate-spin' : ''}`} />
                  </Button>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Instructions */}
      <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-4 text-sm">
        <p className="font-medium text-slate-300 mb-2">Review the generated content:</p>
        <ul className="space-y-1 text-slate-400 text-xs">
          <li>• All items will be applied when you click "Done"</li>
          <li>• Check categories/questions to regenerate with AI</li>
          <li>• Click "Regenerate Selected" to regenerate checked items</li>
          <li>• Use the ↻ button next to any title or question to reword it</li>
        </ul>
      </div>

      {/* Categories with checkboxes */}
      {categories.map((cat, i) => {
        const catId = `cat-${i}`;
        const isCatChecked = checkedItems.has(catId);
        const isCatRegenerated = regeneratedItems.has(catId);
        const isRewritingCat = rewritingCategory === i;

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
              {onRewriteCategoryTitle && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onRewriteCategoryTitle(i)}
                  disabled={isRewritingCat}
                  className="h-7 px-2 text-blue-400 hover:text-blue-300 hover:bg-blue-500/10"
                  title="Reword category title"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isRewritingCat ? 'animate-spin' : ''}`} />
                </Button>
              )}
            </div>

            {/* Clues */}
            <ul className="space-y-2 ml-9">
              {cat.clues.map((clue, j) => {
                const clueId = `cat-${i}-clue-${j}`;
                const isClueChecked = checkedItems.has(clueId);
                const isClueRegenerated = regeneratedItems.has(clueId);
                const isRewritingThisClue = rewritingClue?.catIndex === i && rewritingClue?.clueIndex === j;

                return (
                  <li key={j} className={`flex items-center gap-3 text-sm ${isClueRegenerated ? 'bg-purple-500/10 -mx-3 px-3 py-1.5 rounded' : ''}`}>
                    <Checkbox
                      id={clueId}
                      checked={isClueChecked}
                      onCheckedChange={() => onToggleClue(i, j)}
                    />
                    <label htmlFor={clueId} className="flex items-center gap-3 flex-1 cursor-pointer leading-relaxed">
                      <span className="text-yellow-500 font-bold min-w-[50px]">
                        ${clue.value}
                      </span>
                      <span className="text-slate-300 flex-1">{clue.clue}</span>
                      {isClueRegenerated && (
                        <Badge className="bg-purple-500 text-xs shrink-0">✨ New</Badge>
                      )}
                    </label>
                    {onRewriteClue && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onRewriteClue(i, j)}
                        disabled={isRewritingThisClue}
                        className="h-7 px-2 text-blue-400 hover:text-blue-300 hover:bg-blue-500/10 shrink-0"
                        title="Rephrase this question"
                      >
                        <RefreshCw className={`w-3 h-3 ${isRewritingThisClue ? 'animate-spin' : ''}`} />
                      </Button>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}

      {/* Summary only - button is in dialog footer */}
      <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-3">
        <span className="text-sm text-slate-400">{getSummary()}</span>
      </div>

      {/* Suggested Team Names */}
      {suggestedTeamNames && suggestedTeamNames.length > 0 && (
        <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-medium text-slate-300">Suggested Team Names:</p>
            {onRegenerateAllTeamNames && (
              <Button
                variant="outline"
                size="sm"
                onClick={onRegenerateAllTeamNames}
                disabled={rewritingTeamName !== null}
                className="h-7 px-2 text-xs text-purple-400 hover:text-purple-300 hover:bg-purple-500/10"
              >
                <Sparkles className="w-3 h-3 mr-1" />
                Regenerate All
              </Button>
            )}
          </div>
          <div className="grid grid-cols-4 gap-2">
            {suggestedTeamNames.map((name, i) => (
              <div
                key={i}
                className="flex items-center gap-2 bg-slate-700/50 border border-slate-600 rounded-lg px-3 py-2"
              >
                <span className="text-sm text-slate-200 flex-1 truncate">{name}</span>
                {onRegenerateTeamName && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onRegenerateTeamName(i)}
                    disabled={rewritingTeamName === i}
                    className="h-6 w-6 p-0 text-blue-400 hover:text-blue-300 hover:bg-blue-500/10 shrink-0"
                    title="Regenerate this team name"
                  >
                    <RefreshCw className={`w-3 h-3 ${rewritingTeamName === i ? 'animate-spin' : ''}`} />
                  </Button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
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
  onRegenerateSelected,
  onRewriteCategoryTitle,
  onRewriteClue,
  onRegenerateTitle,
  onRegenerateAllTitles,
  onRegenerateTeamName,
  onRegenerateAllTeamNames,
  isLoading = false,
  dataVersion = 0,
  regeneratedItems: externalRegeneratedItems,
  regeneratingCounts,
  rewritingCategory,
  rewritingClue,
  rewritingTitle,
  rewritingTeamName
}: AIPreviewDialogProps) {
  const [selectedTitle, setSelectedTitle] = useState<number | null>(null);
  const [checkedItems, setCheckedItems] = useState<Set<string>>(new Set());
  const [internalRegeneratedItems, setInternalRegeneratedItems] = useState<Set<string>>(new Set());
  const scrollRef = useRef<HTMLDivElement>(null);

  // Use external regeneratedItems if provided, otherwise use internal state
  const regeneratedItems = externalRegeneratedItems ?? internalRegeneratedItems;

  // Scroll to top when loading starts
  useEffect(() => {
    if (isLoading && scrollRef.current) {
      scrollRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [isLoading]);

  // Reset state when dialog opens (not when dataVersion changes)
  useEffect(() => {
    if (open) {
      setSelectedTitle(0); // Default to first title
      setCheckedItems(new Set());
      setInternalRegeneratedItems(new Set());
    }
  }, [open]);

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
    const catId = `cat-${catIndex}`;
    const category = data.categories?.[catIndex];

    setCheckedItems(prev => {
      const next = new Set(prev);

      // Toggle the clue
      if (next.has(clueId)) {
        next.delete(clueId);
      } else {
        next.add(clueId);
      }

      // Check if we need to update the category checkbox
      if (category) {
        // Count how many clues in this category are checked
        const checkedCluesCount = category.clues.filter((_, j) => {
          const id = `cat-${catIndex}-clue-${j}`;
          return next.has(id);
        }).length;

        // If all clues are checked, check the category
        if (checkedCluesCount === category.clues.length) {
          next.add(catId);
        } else {
          // Otherwise, uncheck the category
          next.delete(catId);
        }
      }

      return next;
    });
  }, [data.categories]);

  const handleConfirm = () => {
    // Pass both the selected title (if applicable) and checked items
    const result = {
      title: type === 'game-title' ? (selectedTitle ?? 0) : selectedTitle ?? undefined,
      items: checkedItems
    };
    onConfirm(result);
  };

  const handleRegenerateSelected = () => {
    onRegenerateSelected?.(checkedItems);
  };

  const getTypeLabel = () => {
    const labels: Record<AIPromptType, string> = {
      'game-title': 'Generate Title & Subtitle',
      'categories-generate': 'Generate All Categories',
      'category-rename': 'Rename Category',
      'category-title-generate': 'Generate Category Title',
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
            titles={data.titles}
            selectedTitle={selectedTitle}
            onSelectTitle={setSelectedTitle}
            onRewriteCategoryTitle={onRewriteCategoryTitle}
            onRewriteClue={onRewriteClue}
            rewritingCategory={rewritingCategory}
            rewritingClue={rewritingClue}
            onRegenerateTitle={onRegenerateTitle}
            onRegenerateAllTitles={onRegenerateAllTitles}
            rewritingTitle={rewritingTitle}
            suggestedTeamNames={data.suggestedTeamNames}
            onRegenerateTeamName={onRegenerateTeamName}
            onRegenerateAllTeamNames={onRegenerateAllTeamNames}
            rewritingTeamName={rewritingTeamName}
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
      <AlertDialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
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

        <div className="py-4 relative">
          {/* Loading indicator at top */}
          {isLoading && regeneratingCounts && (
            <div ref={scrollRef} className="mb-4 bg-purple-500/20 border border-purple-500/50 rounded-lg p-4 flex items-center gap-4">
              <div className="inline-block animate-spin rounded-full h-6 w-6 border-3 border-purple-500 border-t-transparent shrink-0"></div>
              <div>
                <p className="font-medium text-slate-200">Regenerating with AI...</p>
                <p className="text-sm text-slate-400">
                  {regeneratingCounts.categories > 0 && regeneratingCounts.clues > 0
                    ? `${regeneratingCounts.categories} categor${regeneratingCounts.categories === 1 ? 'y' : 'ies'} and ${regeneratingCounts.clues} question${regeneratingCounts.clues === 1 ? '' : 's'}`
                    : regeneratingCounts.categories > 0
                      ? `${regeneratingCounts.categories} categor${regeneratingCounts.categories === 1 ? 'y' : 'ies'}`
                      : `${regeneratingCounts.clues} question${regeneratingCounts.clues === 1 ? '' : 's'}`
                  }
                </p>
              </div>
            </div>
          )}

          {renderContent()}
        </div>

        <AlertDialogFooter>
          <div className="flex gap-2 w-full">
            <AlertDialogCancel onClick={onCancel} disabled={isLoading}>Cancel</AlertDialogCancel>
            {onRegenerateAll && type !== 'game-title' && (
              <Button
                variant="outline"
                onClick={() => {
                  onRegenerateAll();
                  onCancel();
                }}
                disabled={isLoading}
              >
                <Sparkles className="w-4 h-4 mr-2" />
                Regenerate All
              </Button>
            )}
            {type === 'categories-generate' && onRegenerateSelected && (
              <Button
                variant="outline"
                onClick={handleRegenerateSelected}
                disabled={checkedItems.size === 0 || isLoading}
              >
                <Sparkles className="w-4 h-4 mr-2" />
                Regenerate Selected
              </Button>
            )}
            <AlertDialogAction
              onClick={handleConfirm}
              disabled={(type === 'game-title' && selectedTitle === null) || isLoading}
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
