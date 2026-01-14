/**
 * AI Preview Dialog Component
 *
 * Shows preview of AI-generated content before applying.
 * Ported from jeop2 with React + shadcn/ui.
 */

import { useState, useEffect, useRef } from 'react';
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
import { Wand2, Sparkles, RefreshCw, Edit3, Eye, EyeOff } from 'lucide-react';
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
  metadata?: {
    modelUsed?: string;
    generatedAt?: string;
    generationTimeMs?: number;
  };
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
      className={`cursor-pointer hover:bg-slate-700/50 rounded px-1 -mx-1 transition-colors ${className}`}
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
  onEditTitle,
  onEditTeamName
}: {
  categories: Array<{
    title: string;
    contentTopic?: string;
    clues: Array<{ value: number; clue: string; response: string }>;
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
  const [showAnswers, setShowAnswers] = useState(false);
  const [editingCategory, setEditingCategory] = useState<{ catIndex: number; field: 'title' | 'contentTopic' } | null>(null);
  const [editingClue, setEditingClue] = useState<{ catIndex: number; clueIndex: number; field: 'clue' | 'response' } | null>(null);
  const [editingTitle, setEditingTitle] = useState<{ titleIndex: number; field: 'title' | 'subtitle' } | null>(null);
  const [editingTeamName, setEditingTeamName] = useState<number | null>(null);
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
                Regenerate All
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
                    <div className="font-semibold text-sm text-slate-200 pr-6">
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

      {/* Instructions with Show Answers toggle */}
      <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-4 text-sm">
        <div className="flex items-center justify-between mb-2">
          <p className="font-medium text-slate-300">Review the generated content:</p>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowAnswers(!showAnswers)}
            className="h-7 px-2 text-xs text-purple-400 hover:text-purple-300 hover:bg-purple-500/10"
          >
            {showAnswers ? <EyeOff className="w-3.5 h-3.5 mr-1" /> : <Eye className="w-3.5 h-3.5 mr-1" />}
            {showAnswers ? 'Hide' : 'Show'} Answers
          </Button>
        </div>
        <ul className="space-y-1 text-slate-400 text-xs">
          <li>• Click on any text to manually edit it</li>
          <li>• Use the AI menu (✨) next to items for AI options</li>
          <li>• All changes will be applied when you click "Done"</li>
        </ul>
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
          <div key={i} className={`bg-slate-800/50 border rounded-lg p-4 ${isCatRegenerated ? 'border-purple-500/50' : 'border-slate-700'}`}>
            {/* Category header */}
            <div className="flex items-center gap-3 mb-3">
              <span className="font-semibold text-slate-200">{i + 1}. </span>
              <EditableText
                value={cat.title}
                onSave={(newTitle) => onEditCategoryTitle?.(i, newTitle)}
                isEditing={isEditingCatTitle}
                onStartEdit={() => setEditingCategory({ catIndex: i, field: 'title' })}
                onStopEdit={() => setEditingCategory(null)}
                className="font-semibold text-slate-200"
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
                      <span>Regenerate All Questions</span>
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
            <ul className="space-y-2">
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
                      <span className="text-yellow-500 font-bold min-w-[50px]">
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
                Regenerate All
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
  onEditTitle,
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

  // Reset state when dialog opens
  useEffect(() => {
    if (open) {
      setSelectedTitle(0); // Default to first title
      setCheckedItems(new Set());
      setInternalRegeneratedItems(new Set());
    }
  }, [open]);

  const handleConfirm = () => {
    // Pass both the selected title (if applicable) and checked items
    const result = {
      title: type === 'game-title' ? (selectedTitle ?? 0) : selectedTitle ?? undefined,
      items: checkedItems
    };
    onConfirm(result);
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

  const formatModelName = (modelId?: string): string => {
    if (!modelId) return 'Unknown';

    // Parse provider:model format
    const parts = modelId.split(':');
    const provider = parts[0];
    const modelName = parts.slice(1).join(':');

    // Format the model name for display
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
            onRewriteCategoryTitle={onRewriteCategoryTitle}
            onRewriteClue={onRewriteClue}
            onRegenerateCategory={onRegenerateCategory}
            onCreateNewCategory={onCreateNewCategory}
            onRegenerateClue={onRegenerateClue}
            rewritingCategory={rewritingCategory}
            rewritingClue={rewritingClue}
            regeneratingCategory={regeneratingCategory}
            creatingNewCategory={creatingNewCategory}
            regeneratingClue={regeneratingClue}
            onRegenerateTitle={onRegenerateTitle}
            onRegenerateAllTitles={onRegenerateAllTitles}
            onEnhanceTitle={onEnhanceTitle}
            rewritingTitle={rewritingTitle}
            enhancingTitle={enhancingTitle}
            suggestedTeamNames={data.suggestedTeamNames}
            onRegenerateTeamName={onRegenerateTeamName}
            onEnhanceTeamName={onEnhanceTeamName}
            onRegenerateAllTeamNames={onRegenerateAllTeamNames}
            rewritingTeamName={rewritingTeamName}
            enhancingTeamName={enhancingTeamName}
            // Manual editing callbacks
            onEditCategoryTitle={onEditCategoryTitle}
            onEditClue={onEditClue}
            onEditAnswer={onEditAnswer}
            onEditTitle={onEditTitle}
            onEditTeamName={onEditTeamName}
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
            <div className="flex-1">
              <AlertDialogTitle>🪄 AI Preview</AlertDialogTitle>
              <AlertDialogDescription>{getTypeLabel()}</AlertDialogDescription>
            </div>
          </div>
          {/* Metadata display */}
          {metadata && (metadata.modelUsed || metadata.generatedAt || metadata.generationTimeMs) && (
            <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-slate-500">
              {metadata.modelUsed && (
                <span className="flex items-center gap-1">
                  Model: <span className="font-medium text-slate-400">{formatModelName(metadata.modelUsed)}</span>
                </span>
              )}
              {metadata.generationTimeMs && (
                <span className="flex items-center gap-1">
                  Time: <span className="font-medium text-slate-400">{formatGenerationTime(metadata.generationTimeMs)}</span>
                </span>
              )}
              {metadata.generatedAt && (
                <span className="flex items-center gap-1">
                  Generated: <span className="font-medium text-slate-400">{formatTimestamp(metadata.generatedAt)}</span>
                </span>
              )}
            </div>
          )}
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
