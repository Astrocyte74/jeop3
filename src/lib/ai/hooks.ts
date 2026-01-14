/**
 * AI React Hooks
 *
 * Custom React hooks for AI operations.
 * Provides convenient API for components to use AI features.
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import type {
  AIPromptType,
  AIContext,
  AIDifficulty,
  ToastType
} from './types';
import {
  generateAI,
  checkAIServer,
  safeJsonParse,
  initAIService
} from './service';
import { validators } from './prompts';
import { recordGeneration, getHumanEstimate } from './stats';

// ============================================
// AI TOAST HOOK
// ============================================

export interface Toast {
  id: string;
  message: string;
  type: ToastType;
  duration?: number;
  onDismiss?: () => void;
  onUndo?: () => void;
}

export function useAIToast() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const show = useCallback((
    message: string,
    type: ToastType = 'success',
    options?: { duration?: number; onUndo?: () => void }
  ) => {
    const id = Math.random().toString(36).substring(7);
    const toast: Toast = {
      id,
      message,
      type,
      duration: options?.duration ?? 5000,
      onUndo: options?.onUndo
    };

    setToasts(prev => [...prev, toast]);

    // Auto-dismiss
    if (options?.duration !== 0) {
      setTimeout(() => {
        dismiss(id);
      }, options?.duration ?? 5000);
    }

    return id;
  }, []);

  const dismiss = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const loading = useCallback((message: string) => {
    const id = show(message, 'loading', { duration: 0 });
    return {
      update: (newMessage: string) => {
        setToasts(prev => prev.map(t =>
          t.id === id ? { ...t, message: newMessage } : t
        ));
      },
      success: (message: string) => {
        setToasts(prev => prev.map(t =>
          t.id === id ? { ...t, message, type: 'success' } : t
        ));
        setTimeout(() => dismiss(id), 3000);
      },
      error: (message: string) => {
        setToasts(prev => prev.map(t =>
          t.id === id ? { ...t, message, type: 'error' } : t
        ));
        setTimeout(() => dismiss(id), 5000);
      },
      dismiss: () => dismiss(id)
    };
  }, [show, dismiss]);

  return { toasts, show, loading, dismiss };
}

// ============================================
// AI SERVER HOOK
// ============================================

export function useAIServer() {
  const [isAvailable, setIsAvailable] = useState<boolean | null>(null);
  const [isChecking, setIsChecking] = useState(false);

  const checkServer = useCallback(async () => {
    setIsChecking(true);
    const available = await checkAIServer();
    setIsAvailable(available);
    setIsChecking(false);
    return available;
  }, []);

  useEffect(() => {
    checkServer();
    // Re-check every 30 seconds
    const interval = setInterval(checkServer, 30000);
    return () => clearInterval(interval);
  }, [checkServer]);

  return { isAvailable, isChecking, checkServer };
}

// ============================================
// AI GENERATION HOOK
// ============================================

export interface UseAIGenerationOptions {
  onSuccess?: (result: unknown) => void;
  onError?: (error: Error) => void;
  onRetry?: () => void;
}

export function useAIGeneration() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const { show, loading } = useAIToast();
  const { isAvailable } = useAIServer();

  const generate = useCallback(async (
    promptType: AIPromptType,
    context: AIContext,
    difficulty: AIDifficulty = 'normal',
    options?: UseAIGenerationOptions
  ) => {
    if (!isAvailable) {
      const err = new Error('AI server is not available. Start the server with: node server.js');
      show(err.message, 'error', { duration: 4000 });
      setError(err);
      options?.onError?.(err);
      return null;
    }

    setIsLoading(true);
    setError(null);

    // Get the selected model from localStorage first (for estimate)
    const modelUsed = typeof window !== 'undefined'
      ? localStorage.getItem('jeop3:aiModel') || undefined
      : undefined;

    // Get loading message for action type with estimate
    const baseLoadingMessages: Record<AIPromptType, string> = {
      'game-title': 'Generating title options...',
      'categories-generate': 'Generating full game...',
      'categories-generate-from-content': 'Generating game from content...',
      'category-rename': 'Generating name options...',
      'category-title-generate': 'Generating category title...',
      'category-generate-clues': 'Generating clues...',
      'category-replace-all': 'Replacing all clues...',
      'questions-generate-five': 'Generating 5 questions...',
      'question-generate-single': 'Generating question...',
      'editor-generate-clue': 'Generating question...',
      'editor-rewrite-clue': 'Enhancing question...',
      'editor-generate-answer': 'Generating answer...',
      'editor-validate': 'Validating...',
      'team-name-random': 'Generating team names...',
      'team-name-enhance': 'Enhancing team name...'
    };

    // Add estimate to loading message if available
    let loadingMessage = baseLoadingMessages[promptType] || 'Generating...';
    if (modelUsed) {
      const estimate = getHumanEstimate(modelUsed);
      if (estimate !== 'Calculating...') {
        loadingMessage += ` (~${estimate})`;
      }
    }

    const loader = loading(`⏳ ${loadingMessage}`);

    const startTime = Date.now();

    try {
      const rawResult = await generateAI<string>(promptType, context, difficulty);

      console.log('[useAIGeneration] Raw AI response:', { promptType, rawLength: rawResult?.length, rawPreview: rawResult?.substring(0, 500) });

      // Parse with validator
      const validator = validators[promptType];
      let result;
      try {
        result = safeJsonParse(rawResult, validator);
      } catch (parseErr) {
        console.error('[useAIGeneration] Parse error:', parseErr);
        throw parseErr;
      }

      console.log('[useAIGeneration] Parsed result:', { result, hasCategories: result && typeof result === 'object' && 'categories' in result });

      if (!result) {
        throw new Error('Failed to parse AI response');
      }

      const generationTimeMs = Date.now() - startTime;

      // Record generation time for future estimates
      if (modelUsed) {
        recordGeneration(modelUsed, generationTimeMs);
      }

      loader.dismiss();
      setIsLoading(false);
      options?.onSuccess?.(result);

      // Return result with metadata
      return {
        ...result,
        _metadata: {
          modelUsed,
          generatedAt: new Date().toISOString(),
          generationTimeMs
        }
      };

    } catch (err) {
      const error = err as Error;
      console.error('[useAIGeneration] Generation error:', { error, message: error.message, stack: error.stack });
      loader.error(error.message || 'AI generation failed');
      setIsLoading(false);
      setError(error);
      options?.onError?.(error);
      return null;
    }
  }, [isAvailable, show, loading]);

  return {
    generate,
    isLoading,
    error,
    isAvailable
  };
}

// ============================================
// UNDO MANAGER HOOK
// ============================================

export interface SnapshotData {
  gameData?: any;
  item?: any;
  selections: {
    categoryIndex: number | null;
    clueIndex: number | null;
  };
}

export interface Snapshot {
  id: string;
  scope: 'single' | 'game';
  timestamp: number;
  data: SnapshotData;
}

export function useUndoManager() {
  const snapshotsRef = useRef<Map<string, Snapshot>>(new Map());

  const saveSnapshot = useCallback((
    id: string,
    scope: 'single' | 'game',
    data: SnapshotData
  ) => {
    const snapshot: Snapshot = {
      id,
      scope,
      timestamp: Date.now(),
      data
    };
    snapshotsRef.current.set(id, snapshot);

    // Cleanup old snapshots (5 minutes)
    const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
    for (const [sid, snap] of snapshotsRef.current.entries()) {
      if (snap.timestamp < fiveMinutesAgo) {
        snapshotsRef.current.delete(sid);
      }
    }
  }, []);

  const restore = useCallback((id: string): Snapshot | null => {
    return snapshotsRef.current.get(id) || null;
  }, []);

  const clear = useCallback((id: string) => {
    snapshotsRef.current.delete(id);
  }, []);

  return { saveSnapshot, restore, clear };
}

// Initialize AI service on module load
initAIService();
