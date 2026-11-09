import { boardSnapshot } from '@/lib/ai/wholeBoard';
import type { BoardReview } from '@/lib/ai/types';
import type { FinalJeopardyClue } from '@/lib/storage';
import { VerificationBadge } from './VerificationBadge';
import { CategorySourceChip, ClueSources } from './SourceChips';
import { summarizeBoardSources, type LooseCategory } from './sourceInfo';
/**
 * AI Preview Dialog Component
 *
 * Shows preview of AI-generated content before applying.
 * Ported from jeop2 with React + shadcn/ui.
 */

import { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/lib/auth';
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
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Sparkles, RefreshCw, Eye, EyeOff, ArrowLeft, Check, AlertCircle, BookOpen, PencilLine, X } from 'lucide-react';
import { EDITOR_NAME, StatusSummary, countStatuses, readShowAnswers, writeShowAnswers } from '@/components/editor/clueStatus';
import type { AIPromptType, Clue } from '@/lib/ai/types';
import { GameMetadata as GameMetadataComponent } from '@/components/GameMetadata';
import type { GameMetadata } from '@/lib/storage';

// ============================================
// TYPES
// ============================================

/** A previewed clue. provenance/verification are present when the pipeline produced them. */
export type PreviewClue = Pick<Clue, 'value' | 'clue' | 'response' | 'provenance' | 'verification'>;

export interface PreviewData {
  finalJeopardy?: FinalJeopardyClue;
  finalWarning?: string;
  boardReview?: BoardReview;
  titles?: Array<{ title: string; subtitle: string }>;
  categories?: Array<{
    title: string;
    contentTopic?: string;
    clues: PreviewClue[];
  }>;
  category?: {
    title: string;
    contentTopic?: string;
    clues: PreviewClue[];
  };
  clues?: PreviewClue[];
  suggestedTeamNames?: string[];
}

export interface AIPreviewDialogProps {
  open: boolean;
  type: AIPromptType;
  data: PreviewData;
  onConfirm: (selected: { title?: number; items: Set<string> }) => void;
  onCancel: () => void;
  onBack?: () => void;
  onRegenerateAll?: () => void;
  onRewriteCategoryTitle?: (catIndex: number) => Promise<string | null>;
  onRewriteClue?: (catIndex: number, clueIndex: number) => Promise<string | null>;
  onRegenerateCategory?: (catIndex: number) => Promise<void>;
  onCreateNewCategory?: (catIndex: number) => Promise<void>;
  onRegenerateClue?: (catIndex: number, clueIndex: number) => Promise<void>;
  onRegenerateTitle?: (titleIndex: number) => Promise<{ title: string; subtitle: string } | null>;
  onRegenerateAllTitles?: () => Promise<void>;
  onEnhanceTitle?: (titleIndex: number) => Promise<string | null>;
  onRegenerateTeamName?: (teamIndex: number) => Promise<string | null>;
  onEnhanceTeamName?: (teamIndex: number) => Promise<string | null>;
  onRegenerateAllTeamNames?: () => Promise<void>;
  // Manual editing callbacks
  onEditCategoryTitle?: (catIndex: number, newTitle: string) => void;
  onEditClue?: (catIndex: number, clueIndex: number, newClue: string) => void;
  onEditAnswer?: (catIndex: number, clueIndex: number, newAnswer: string) => void;
  onEditTitle?: (titleIndex: number, newTitle: string, newSubtitle?: string) => void;
  onEditTeamName?: (teamIndex: number, newName: string) => void;
  isLoading?: boolean;
  regeneratedItems?: Set<string>;
  regeneratingCounts?: { categories: number; clues: number };
  rewritingCategory?: number | null;
  rewritingClue?: { catIndex: number; clueIndex: number } | null;
  regeneratingCategory?: number | null;
  creatingNewCategory?: number | null;
  regeneratingClue?: { catIndex: number; clueIndex: number } | null;
  rewritingTitle?: number | null;
  enhancingTitle?: number | null;
  rewritingTeamName?: number | null;
  enhancingTeamName?: number | null;
  metadata?: GameMetadata;
}

// ============================================
// SUB-COMPONENTS
// ============================================

