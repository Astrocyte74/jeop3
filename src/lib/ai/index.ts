/**
 * AI Module Index
 *
 * Main exports for AI functionality.
 */

// Types
export type {
  AIPromptType,
  AIContext,
  AIDifficulty,
  AIServerConfig,
  AIValidator,
  ToastType,
  SnapshotData,
  Snapshot
} from './types';

export {
  VALUE_GUIDANCE
} from './types';

// Service
export {
  generateAI,
  checkAIServer,
  isServerAvailable,
  safeJsonParse,
  initAIService,
  AISchemaError
} from './service';

// Prompts
export {
  buildPrompt,
  validators
} from './prompts';

// Hooks
export {
  useAIToast,
  useAIServer,
  useAIGeneration,
  useUndoManager
} from './hooks';

// Re-export hook types
export type { Toast, UseAIGenerationOptions } from './hooks';
