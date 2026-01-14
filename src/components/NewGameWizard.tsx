/**
 * New Game Wizard Dialog
 *
 * Collects theme and difficulty preferences before generating a new game with AI.
 * Based on jeop2's runNewGameWizard flow.
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
import { Wand2, ArrowLeft, Sparkles, ChevronDown } from 'lucide-react';
import { getAIApiBase } from '@/lib/ai/service';
import { getModelStats, formatTime, getModelsBySpeed } from '@/lib/ai/stats';

export interface WizardStep {
  type: 'theme' | 'difficulty';
  theme?: string;
  difficulty?: 'easy' | 'normal' | 'hard';
}

interface NewGameWizardProps {
  open: boolean;
  onClose: () => void;
  onComplete: (theme: string, difficulty: 'easy' | 'normal' | 'hard') => void;
  isLoading?: boolean;
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

export function NewGameWizard({ open, onClose, onComplete, isLoading = false }: NewGameWizardProps) {
  const [step, setStep] = useState<'theme' | 'difficulty'>('theme');
  const [theme, setTheme] = useState('');
  const [difficulty, setDifficulty] = useState<'easy' | 'normal' | 'hard'>('normal');
  const [showBack, setShowBack] = useState(false);
  const [aiModel, setAIModel] = useState<string>('or:google/gemini-2.5-flash-lite');
  const [availableModels, setAvailableModels] = useState<Array<{id: string; name: string; provider: string}>>([]);
  const inputRef = useRef<HTMLInputElement>(null);

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
      setTheme('');
      setDifficulty('normal');
      setStep('theme');
      setShowBack(false);
      // Auto-focus the input after a small delay to ensure the dialog is rendered
      setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
    }
  }, [open]);

  const handleThemeNext = () => {
    setShowBack(true);
    setStep('difficulty');
  };

  const handleDifficultyBack = () => {
    setStep('theme');
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
    onComplete(theme, difficulty);
    // Reset state
    setTheme('');
    setDifficulty('normal');
    setStep('theme');
    setShowBack(false);
  };

  const handleClose = () => {
    onClose();
    // Reset state
    setTheme('');
    setDifficulty('normal');
    setStep('theme');
    setShowBack(false);
  };

  return (
    <AlertDialog open={open} onOpenChange={(open) => !open && handleClose()}>
      <AlertDialogContent className="max-w-md">
        <AlertDialogHeader>
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-500/20 rounded-lg">
                <Wand2 className="w-5 h-5 text-purple-400" />
              </div>
              <div>
                <AlertDialogTitle>Create New Game</AlertDialogTitle>
                <AlertDialogDescription>
                  {step === 'theme' ? 'Choose a theme for your game' : 'Select difficulty level'}
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

        {isLoading ? (
          <div className="py-12 flex flex-col items-center justify-center">
            <div className="inline-block animate-spin rounded-full h-12 w-12 border-4 border-purple-500 border-t-transparent mb-4"></div>
            <p className="text-lg font-medium text-slate-200 mb-2">Generating your game...</p>
            <p className="text-sm text-slate-400">Creating categories and questions with AI</p>
          </div>
        ) : (
          <>
            {step === 'theme' && (
              <div className="py-4 space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="theme">Game Theme</Label>
                  <Input
                    ref={inputRef}
                    id="theme"
                    value={theme}
                    onChange={(e) => setTheme(e.target.value)}
                    placeholder="e.g., Science, Movies, 1990s... (leave blank for random)"
                    className="bg-slate-800/50 border-slate-700"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleThemeNext();
                      }
                    }}
                  />
                  <p className="text-xs text-slate-500">
                    Enter a topic or leave blank for a randomly generated theme
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
          </>
        )}

        <AlertDialogFooter>
          <div className="flex gap-2 w-full">
            {showBack && step === 'difficulty' ? (
              <Button
                variant="outline"
                onClick={handleDifficultyBack}
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
            {step === 'theme' ? (
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
                disabled={isLoading}
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