// Inline editable text component
function EditableText({
  value,
  onSave,
  isEditing,
  onStartEdit,
  onStopEdit,
  multiline = false,
  className = '',
  placeholder = 'Click to edit...'
}: {
  value: string;
  onSave: (newValue: string) => void;
  isEditing: boolean;
  onStartEdit: () => void;
  onStopEdit: () => void;
  multiline?: boolean;
  className?: string;
  placeholder?: string;
}) {
  const [editValue, setEditValue] = useState(value);

  useEffect(() => {
    setEditValue(value);
  }, [value]);

  const handleSave = () => {
    if (editValue.trim()) {
      onSave(editValue.trim());
    }
    onStopEdit();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !multiline) {
      e.preventDefault();
      handleSave();
    } else if (e.key === 'Escape') {
      setEditValue(value);
      onStopEdit();
    }
  };

  if (isEditing) {
    return multiline ? (
      <textarea
        value={editValue}
        onChange={(e) => setEditValue(e.target.value)}
        onBlur={handleSave}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            setEditValue(value);
            onStopEdit();
          }
        }}
        className={`w-full bg-slate-700 border border-blue-500 rounded px-2 py-1 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 ${className}`}
        autoFocus
        rows={2}
      />
    ) : (
      <Input
        value={editValue}
        onChange={(e) => setEditValue(e.target.value)}
        onBlur={handleSave}
        onKeyDown={handleKeyDown}
        className={`bg-slate-700 border border-blue-500 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 ${className}`}
        placeholder={placeholder}
        autoFocus
      />
    );
  }

  return (
    <span
      onClick={onStartEdit}
      className={`cursor-pointer hover:bg-slate-700/60 hover:underline decoration-dotted decoration-slate-500 underline-offset-2 rounded px-1 -mx-1 transition-colors ${className}`}
      title="Click to edit"
    >
      {value || <span className="text-slate-500 italic">{placeholder}</span>}
    </span>
  );
}

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
  category: { title: string; contentTopic?: string; clues: PreviewClue[] };
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
  regeneratedItems,
  titles,
  selectedTitle,
  onSelectTitle,
  onRewriteCategoryTitle,
  onRewriteClue,
  onRegenerateCategory,
  onCreateNewCategory,
  onRegenerateClue,
  rewritingCategory,
  rewritingClue,
  regeneratingCategory,
  creatingNewCategory,
  regeneratingClue,
  onRegenerateTitle,
  onRegenerateAllTitles,
  onEnhanceTitle,
  rewritingTitle,
  enhancingTitle,
  suggestedTeamNames,
  onRegenerateTeamName,
  onEnhanceTeamName,
  onRegenerateAllTeamNames,
  rewritingTeamName,
  enhancingTeamName,
  // Manual editing callbacks
  onEditCategoryTitle,
  onEditClue,
  onEditAnswer,
  onEditTeamName
}: {
  categories: Array<{
    title: string;
    contentTopic?: string;
    clues: PreviewClue[];
  }>;
  regeneratedItems: Set<string>;
  titles?: Array<{ title: string; subtitle: string }>;
  selectedTitle?: number | null;
  onSelectTitle?: (index: number) => void;
  onRewriteCategoryTitle?: (catIndex: number) => void;
  onRewriteClue?: (catIndex: number, clueIndex: number) => void;
  onRegenerateCategory?: (catIndex: number) => void;
  onCreateNewCategory?: (catIndex: number) => void;
  onRegenerateClue?: (catIndex: number, clueIndex: number) => void;
  rewritingCategory?: number | null;
  rewritingClue?: { catIndex: number; clueIndex: number } | null;
  regeneratingCategory?: number | null;
  creatingNewCategory?: number | null;
  regeneratingClue?: { catIndex: number; clueIndex: number } | null;
  onRegenerateTitle?: (titleIndex: number) => void;
  onRegenerateAllTitles?: () => void;
  onEnhanceTitle?: (titleIndex: number) => void;
  rewritingTitle?: number | null;
  enhancingTitle?: number | null;
  suggestedTeamNames?: string[];
  onRegenerateTeamName?: (teamIndex: number) => void;
  onEnhanceTeamName?: (teamIndex: number) => void;
  onRegenerateAllTeamNames?: () => void;
  rewritingTeamName?: number | null;
  enhancingTeamName?: number | null;
  // Manual editing callbacks
  onEditCategoryTitle?: (catIndex: number, newTitle: string) => void;
  onEditClue?: (catIndex: number, clueIndex: number, newClue: string) => void;
  onEditAnswer?: (catIndex: number, clueIndex: number, newAnswer: string) => void;
  onEditTitle?: (titleIndex: number, newTitle: string, newSubtitle?: string) => void;
  onEditTeamName?: (teamIndex: number, newName: string) => void;
}) {
  // Local state for inline editing and show answers toggle
  const [showAnswers, setShowAnswers] = useState<boolean>(readShowAnswers);
  const [editingCategory, setEditingCategory] = useState<{ catIndex: number; field: 'title' | 'contentTopic' } | null>(null);
  const [editingClue, setEditingClue] = useState<{ catIndex: number; clueIndex: number; field: 'clue' | 'response' } | null>(null);
  const [editingTeamName, setEditingTeamName] = useState<number | null>(null);

  // Detect duplicate answers across all categories (normalized) so we can flag
  // collisions for the user — defense-in-depth on top of the prompt uniqueness rules.
  const normalizedAnswer = (a: string) =>
    (a || '').toLowerCase().trim()
      .replace(/^(the|a|an)\s+/, '')
      .replace(/[^a-z0-9\s]/g, '')
      .replace(/\s+/g, ' ');
  const answerCounts = new Map<string, number>();
  categories.forEach(cat => cat.clues.forEach(clue => {
    const n = normalizedAnswer(clue.response);
    if (n) answerCounts.set(n, (answerCounts.get(n) || 0) + 1);
  }));
  const isDuplicateAnswer = (response: string) => {
    const n = normalizedAnswer(response);
    return !!n && (answerCounts.get(n) || 0) > 1;
  };

  return (
    <div className="space-y-4">
      {/* Title Selection */}
      {titles && titles.length > 0 && (
        <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-medium text-slate-300">Choose a title for your game:</p>
            {onRegenerateAllTitles && (
              <Button
                variant="outline"
                size="sm"
                onClick={onRegenerateAllTitles}
                disabled={rewritingTitle !== null || enhancingTitle !== null}
                className="h-7 px-2 text-xs text-purple-400 hover:text-purple-300 hover:bg-purple-500/10"
              >
                <Sparkles className="w-3 h-3 mr-1" />
                Regenerate All titles
              </Button>
            )}
          </div>
          <div className="grid grid-cols-3 gap-3">
            {titles.map((option, i) => {
              const isRewriting = rewritingTitle === i;
              const isEnhancing = enhancingTitle === i;

              return (
                <div
                  key={i}
                  className={`
                    relative p-3 rounded-lg border transition-all
                    ${selectedTitle === i
                      ? 'bg-yellow-500/20 border-yellow-500/50 ring-2 ring-yellow-500/30'
                      : 'bg-slate-700/50 border-slate-600'
                    }
                  `}
                >
                  <button
                    onClick={() => onSelectTitle?.(i)}
                    className="w-full text-left"
                  >
                    <div className="font-semibold text-sm text-slate-200 pr-6 flex items-center gap-1.5 min-w-0 [overflow-wrap:anywhere]">
                      {selectedTitle === i && <Check className="w-3.5 h-3.5 text-yellow-400 flex-shrink-0" />}
                      {option.title}
                    </div>
                    <div className="text-xs text-slate-400 mt-1">
                      {option.subtitle}
                    </div>
                  </button>
                  <DropdownMenu modal={false}>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => e.stopPropagation()}
                        disabled={isRewriting || isEnhancing}
                        className="absolute top-2 right-2 h-6 w-6 p-0 text-purple-400 hover:text-purple-300 hover:bg-purple-500/10"
                        title="AI options"
                      >
                        <Sparkles className="w-3.5 h-3.5" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-48">
                      {onEnhanceTitle && (
                        <DropdownMenuItem onClick={() => onEnhanceTitle(i)} disabled={isEnhancing}>
                          <RefreshCw className="w-4 h-4 mr-2 text-blue-400" />
                          <span>Enhance Title</span>
                          {isEnhancing && <span className="ml-auto text-xs">...</span>}
                        </DropdownMenuItem>
                      )}
                      {onRegenerateTitle && (
                        <DropdownMenuItem onClick={() => onRegenerateTitle(i)} disabled={isRewriting}>
                          <Sparkles className="w-4 h-4 mr-2 text-purple-400" />
                          <span>Generate New Title</span>
                          {isRewriting && <span className="ml-auto text-xs">...</span>}
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Where the facts came from, named truthfully (Wikipedia, web, Church sources, supplied
          material) plus how many clues carry quoted evidence. Replaces the Wikipedia-only summary. */}
      {(() => {
        const sum = summarizeBoardSources(categories as unknown as LooseCategory[]);
        if (sum.groups.length === 0 && sum.checkedClues === 0) return null;
        const researched = sum.groups.filter(g => g.tone !== 'warning');
        return (
          <div className="flex items-start gap-2.5 rounded-lg border border-slate-600/50 bg-slate-800/40 p-3 text-sm text-slate-300" data-testid="source-summary">
            <BookOpen className="w-4 h-4 flex-shrink-0 mt-0.5 text-emerald-400" />
            <div className="space-y-1">
              {researched.length > 0 && (
                <p>
                  {researched.map((g, i) => (
                    <span key={g.label}>
                      {i > 0 && <span className="text-slate-500"> · </span>}
                      <span className="font-medium text-emerald-300">{g.count} categor{g.count === 1 ? 'y' : 'ies'} from {g.label}</span>
                    </span>
                  ))}
                </p>
              )}
              {sum.synthesized > 0 && (
                <p className="text-slate-400">
                  <span className="font-medium text-amber-300/90">{sum.synthesized} categor{sum.synthesized === 1 ? 'y' : 'ies'} from an AI fact-sheet.</span>
                  {' '}No retrieved source, so double-check these facts before play.
                </p>
              )}
              {sum.checkedClues > 0 && (
                <p className="text-xs text-slate-400">
                  {sum.checkedClues} of {sum.clueTotal} clues passed the independent check
                  {sum.withQuotes > 0 ? `; ${sum.withQuotes} show the exact source passage they rely on.` : '.'}
                  {sum.checkedClues > sum.withQuotes && sum.withQuotes > 0 ? ' The rest were checked before quotes were recorded.' : ''}
                </p>
              )}
            </div>
          </div>
        );
      })()}

      {/* Board-quality / thin-source signal (derived from clue provenance) */}
      {(() => {
        const all = categories.flatMap(c => c.clues);
        const patched = all.filter(c => (c as any).provenance === 'fallback').length;
        if (patched === 0) return null;
        const strong = all.length - patched;
        return (
          <div className="flex items-start gap-2.5 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-200/90">
            <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <div>
              <span className="font-medium">{strong} strong source-backed clue{strong === 1 ? '' : 's'}</span>
              <span className="text-amber-200/70"> + {patched} filled in because the source was thin.</span>
              <span className="block text-xs text-amber-200/60 mt-0.5">Add richer content for more specific clues — or use ✨ on any clue to regenerate it.</span>
            </div>
          </div>
        );
      })()}

      {/* Toolbar: verification summary + answers toggle (same as the board view) */}
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-lg border border-slate-700 bg-slate-800/50 px-4 py-2.5">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <StatusSummary counts={countStatuses(categories)} />
          <span className="text-xs text-slate-500">Click any text to edit it. Use the sparkle menus for AI options.</span>
        </div>
        <Button
          variant="outline"
          size="sm"
          aria-pressed={showAnswers}
          aria-label={showAnswers ? 'Hide answers' : 'Show answers'}
          onClick={() => setShowAnswers((v) => { writeShowAnswers(!v); return !v; })}
          className="h-8 border-slate-600 bg-transparent text-slate-200"
        >
          {showAnswers ? <EyeOff className="w-3.5 h-3.5 mr-1.5" /> : <Eye className="w-3.5 h-3.5 mr-1.5" />}
          {showAnswers ? 'Hide answers' : 'Show answers'}
        </Button>
      </div>

      {/* Categories with dropdown menus */}
      {categories.map((cat, i) => {
        const catId = `cat-${i}`;
        const isCatRegenerated = regeneratedItems.has(catId);
        const isRewritingCat = rewritingCategory === i;
        const isRegeneratingCat = regeneratingCategory === i;
        const isCreatingNewCat = creatingNewCategory === i;
        const isEditingCatTitle = editingCategory?.catIndex === i && editingCategory?.field === 'title';
        const isEditingCatTopic = editingCategory?.catIndex === i && editingCategory?.field === 'contentTopic';

        return (
          <div key={i} className={`rounded-lg overflow-hidden border ${isCatRegenerated ? 'border-purple-500/50' : 'border-white/10'}`} style={{ background: 'linear-gradient(180deg, rgba(255,255,255,0.03), transparent 40%), rgb(11, 18, 40)' }}>
            {/* Category header — board-styled blue gradient bar */}
            <div className="flex items-center gap-3 px-4 py-3" style={{ background: 'linear-gradient(145deg, var(--theme-primary, #0055a4), var(--theme-secondary, #003366))', boxShadow: '0 4px 8px rgba(0,0,0,0.2)' }}>
              <span className="font-extrabold text-white/60 text-sm">{i + 1}</span>
              <EditableText
                value={cat.title}
                onSave={(newTitle) => onEditCategoryTitle?.(i, newTitle)}
                isEditing={isEditingCatTitle}
                onStartEdit={() => setEditingCategory({ catIndex: i, field: 'title' })}
                onStopEdit={() => setEditingCategory(null)}
                className="font-extrabold uppercase tracking-wide text-white"
                placeholder="Category title"
              />
              {cat.contentTopic && cat.contentTopic !== cat.title && (
                <Badge variant="outline" className="text-xs">
                  <EditableText
                    value={cat.contentTopic}
                    onSave={(newTopic) => onEditCategoryTitle?.(i, newTopic)}
                    isEditing={isEditingCatTopic}
                    onStartEdit={() => setEditingCategory({ catIndex: i, field: 'contentTopic' })}
                    onStopEdit={() => setEditingCategory(null)}
                    className="text-slate-400"
                    placeholder="Topic"
                  />
                </Badge>
              )}
              {isCatRegenerated && (
                <Badge className="bg-purple-500 text-xs">Regenerated</Badge>
              )}
              <CategorySourceChip category={cat as unknown as LooseCategory} />
              <div className="flex-1" />
              <DropdownMenu modal={false}>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={isRewritingCat || isRegeneratingCat || isCreatingNewCat || isEditingCatTitle || isEditingCatTopic}
                    className="h-7 px-2 text-purple-400 hover:text-purple-300 hover:bg-purple-500/10"
                    title="AI options for category"
                  >
                    <Sparkles className="w-4 h-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  {onRewriteCategoryTitle && (
                    <DropdownMenuItem onClick={() => onRewriteCategoryTitle(i)} disabled={isRewritingCat}>
                      <RefreshCw className="w-4 h-4 mr-2 text-blue-400" />
                      <span>Reword Category Title</span>
                      {isRewritingCat && <span className="ml-auto text-xs">...</span>}
                    </DropdownMenuItem>
                  )}
                  {onRegenerateCategory && (
                    <DropdownMenuItem onClick={() => onRegenerateCategory(i)} disabled={isRegeneratingCat}>
                      <Sparkles className="w-4 h-4 mr-2 text-purple-400" />
                      <span>Regenerate this category</span>
                      {isRegeneratingCat && <span className="ml-auto text-xs">...</span>}
                    </DropdownMenuItem>
                  )}
                  {onCreateNewCategory && (
                    <DropdownMenuItem onClick={() => onCreateNewCategory(i)} disabled={isCreatingNewCat}>
                      <Sparkles className="w-4 h-4 mr-2 text-green-400" />
                      <span>Create New Category Topic</span>
                      {isCreatingNewCat && <span className="ml-auto text-xs">...</span>}
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            {/* Clues */}
            <ul className="space-y-1 p-4 pt-3">
              {cat.clues.map((clue, j) => {
                const clueId = `cat-${i}-clue-${j}`;
                const isClueRegenerated = regeneratedItems.has(clueId);
                const isRewritingThisClue = rewritingClue?.catIndex === i && rewritingClue?.clueIndex === j;
                const isRegeneratingThisClue = regeneratingClue?.catIndex === i && regeneratingClue?.clueIndex === j;
                const isEditingClue = editingClue?.catIndex === i && editingClue?.clueIndex === j && editingClue?.field === 'clue';
                const isEditingResponse = editingClue?.catIndex === i && editingClue?.clueIndex === j && editingClue?.field === 'response';

                return (
                  <li
                    key={j}
                    className={`
                      ${isClueRegenerated ? 'bg-purple-500/10 -mx-3 px-3 py-2 rounded' : ''}
                      ${showAnswers ? 'py-2' : ''}
                    `}
                  >
                    <div className="flex items-center gap-3 text-sm">
                      <span className="font-black min-w-[60px] text-right" style={{ color: 'var(--theme-gold, #ffd700)', fontSize: '18px' }}>
                        ${clue.value}
                      </span>
                      <EditableText
                        value={clue.clue}
                        onSave={(newClue) => onEditClue?.(i, j, newClue)}
                        isEditing={isEditingClue}
                        onStartEdit={() => setEditingClue({ catIndex: i, clueIndex: j, field: 'clue' })}
                        onStopEdit={() => setEditingClue(null)}
                        multiline={!showAnswers}
                        className="text-slate-300 flex-1"
                        placeholder="Question"
                      />
                      {isClueRegenerated && (
                        <Badge className="bg-purple-500 text-xs shrink-0">✨ New</Badge>
                      )}
                      <VerificationBadge clue={clue} category={cat.title} />
                      {(clue as any).provenance === 'fallback' && (
                        <Badge variant="outline" className="text-amber-400/80 border-amber-500/30 bg-amber-500/5 text-[10px] shrink-0" title="Filled from fallback — click ✨ to regenerate for a better clue">Patched</Badge>
                      )}
                      <DropdownMenu modal={false}>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={isRewritingThisClue || isRegeneratingThisClue || isEditingClue || isEditingResponse}
                            className="h-7 px-2 text-purple-400 hover:text-purple-300 hover:bg-purple-500/10 shrink-0"
                            title="AI options for question"
                          >
                            <Sparkles className="w-3.5 h-3.5" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-48">
                          {onRewriteClue && (
                            <DropdownMenuItem onClick={() => onRewriteClue(i, j)} disabled={isRewritingThisClue}>
                              <RefreshCw className="w-4 h-4 mr-2 text-blue-400" />
                              <span>Rephrase Question</span>
                              {isRewritingThisClue && <span className="ml-auto text-xs">...</span>}
                            </DropdownMenuItem>
                          )}
                          {onRegenerateClue && (
                            <DropdownMenuItem onClick={() => onRegenerateClue(i, j)} disabled={isRegeneratingThisClue}>
                              <Sparkles className="w-4 h-4 mr-2 text-purple-400" />
                              <span>Regenerate Question</span>
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                    {/* Show Answer section */}
                    {showAnswers && (
                      <div className="mt-2 pl-16 flex items-start gap-2 text-sm">
                        <span className="text-green-400 font-semibold shrink-0">Answer:</span>
                        <EditableText
                          value={clue.response}
                          onSave={(newAnswer) => onEditAnswer?.(i, j, newAnswer)}
                          isEditing={isEditingResponse}
                          onStartEdit={() => setEditingClue({ catIndex: i, clueIndex: j, field: 'response' })}
                          onStopEdit={() => setEditingClue(null)}
                          multiline
                          className="text-green-300 flex-1"
                          placeholder="Answer"
                        />
                        {isDuplicateAnswer(clue.response) && (
                          <Badge variant="outline" className="text-amber-400 border-amber-500/50 bg-amber-500/10 shrink-0 gap-1" title="This answer appears more than once — try regenerating this clue">
                            <AlertCircle className="w-3 h-3" /> Duplicate
                          </Badge>
                        )}
                      </div>
                    )}
                    {/* Quotes usually contain the answer, so they follow the answers toggle. */}
                    {showAnswers && (
                      <div className="mt-2 pl-16">
                        <ClueSources clue={clue} category={cat.title} />
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}

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
                disabled={rewritingTeamName !== null || enhancingTeamName !== null || editingTeamName !== null}
                className="h-7 px-2 text-xs text-purple-400 hover:text-purple-300 hover:bg-purple-500/10"
              >
                <Sparkles className="w-3 h-3 mr-1" />
                Regenerate teams
              </Button>
            )}
          </div>
          <div className="space-y-2">
            {suggestedTeamNames.map((name, i) => {
              const isRewriting = rewritingTeamName === i;
              const isEnhancing = enhancingTeamName === i;
              const isEditing = editingTeamName === i;

              return (
                <div
                  key={i}
                  className="flex items-center gap-2 bg-slate-700/50 border border-slate-600 rounded-lg px-3 py-2"
                >
                  <EditableText
                    value={name}
                    onSave={(newName) => onEditTeamName?.(i, newName)}
                    isEditing={isEditing}
                    onStartEdit={() => setEditingTeamName(i)}
                    onStopEdit={() => setEditingTeamName(null)}
                    className="text-sm text-slate-200 flex-1"
                    placeholder="Team name"
                  />
                  <DropdownMenu modal={false}>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={isRewriting || isEnhancing || isEditing}
                        className="h-6 w-6 p-0 text-purple-400 hover:text-purple-300 hover:bg-purple-500/10 shrink-0"
                        title="AI options for team name"
                      >
                        <Sparkles className="w-3.5 h-3.5" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-44">
                      {onEnhanceTeamName && (
                        <DropdownMenuItem onClick={() => onEnhanceTeamName(i)} disabled={isEnhancing}>
                          <RefreshCw className="w-4 h-4 mr-2 text-blue-400" />
                          <span>Enhance Name</span>
                          {isEnhancing && <span className="ml-auto text-xs">...</span>}
                        </DropdownMenuItem>
                      )}
                      {onRegenerateTeamName && (
                        <DropdownMenuItem onClick={() => onRegenerateTeamName(i)} disabled={isRewriting}>
                          <Sparkles className="w-4 h-4 mr-2 text-purple-400" />
                          <span>Generate New Name</span>
                          {isRewriting && <span className="ml-auto text-xs">...</span>}
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              );
            })}
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
  onBack,
  onRegenerateAll,
  onRewriteCategoryTitle,
  onRewriteClue,
  onRegenerateCategory,
  onCreateNewCategory,
  onRegenerateClue,
  onRegenerateTitle,
  onRegenerateAllTitles,
  onEnhanceTitle,
  onRegenerateTeamName,
  onEnhanceTeamName,
  onRegenerateAllTeamNames,
  // Manual editing callbacks
  onEditCategoryTitle,
  onEditClue,
  onEditAnswer,
  onEditTeamName,
  isLoading = false,
  regeneratedItems: externalRegeneratedItems,
  regeneratingCounts,
  rewritingCategory,
  rewritingClue,
  regeneratingCategory,
  creatingNewCategory,
  regeneratingClue,
  rewritingTitle,
  enhancingTitle,
  rewritingTeamName,
  enhancingTeamName,
  metadata
}: AIPreviewDialogProps) {
  // Clerk auth - hide AI action buttons if not signed in
  const { isSignedIn } = useAuth();

  // Conditionally include AI action props based on auth
  const aiActionProps = isSignedIn ? {
    onRewriteCategoryTitle,
    onRewriteClue,
    onRegenerateCategory,
    onCreateNewCategory,
    onRegenerateClue,
    onRegenerateTitle,
    onRegenerateAllTitles,
    onEnhanceTitle,
    onRegenerateTeamName,
    onEnhanceTeamName,
    onRegenerateAllTeamNames,
  } : {};

  const [selectedTitle, setSelectedTitle] = useState<number | null>(null);
  // Any manual edit or regeneration in this session counts as unsaved.
  const [hasEdits, setHasEdits] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  // Set while Save is running so the dialog's own close doesn't read as a discard.
  const savingRef = useRef(false);
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

  // Reset state when dialog opens
  useEffect(() => {
    if (open) {
      setSelectedTitle(0); // Default to first title
      setCheckedItems(new Set());
      setInternalRegeneratedItems(new Set());
      setHasEdits(false);
      setConfirmDiscard(false);
      savingRef.current = false;
    }
  }, [open]);

  const hasUnsaved = hasEdits || regeneratedItems.size > 0;
  const markEdited = <A extends unknown[]>(fn?: (...args: A) => void) =>
    fn ? (...args: A) => { setHasEdits(true); fn(...args); } : undefined;

  const requestDiscard = () => {
    if (hasUnsaved) setConfirmDiscard(true);
    else onCancel();
  };

  const handleConfirm = () => {
    savingRef.current = true;
    // Pass both the selected title (if applicable) and checked items
    const result = {
      title: type === 'game-title' ? (selectedTitle ?? 0) : selectedTitle ?? undefined,
      items: checkedItems
    };
    onConfirm(result);
  };

  const getTypeLabel = () => {
    const labels: Record<AIPromptType, string> = {
      'final-jeopardy': 'Final Jeopardy',
      'review-board': 'Review Board',
      'game-title': 'Generate Title & Subtitle',
      'categories-generate': 'Generate All Categories',
      'categories-generate-from-content': 'Generate from Content',
      'category-names-draft': 'Draft Category Names',
      'extract-board-answers': 'Extract Answers',
      'clues-from-answers': 'Write Clues',
      'judge-clues': 'Judge Clues',
      'topic-fact-sheet': 'Research Topic',
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
            regeneratedItems={regeneratedItems}
            titles={data.titles}
            selectedTitle={selectedTitle}
            onSelectTitle={setSelectedTitle}
            rewritingCategory={rewritingCategory}
            rewritingClue={rewritingClue}
            regeneratingCategory={regeneratingCategory}
            creatingNewCategory={creatingNewCategory}
            regeneratingClue={regeneratingClue}
            rewritingTitle={rewritingTitle}
            enhancingTitle={enhancingTitle}
            suggestedTeamNames={data.suggestedTeamNames}
            rewritingTeamName={rewritingTeamName}
            enhancingTeamName={enhancingTeamName}
            // Manual editing callbacks
            onEditCategoryTitle={markEdited(onEditCategoryTitle)}
            onEditClue={markEdited(onEditClue)}
            onEditAnswer={markEdited(onEditAnswer)}
            onEditTeamName={markEdited(onEditTeamName)}
            {...aiActionProps}
          />
        ) : null;

      case 'categories-generate-from-content':
        return data.categories ? (
          <CategoriesPreview
            categories={data.categories}
            regeneratedItems={regeneratedItems}
            titles={data.titles}
            selectedTitle={selectedTitle}
            onSelectTitle={setSelectedTitle}
            rewritingCategory={rewritingCategory}
            rewritingClue={rewritingClue}
            regeneratingCategory={regeneratingCategory}
            creatingNewCategory={creatingNewCategory}
            regeneratingClue={regeneratingClue}
            rewritingTitle={rewritingTitle}
            enhancingTitle={enhancingTitle}
            suggestedTeamNames={data.suggestedTeamNames}
            rewritingTeamName={rewritingTeamName}
            enhancingTeamName={enhancingTeamName}
            // Manual editing callbacks
            onEditCategoryTitle={markEdited(onEditCategoryTitle)}
            onEditClue={markEdited(onEditClue)}
            onEditAnswer={markEdited(onEditAnswer)}
            onEditTeamName={markEdited(onEditTeamName)}
            {...aiActionProps}
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
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (next) return;
        // Save closes the dialog through here too; only Esc/overlay should ask.
        if (savingRef.current) onCancel();
        else requestDiscard();
      }}
    >
      {/* data-[size=default]:sm:max-w-3xl matches the base component's own variant so it can override its sm:max-w-lg cap */}
      <AlertDialogContent className="max-w-[95vw] data-[size=default]:sm:max-w-3xl max-h-[90vh] overflow-y-auto overflow-x-hidden">
        {/* Persistent bar: same name and actions as the board view of the editor. */}
        <div className="sticky -top-6 z-20 -mx-6 -mt-6 border-b border-white/10 bg-background/95 px-6 pb-3 pt-5 backdrop-blur">
          <AlertDialogHeader>
            <div className="flex w-full items-center gap-3">
              <PencilLine className="h-5 w-5 shrink-0 text-purple-300" aria-hidden />
              <div className="min-w-0 flex-1">
                <AlertDialogTitle>{EDITOR_NAME}</AlertDialogTitle>
                <AlertDialogDescription className="flex items-center gap-2">
                  <span>{getTypeLabel()}</span>
                  <span className={`inline-flex items-center gap-1.5 ${hasUnsaved ? 'text-amber-300' : 'text-slate-500'}`} role="status" aria-live="polite">
                    <span className={`size-2 rounded-full ${hasUnsaved ? 'bg-amber-400' : 'bg-slate-600'}`} aria-hidden />
                    {hasUnsaved ? 'Unsaved changes' : 'No changes'}
                  </span>
                </AlertDialogDescription>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={requestDiscard}
                disabled={isLoading}
                aria-label={hasUnsaved ? 'Discard changes' : 'Close editor'}
                className="border-slate-600 bg-transparent text-slate-200"
              >
                <X className="mr-1.5 h-4 w-4" />
                {hasUnsaved ? 'Discard' : 'Close'}
              </Button>
              <AlertDialogAction
                onClick={handleConfirm}
                disabled={(type === 'game-title' && selectedTitle === null) || isLoading}
                aria-label="Save game"
                className="bg-yellow-500 font-semibold text-black hover:bg-yellow-400"
              >
                Save
              </AlertDialogAction>
            </div>
          </AlertDialogHeader>
        </div>

        {data.finalJeopardy && (
          <details className="my-2 rounded-lg border border-slate-700 p-3">
            <summary className="cursor-pointer text-slate-200">Final Jeopardy · {data.finalJeopardy.category} <VerificationBadge clue={{ ...data.finalJeopardy, value: 0 }} category={data.finalJeopardy.category} /></summary>
            <p className="mt-2">{data.finalJeopardy.clue}</p>
            <p className="mt-1 font-semibold">{data.finalJeopardy.response}</p>
            <div className="mt-2"><ClueSources clue={data.finalJeopardy} category={data.finalJeopardy.category} /></div>
          </details>
        )}
        {data.finalWarning && <p className="text-sm text-amber-300">{data.finalWarning}</p>}
        {data.boardReview && (
          <details className="my-2 rounded-lg border border-slate-700 p-3">
            <summary className="cursor-pointer text-slate-200">Whole-board review · {data.boardReview.issues.length} notes</summary>
            {data.boardReview.snapshot !== boardSnapshot(data.categories || [], data.finalJeopardy) ? (
              <p className="text-sm text-amber-300">The board has changed since this review. Regenerate the board to check the new version.</p>
            ) : <>
              {data.boardReview.warning && <p className="text-sm text-amber-300">{data.boardReview.warning}</p>}
              {!data.boardReview.issues.length && <p>No board-level issues found in this review.</p>}
              <ul className="list-disc pl-5">{data.boardReview.issues.map((issue, i) => <li key={i}>{issue.reason}</li>)}</ul>
            </>}
          </details>
        )}
        {/* Metadata display - collapsible */}
        {metadata && <GameMetadataComponent metadata={metadata} defaultOpen={false} />}

        <div className="py-1 relative break-words">
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

        {(onBack || (onRegenerateAll && type !== 'game-title' && isSignedIn)) && (
          <AlertDialogFooter>
            <div className="flex gap-2 w-full">
              {onBack && (
                <Button
                  variant="ghost"
                  onClick={onBack}
                  disabled={isLoading}
                  className="text-slate-400 hover:text-slate-200"
                >
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Back
                </Button>
              )}
              {onRegenerateAll && type !== 'game-title' && isSignedIn && (
                <Button
                  variant="outline"
                  className="ml-auto"
                  onClick={() => {
                    onRegenerateAll();
                    onCancel();
                  }}
                  disabled={isLoading}
                >
                  <Sparkles className="w-4 h-4 mr-2" />
                  Regenerate all categories
                </Button>
              )}
            </div>
          </AlertDialogFooter>
        )}

        {/* Only reachable when there are unsaved edits. */}
        <AlertDialog open={confirmDiscard} onOpenChange={setConfirmDiscard}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Discard unsaved changes?</AlertDialogTitle>
              <AlertDialogDescription>
                Your edits and regenerated items haven't been saved. Leaving now will lose them.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Keep editing</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => { setConfirmDiscard(false); onCancel(); }}
                className="bg-red-600 hover:bg-red-500"
              >
                Discard changes
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </AlertDialogContent>
    </AlertDialog>
  );
}
