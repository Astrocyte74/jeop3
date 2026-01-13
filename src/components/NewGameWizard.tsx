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
import { Wand2, ArrowLeft } from 'lucide-react';

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
  const inputRef = useRef<HTMLInputElement>(null);

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
