/**
 * New Game Wizard Dialog
 *
 * Collects source, theme, and difficulty preferences before generating a new game with AI.
 * Based on jeop2's runNewGameWizard flow with added custom content support.
 */

import { useState, useEffect, useRef } from 'react';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
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
import { Wand2, ArrowLeft, Sparkles, ChevronDown, FileText, Globe, Zap, Edit, Upload, AlertCircle, RefreshCw } from 'lucide-react';
import { getAIApiBase, fetchArticleContent } from '@/lib/ai/service';
import { getModelStats, formatTime, getModelsBySpeed } from '@/lib/ai/stats';

export interface WizardStep {
  type: 'creation-mode' | 'manual-confirm' | 'source' | 'theme' | 'difficulty';
  creationMode?: 'ai' | 'manual' | 'import-json';
  sourceMode?: 'scratch' | 'paste' | 'url';
  referenceMaterial?: string;
  referenceUrl?: string;
  theme?: string;
  difficulty?: 'easy' | 'normal' | 'hard';
}

export interface WizardCompleteData {
  mode: 'ai' | 'manual' | 'import-json';
  // AI mode fields
  theme?: string;
  difficulty?: 'easy' | 'normal' | 'hard';
  sourceMode?: 'scratch' | 'paste' | 'url';
  referenceMaterial?: string;
  referenceUrl?: string;
}

interface NewGameWizardProps {
  open: boolean;
  onClose: () => void;
  onComplete: (data: WizardCompleteData) => void;
  onOpenEditor?: () => void;
  onImportJSON?: () => void;
  isLoading?: boolean;
  error?: string | null;
}

const difficultyOptions = [
  {
    value: 'easy' as const,
    icon: '🟢',
    title: 'Easy',
    desc: 'Accessible, well-known facts - great for beginners'
  },
  {
    value: 'normal' as const,
    icon: '🟡',
    title: 'Normal',
    desc: 'Balanced mix - a fun challenge for everyone'
  },
  {
    value: 'hard' as const,
    icon: '🔴',
    title: 'Hard',
    desc: 'Niche details and deep cuts - for trivia experts'
  }
];

const sourceModeOptions = [
  {
    value: 'scratch' as const,
    icon: Zap,
    title: 'From Scratch',
    desc: 'Let AI create a game from any theme',
    color: 'text-purple-400'
  },
  {
    value: 'paste' as const,
    icon: FileText,
    title: 'Paste Content',
    desc: 'Paste notes, transcripts, or articles',
    color: 'text-blue-400'
  },
  {
    value: 'url' as const,
    icon: Globe,
    title: 'From URL',
    desc: 'Fetch content from a webpage',
    color: 'text-green-400'
  }
];

const creationModeOptions = [
  {
    value: 'ai' as const,
    icon: Wand2,
    title: 'AI Generate',
    desc: 'Generate from a theme, paste your notes/articles, or import from a webpage',
    color: 'text-purple-400'
  },
  {
    value: 'manual' as const,
    icon: Edit,
    title: 'Manual Create',
    desc: 'Build from scratch - requires manually entering every clue and answer',
    color: 'text-yellow-400'
  },
  {
    value: 'import-json' as const,
    icon: Upload,
    title: 'Import JSON',
    desc: 'Load a game from a JSON file',
    color: 'text-blue-400'
  }
];

const MIN_CHARS = 40;
const MAX_CHARS = 100000;

