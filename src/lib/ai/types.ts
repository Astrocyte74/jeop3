/**
 * AI System Types for Jeop3
 * Ported from jeop2 with TypeScript improvements
 */

// Difficulty levels for AI generation
export type AIDifficulty = 'easy' | 'normal' | 'hard';

// AI prompt types - all operations supported by the AI system
export type AIPromptType =
  // Game level
  | 'game-title'
  | 'categories-generate'
  | 'categories-generate-from-content'
  // Category level
  | 'category-rename'
  | 'category-title-generate'
  | 'category-generate-clues'
  | 'category-replace-all'
  // Question level
  | 'questions-generate-five'
  | 'question-generate-single'
  // Editor panel
  | 'editor-generate-clue'
  | 'editor-rewrite-clue'
  | 'editor-generate-answer'
  | 'editor-validate'
  // Team names
  | 'team-name-random'
  | 'team-name-enhance';

// Value guidance for difficulty calibration
export const VALUE_GUIDANCE: Record<number, string> = {
  200: "Obvious / very well-known facts",
  400: "Common knowledge within topic",
  600: "Requires familiarity with the topic",
  800: "Niche or specific details",
  1000: "Deep cuts / less obvious information"
};

// Clue data structure
export interface Clue {
  value: number;
  clue: string;
  response: string;
}

// Category data structure (with optional contentTopic for AI)
export interface AICategory {
  title: string;
  contentTopic?: string;
  clues: Clue[];
}

// Game data structure
export interface AIGame {
  title?: string;
  subtitle?: string;
  categories: AICategory[];
}

// AI request context
export interface AIContext {
  // Game level
  hasContent?: boolean;
  sampleContent?: string;
  multipleTopics?: boolean;
  topicList?: string[];
  sourceCount?: number;
  theme?: string;
  currentTitle?: string;
  currentSubtitle?: string;
  count?: number;
  existingTitles?: Array<{ title: string; subtitle: string }>;

  // Source material for content-based generation
  referenceMaterial?: string;
  referenceUrl?: string;
  sourceCharacters?: number;

  // Category level
  categoryTitle?: string;
  contentTopic?: string;
  existingClues?: Clue[];
  existingAnswers?: string[];

  // Question level
  value?: number;
  currentResponse?: string;

  // Editor level
  currentClue?: string;
  clue?: string;
  response?: string;

  // Team names
  currentName?: string;
  gameTopic?: string;
  existingNames?: string[];
}

// AI response types by prompt type
export interface AIResponses {
  'game-title': { titles: Array<{ title: string; subtitle: string }> };
  'categories-generate': { categories: AICategory[] };
  'categories-generate-from-content': { categories: AICategory[] };
  'category-rename': { names: string[] };
  'category-title-generate': { title: string };
  'category-generate-clues': { clues: Clue[] };
  'category-replace-all': { category: AICategory };
  'questions-generate-five': { clues: Clue[] };
  'question-generate-single': { clue: Clue };
  'editor-generate-clue': { clue: string; response: string };
  'editor-rewrite-clue': { clue: string };
  'editor-generate-answer': { response: string };
  'editor-validate': { valid: boolean; issues: string[]; suggestions: string[] };
  'team-name-random': { names: string[] };
  'team-name-enhance': { name: string };
}

// API request/response types
export interface AIGenerateRequest {
  promptType: AIPromptType;
  context: AIContext;
  difficulty: AIDifficulty;
  model?: string;  // Optional: specific model to use (e.g., "or:google/gemini-2.5-flash" or "ollama:gemma3:12b")
}

export interface AIGenerateResponse {
  result: string; // Raw JSON string from AI
}

// AI server configuration
export interface AIServerConfig {
  baseUrl?: string;
  port?: number;
}

// Validator function type
export type AIValidator<T> = (data: unknown) => data is T;

// Toast notification types
export type ToastType = 'success' | 'error' | 'info' | 'loading';

// Snapshot types for undo system
export interface SnapshotData {
  gameData?: AIGame;
  item?: Clue | AICategory;
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