export function NewGameWizard({ open, onClose, onComplete, onOpenEditor, onImportJSON, isLoading = false, error }: NewGameWizardProps) {
  const [step, setStep] = useState<'creation-mode' | 'manual-confirm' | 'source' | 'theme' | 'difficulty'>('creation-mode');
  const [creationMode, setCreationMode] = useState<'ai' | 'manual' | 'import-json'>('ai');
  const [sourceMode, setSourceMode] = useState<'scratch' | 'paste' | 'url'>('scratch');
  const [referenceMaterial, setReferenceMaterial] = useState('');
  const [referenceUrl, setReferenceUrl] = useState('');
  const [isFetching, setIsFetching] = useState(false);
  const [fetchError, setFetchError] = useState('');
  const [theme, setTheme] = useState('');
  const [difficulty, setDifficulty] = useState<'easy' | 'normal' | 'hard'>('normal');
  const [showBack, setShowBack] = useState(false);
  const [aiModel, setAIModel] = useState<string>('or:google/gemini-2.5-flash-lite');
  const [availableModels, setAvailableModels] = useState<Array<{id: string; name: string; provider: string}>>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const urlInputRef = useRef<HTMLInputElement>(null);

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
      })
      .catch(() => {
        // Silent fail - AI features will be disabled
        if (import.meta.env.DEV) {
          console.warn('AI server not available - AI features disabled');
        }
      });
  }, []);

  // Reset state and auto-focus when wizard opens
  useEffect(() => {
    if (open) {
      setCreationMode('ai');
      setSourceMode('scratch');
      setReferenceMaterial('');
      setReferenceUrl('');
      setFetchError('');
      setTheme('');
      setDifficulty('normal');
      setStep('creation-mode');
      setShowBack(false);
      // Auto-focus the input after a small delay to ensure the dialog is rendered
      setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
    }
  }, [open]);

  const handleSourceNext = () => {
    console.log('[NewGameWizard] handleSourceNext called', { sourceMode, referenceMaterialLength: referenceMaterial.length, referenceUrl });
    if (sourceMode === 'scratch') {
      console.log('[NewGameWizard] Going to theme step (scratch mode)');
      setShowBack(true);
      setStep('theme');
    } else if (sourceMode === 'paste') {
      console.log('[NewGameWizard] Paste mode - checking length:', referenceMaterial.trim().length, 'vs MIN_CHARS:', MIN_CHARS);
      if (referenceMaterial.trim().length < MIN_CHARS) {
        setFetchError(`Please enter at least ${MIN_CHARS} characters`);
        return;
      }
      console.log('[NewGameWizard] Going to theme step (paste mode)');
      setShowBack(true);
      setStep('theme');
    } else if (sourceMode === 'url') {
      if (!referenceUrl.trim()) {
        setFetchError('Please enter a URL');
        return;
      }
      handleFetchUrl();
    }
  };

  const handleFetchUrl = async () => {
    setIsFetching(true);
    setFetchError('');

    try {
      const result = await fetchArticleContent(referenceUrl.trim());
      if (result.success && result.text) {
        setReferenceMaterial(result.text);
        setShowBack(true);
        setStep('theme');
      } else {
        setFetchError(result.error || 'Failed to fetch content from URL');
      }
    } catch (err) {
      setFetchError(err instanceof Error ? err.message : 'Failed to fetch content');
    } finally {
      setIsFetching(false);
    }
  };

  const handleThemeNext = () => {
    setStep('difficulty');
  };

  const handleBack = () => {
    if (step === 'manual-confirm') {
      setStep('creation-mode');
      setShowBack(false);
    } else if (step === 'source') {
      setStep('creation-mode');
      setShowBack(false);
    } else if (step === 'theme') {
      setStep('source');
      setShowBack(false);
    } else if (step === 'difficulty') {
      if (sourceMode === 'scratch') {
        setStep('theme');
      } else {
        setStep('source');
        setShowBack(false);
      }
    }
  };

  const handleAIModelChange = (modelId: string) => {
    setAIModel(modelId);
    localStorage.setItem('jeop3:aiModel', modelId);
  };

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

  const handleComplete = () => {
    onComplete({
      mode: creationMode,
      theme: theme || 'random',
      difficulty,
      sourceMode,
      referenceMaterial: sourceMode !== 'scratch' ? referenceMaterial : undefined,
      referenceUrl: sourceMode === 'url' ? referenceUrl : undefined
    });
    // Reset state
    setCreationMode('ai');
    setSourceMode('scratch');
    setReferenceMaterial('');
    setReferenceUrl('');
    setFetchError('');
    setTheme('');
    setDifficulty('normal');
    setStep('creation-mode');
    setShowBack(false);
  };

  const handleClose = () => {
    console.log('[NewGameWizard] handleClose called - wizard closing');
    onClose();
    // Reset state
    setCreationMode('ai');
    setSourceMode('scratch');
    setReferenceMaterial('');
    setReferenceUrl('');
    setFetchError('');
    setTheme('');
    setDifficulty('normal');
    setStep('creation-mode');
    setShowBack(false);
  };

  const handleCreationModeNext = () => {
    if (creationMode === 'ai') {
      setShowBack(true);
      setStep('source');
    } else if (creationMode === 'manual') {
      setShowBack(true);
      setStep('manual-confirm');
    } else if (creationMode === 'import-json') {
      // Close wizard and trigger JSON import
      handleClose();
      onImportJSON?.();
    }
  };

  const handleManualConfirmProceed = () => {
    handleClose();
    onOpenEditor?.();
  };

  const canProceedFromSource = () => {
    if (sourceMode === 'scratch') return true;
    if (sourceMode === 'paste') return referenceMaterial.trim().length >= MIN_CHARS;
    if (sourceMode === 'url') return referenceUrl.trim().length > 0;
    return false;
  };

  return (
    <AlertDialog open={open} onOpenChange={(open) => !open && handleClose()}>
      <AlertDialogContent className="max-w-md max-h-[90vh] flex flex-col">
        <AlertDialogHeader>
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-500/20 rounded-lg">
                <Wand2 className="w-5 h-5 text-purple-400" />
              </div>
              <div>
                <AlertDialogTitle>Create New Game</AlertDialogTitle>
                <AlertDialogDescription>
                  {step === 'creation-mode' && 'Choose how you want to create your game'}
                  {step === 'manual-confirm' && 'Manual creation requires entering all content yourself'}
                  {step === 'source' && 'Choose your content source'}
                  {step === 'theme' && 'Choose a theme for your game'}
                  {step === 'difficulty' && 'Select difficulty level'}
                </AlertDialogDescription>
              </div>
            </div>

            {/* AI Model Selector */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="border-slate-700 bg-slate-900/50 h-8 px-2"
                  disabled={isLoading}
                >
                  <Sparkles className="w-3.5 h-3.5 mr-1.5 text-purple-400" />
                  <span className="text-xs">{formatModelName(aiModel)}</span>
                  <ChevronDown className="w-3 h-3 ml-1 text-slate-400" />
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
                                {stats && (
                                  <div className="text-xs text-slate-500 mt-0.5">
                                    {formatTime(stats.averageTimeMs)} avg • {stats.count} use{stats.count > 1 ? 's' : ''}
                                  </div>
                                )}
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
                                {stats && (
                                  <div className="text-xs text-slate-500 mt-0.5">
                                    {formatTime(stats.averageTimeMs)} avg • {stats.count} use{stats.count > 1 ? 's' : ''}
                                  </div>
                                )}
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
                          return (
                            <div className="flex items-center gap-2 mt-0.5">
                              {stats && (
                                <span className="text-xs text-slate-600">
                                  Avg: {formatTime(stats.averageTimeMs)} • {stats.count} generated
                                </span>
                              )}
                              {fastestModel && fastestModel.modelId === aiModel && (
                                <span className="text-xs text-green-500">⚡ Fastest</span>
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
          </div>
        </AlertDialogHeader>

        {/* Progress Indicator - shows selected choices */}
        {step !== 'creation-mode' && step !== 'manual-confirm' && (
          <div className="px-6 pb-4 border-b border-slate-700/50">
            <div className="flex flex-wrap gap-2 text-xs">
              {creationMode === 'ai' && (
                <>
                  <span className="px-2 py-1 bg-purple-500/20 text-purple-300 rounded-md">
                    AI Generate
                  </span>
                  {step === 'theme' || step === 'difficulty' ? (
                    sourceMode === 'scratch' ? (
                      <span className="px-2 py-1 bg-slate-700 text-slate-300 rounded-md">From Scratch</span>
                    ) : sourceMode === 'paste' ? (
                      <span className="px-2 py-1 bg-slate-700 text-slate-300 rounded-md">Paste Content</span>
                    ) : (
                      <span className="px-2 py-1 bg-slate-700 text-slate-300 rounded-md">From URL</span>
                    )
                  ) : null}
                  {step === 'difficulty' && theme && (
                    <span className="px-2 py-1 bg-slate-700 text-slate-300 rounded-md">
                      Theme: {theme || 'random'}
                    </span>
                  )}
                  {step === 'difficulty' && (
                    <span className="px-2 py-1 bg-slate-700 text-slate-300 rounded-md">
                      Difficulty: {difficulty === 'easy' ? 'Easy' : difficulty === 'normal' ? 'Normal' : 'Hard'}
                    </span>
                  )}
                </>
              )}
            </div>
          </div>
        )}

        {isLoading ? (
          <div className="py-12 flex flex-col items-center justify-center">
            <div className="inline-block animate-spin rounded-full h-12 w-12 border-4 border-purple-500 border-t-transparent mb-4"></div>
            <p className="text-lg font-medium text-slate-200 mb-2">Generating your game...</p>
            <p className="text-sm text-slate-400">Creating categories and questions with AI</p>
          </div>
        ) : (
          <div className="overflow-y-auto flex-1 -mx-6 px-6">
            {step === 'creation-mode' && (
              <div className="py-4 space-y-4">
                <p className="text-sm text-slate-400">How would you like to create your game?</p>
                {creationModeOptions.map((option) => {
                  const Icon = option.icon;
                  const isSelected = creationMode === option.value;
                  return (
                    <button
                      key={option.value}
                      onClick={() => {
                        setCreationMode(option.value);
                      }}
                      className={`
                        w-full text-left p-4 rounded-lg border transition-all
                        ${isSelected
                          ? 'bg-purple-500/20 border-purple-500/50 ring-2 ring-purple-500/30'
                          : 'bg-slate-800/50 border-slate-700 hover:border-slate-600'
                        }
                      `}
                    >
                      <div className="flex items-start gap-3">
                        <Icon className={`w-5 h-5 mt-0.5 ${option.color}`} />
                        <div className="flex-1">
                          <div className="font-semibold text-slate-200">{option.title}</div>
                          <div className="text-sm text-slate-400 mt-1">{option.desc}</div>
                          {isSelected && option.value === 'ai' && (
                            <div className="mt-3 pt-3 border-t border-slate-600">
                              <p className="text-xs text-slate-400 mb-2">Choose your AI generation method:</p>
                              <ul className="text-xs text-slate-300 space-y-1">
                                <li className="flex items-center gap-2">
                                  <span className="text-green-400">✓</span>
                                  <span><span className="text-green-400 font-medium">From any theme</span> - just enter a topic</span>
                                </li>
                                <li className="flex items-center gap-2">
                                  <span className="text-blue-400">✓</span>
                                  <span><span className="text-blue-400 font-medium">From your content</span> - paste notes, transcripts, or articles</span>
                                </li>
                                <li className="flex items-center gap-2">
                                  <span className="text-blue-400">✓</span>
                                  <span><span className="text-blue-400 font-medium">From a webpage</span> - paste a URL to fetch content</span>
                                </li>
                              </ul>
                              <p className="text-xs text-purple-300 mt-2">✨ Complete game in seconds with fact-checked clues!</p>
                            </div>
                          )}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
            {step === 'manual-confirm' && (
              <div className="py-4 space-y-6">
                {/* What's involved */}
                <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-4">
                  <h3 className="font-semibold text-yellow-300 mb-2">⚠️ Manual creation requires significant effort</h3>
                  <p className="text-sm text-slate-300 mb-2">You'll need to manually enter:</p>
                  <ul className="text-sm text-slate-300 space-y-1 ml-4">
                    <li>• 6 category titles</li>
                    <li>• 30 clues (5 per category)</li>
                    <li>• 30 correct responses/answers</li>
                    <li>• Dollar values for each clue</li>
                  </ul>
                  <p className="text-xs text-slate-400 mt-3">This can take 30-60 minutes or more to complete.</p>
                </div>

                {/* AI alternative */}
                <div className="bg-purple-500/10 border border-purple-500/30 rounded-lg p-4">
                  <h3 className="font-semibold text-purple-300 mb-2">✨ Or let AI do the work for you</h3>
                  <p className="text-sm text-slate-300 mb-2">AI can generate a complete game in seconds:</p>
                  <ul className="text-sm text-slate-300 space-y-1 ml-4">
                    <li>• <span className="text-green-400">From any theme</span> - just enter a topic</li>
                    <li>• <span className="text-blue-400">From your content</span> - paste notes, transcripts, or articles</li>
                    <li>• <span className="text-blue-400">From a webpage</span> - paste a URL to fetch content</li>
                  </ul>
                  <p className="text-xs text-slate-400 mt-3">All clues fact-checked and ready to play!</p>
                </div>

                {/* Action buttons */}
                <div className="flex flex-col gap-3">
                  <Button
                    onClick={handleManualConfirmProceed}
                    className="w-full bg-yellow-500 hover:bg-yellow-400 text-black font-semibold"
                  >
                    <Edit className="w-4 h-4 mr-2" />
                    I understand - proceed to manual editor
                  </Button>
                  <Button
                    onClick={() => {
                      setCreationMode('ai');
                      setStep('source');
                      setShowBack(true);
                    }}
                    variant="outline"
                    className="w-full border-purple-500/50 text-purple-300 hover:bg-purple-500/10"
                  >
                    <Wand2 className="w-4 h-4 mr-2" />
                    Try AI generation instead
                  </Button>
                </div>
              </div>
            )}
            {step === 'source' && (
              <div className="py-4 space-y-4">
                <p className="text-sm text-slate-400">How would you like to create your game?</p>
                {sourceModeOptions.map((option) => {
                  const Icon = option.icon;
                  const isSelected = sourceMode === option.value;
                  return (
                    <button
                      key={option.value}
                      onClick={() => {
                        setSourceMode(option.value);
                        setFetchError('');
                      }}
                      className={`
                        w-full text-left p-4 rounded-lg border transition-all
                        ${isSelected
                          ? 'bg-purple-500/20 border-purple-500/50 ring-2 ring-purple-500/30'
                          : 'bg-slate-800/50 border-slate-700 hover:border-slate-600'
                        }
                      `}
                    >
                      <div className="flex items-start gap-3">
                        <Icon className={`w-5 h-5 mt-0.5 ${option.color}`} />
                        <div className="flex-1">
                          <div className="font-semibold text-slate-200">{option.title}</div>
                          <div className="text-sm text-slate-400 mt-1">{option.desc}</div>
                          {isSelected && option.value === 'scratch' && (
                            <div className="mt-3 pt-3 border-t border-slate-600">
                              <p className="text-xs text-slate-400 mb-2">Just enter any topic and AI will create a complete game!</p>
                              <ul className="text-xs text-slate-300 space-y-1">
                                <li className="flex items-center gap-2">
                                  <span className="text-green-400">✓</span>
                                  <span>Works with any theme - science, history, movies, pop culture, etc.</span>
                                </li>
                                <li className="flex items-center gap-2">
                                  <span className="text-green-400">✓</span>
                                  <span>AI generates themed categories and fact-checked clues</span>
                                </li>
                                <li className="flex items-center gap-2">
                                  <span className="text-green-400">✓</span>
                                  <span>Fastest way to create a complete game</span>
                                </li>
                              </ul>
                            </div>
                          )}
                          {isSelected && option.value === 'paste' && (
                            <div className="mt-3 pt-3 border-t border-slate-600">
                              <p className="text-xs text-slate-400 mb-2">Perfect for custom content from your documents:</p>
                              <ul className="text-xs text-slate-300 space-y-1">
                                <li className="flex items-center gap-2">
                                  <span className="text-blue-400">✓</span>
                                  <span>Paste study notes, class transcripts, training materials</span>
                                </li>
                                <li className="flex items-center gap-2">
                                  <span className="text-blue-400">✓</span>
                                  <span>Articles, Wikipedia entries, or any text content</span>
                                </li>
                                <li className="flex items-center gap-2">
                                  <span className="text-blue-400">✓</span>
                                  <span>AI analyzes content and creates themed questions</span>
                                </li>
                              </ul>
                              <p className="text-xs text-blue-300 mt-2">💡 Up to 100,000 characters supported</p>
                            </div>
                          )}
                          {isSelected && option.value === 'url' && (
                            <div className="mt-3 pt-3 border-t border-slate-600">
                              <p className="text-xs text-slate-400 mb-2">Automatically fetch and learn from webpages:</p>
                              <ul className="text-xs text-slate-300 space-y-1">
                                <li className="flex items-center gap-2">
                                  <span className="text-green-400">✓</span>
                                  <span>Works with Wikipedia articles and most web pages</span>
                                </li>
                                <li className="flex items-center gap-2">
                                  <span className="text-green-400">✓</span>
                                  <span>AI extracts key facts and generates questions</span>
                                </li>
                                <li className="flex items-center gap-2">
                                  <span className="text-green-400">✓</span>
                                  <span>Great for educational content or news articles</span>
                                </li>
                              </ul>
                            </div>
                          )}
                        </div>
                      </div>
                    </button>
                  );
                })}

                {/* Paste Content Input */}
                {sourceMode === 'paste' && (
                  <div className="space-y-2 mt-4">
                    <Label htmlFor="referenceMaterial">Content</Label>
                    <Textarea
                      ref={textareaRef}
                      id="referenceMaterial"
                      value={referenceMaterial}
                      onChange={(e) => {
                        setReferenceMaterial(e.target.value);
                        setFetchError('');
                      }}
                      placeholder="Paste notes, transcripts, or excerpts here..."
                      className="bg-slate-800/50 border-slate-700 min-h-[150px] resize-none"
                      maxLength={MAX_CHARS}
                    />
                    <div className="flex items-center justify-between text-xs text-slate-500">
                      <span>{referenceMaterial.length.toLocaleString()} / {MAX_CHARS.toLocaleString()} characters</span>
                      {referenceMaterial.length > 0 && referenceMaterial.length < MIN_CHARS && (
                        <span className="text-orange-500">Minimum {MIN_CHARS} characters required</span>
                      )}
                    </div>
                  </div>
                )}

                {/* URL Input */}
                {sourceMode === 'url' && (
                  <div className="space-y-2 mt-4">
                    <Label htmlFor="referenceUrl">URL</Label>
                    <div className="flex gap-2">
                      <Input
                        ref={urlInputRef}
                        id="referenceUrl"
                        type="url"
                        value={referenceUrl}
                        onChange={(e) => {
                          setReferenceUrl(e.target.value);
                          setFetchError('');
                        }}
                        placeholder="https://en.wikipedia.org/wiki/Topic"
                        className="bg-slate-800/50 border-slate-700 flex-1"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleSourceNext();
                          }
                        }}
                      />
                      <Button
                        onClick={handleFetchUrl}
                        disabled={isFetching || !referenceUrl.trim()}
                        className="bg-green-600 hover:bg-green-500 text-white px-4"
                      >
                        {isFetching ? 'Fetching...' : 'Fetch'}
                      </Button>
                    </div>
                    {fetchError && (
                      <p className="text-xs text-red-400">{fetchError}</p>
                    )}
                    <p className="text-xs text-slate-500">
                      Works with Wikipedia articles and most web pages
                    </p>
                  </div>
                )}
              </div>
            )}

            {step === 'theme' && (
              <div className="py-4 space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="theme">Game Theme</Label>
                  <Input
                    ref={inputRef}
                    id="theme"
                    value={theme}
                    onChange={(e) => setTheme(e.target.value)}
                    placeholder={
                      sourceMode === 'scratch'
                        ? "e.g., Science, Movies, 1990s... (leave blank for random)"
                        : "Optional theme hint (leave blank to auto-detect from content)"
                    }
                    className="bg-slate-800/50 border-slate-700"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleThemeNext();
                      }
                    }}
                  />
                  <p className="text-xs text-slate-500">
                    {sourceMode === 'scratch'
                      ? "Enter a topic or leave blank for a randomly generated theme"
                      : "The AI will analyze your content and create themed categories"
                    }
                  </p>
                </div>
              </div>
            )}

            {step === 'difficulty' && (
          <div className="py-4 space-y-3">
            <p className="text-sm text-slate-400 mb-2">How challenging should the questions be?</p>
            {difficultyOptions.map((option) => (
              <button
                key={option.value}
                onClick={() => setDifficulty(option.value)}
                className={`
                  w-full text-left p-4 rounded-lg border transition-all
                  ${difficulty === option.value
                    ? 'bg-purple-500/20 border-purple-500/50 ring-2 ring-purple-500/30'
                    : 'bg-slate-800/50 border-slate-700 hover:border-slate-600'
                  }
                `}
              >
                <div className="flex items-start gap-3">
                  <span className="text-2xl">{option.icon}</span>
                  <div>
                    <div className="font-semibold text-slate-200">{option.title}</div>
                    <div className="text-sm text-slate-400 mt-1">{option.desc}</div>
                  </div>
                </div>
              </button>
            ))}
          </div>
            )}
          </div>
        )}

        {/* Error display */}
        {error && (
          <div className="px-6 pb-4">
            <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-red-300 mb-1">Generation Failed</p>
                  <p className="text-xs text-red-400/80 mb-3">{error}</p>
                  <Button
                    onClick={handleComplete}
                    size="sm"
                    variant="outline"
                    className="text-xs border-red-500/30 text-red-300 hover:bg-red-500/20 hover:text-red-200"
                  >
                    <RefreshCw className="w-3 h-3 mr-1" />
                    Try Again
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}

        <AlertDialogFooter>
          <div className="flex gap-2 w-full">
            {showBack ? (
              <Button
                variant="outline"
                onClick={handleBack}
                className="flex-1"
                disabled={isLoading}
              >
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back
              </Button>
            ) : (
              <AlertDialogCancel onClick={handleClose} className="flex-1" disabled={isLoading}>
                Cancel
              </AlertDialogCancel>
            )}
            {step === 'manual-confirm' ? (
              <div className="flex-1"></div>
            ) : step === 'creation-mode' ? (
              <Button
                onClick={handleCreationModeNext}
                className="flex-1 bg-yellow-500 hover:bg-yellow-400 text-black"
                disabled={isLoading}
              >
                Next
              </Button>
            ) : step === 'source' ? (
              <Button
                onClick={handleSourceNext}
                className="flex-1 bg-yellow-500 hover:bg-yellow-400 text-black"
                disabled={isLoading || !canProceedFromSource() || isFetching}
              >
                {sourceMode === 'url' && isFetching ? 'Fetching...' : 'Next'}
              </Button>
            ) : step === 'theme' ? (
              <Button
                onClick={handleThemeNext}
                className="flex-1 bg-yellow-500 hover:bg-yellow-400 text-black"
                disabled={isLoading}
              >
                Next
              </Button>
            ) : (
              <Button
                onClick={handleComplete}
                className="flex-1 bg-gradient-to-r from-purple-500 to-purple-600 hover:from-purple-400 hover:to-purple-500 text-white"
                disabled={isLoading || !!error}
              >
                <Wand2 className="w-4 h-4 mr-2" />
                Generate Game
              </Button>
            )}
          </div>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
