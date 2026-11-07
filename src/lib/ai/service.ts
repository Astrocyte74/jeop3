/**
 * AI Service Module
 *
 * Handles communication with the AI backend server.
 * Ported from jeop2 with TypeScript improvements.
 */

import type {
  AIPromptType,
  AIContext,
  AIDifficulty,
  AIServerConfig,
  AIGenerateRequest,
  AIGenerateResponse,
  AIValidator
} from './types';
import { checkAbort, isAbort, timedSignal, type GenerationOptions } from './progress';
import { buildPrompt } from './prompts';

// AI Server configuration
const DEFAULT_PORT = 7476;

/**
 * Get AI API base URL from config or defaults
 */
export function getAIApiBase(config?: AIServerConfig): string {
  if (config?.baseUrl) return config.baseUrl;

  // Check for VITE_AI_API_URL environment variable (for external backend)
  const externalApiUrl = import.meta.env.VITE_AI_API_URL;
  if (externalApiUrl) {
    return externalApiUrl;
  }

  const isLocal = typeof window !== 'undefined' &&
    (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');

  if (isLocal) {
    const port = config?.port ?? DEFAULT_PORT;
    // Check for window.AI_CONFIG (from jeop2 compatibility)
    const globalPort = (window as any).AI_CONFIG?.port;
    return `http://localhost:${globalPort ?? port}/api`;
  }

  // Production: use relative path
  return '/api';
}

let serverAvailable: boolean | null = null;

/**
 * Check if AI server is available
 */
export async function checkAIServer(config?: AIServerConfig): Promise<boolean> {
  try {
    const apiBase = getAIApiBase(config);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);

    const response = await fetch(`${apiBase}/health`, {
      method: 'GET',
      signal: controller.signal
    });

    clearTimeout(timeoutId);
    serverAvailable = response.ok;
    return serverAvailable;
  } catch (error) {
    serverAvailable = false;
    return false;
  }
}

/**
 * Get current server availability status (cached)
 */
export function isServerAvailable(): boolean {
  return serverAvailable === true;
}

/**
 * Custom error class for AI parsing issues
 */
export class AISchemaError extends Error {
  public type: string;
  public rawOutput: string;
  public parsedOutput: unknown;

  constructor(
    type: string,
    message: string,
    rawOutput: string,
    parsedOutput: unknown = null
  ) {
    super(message);
    this.name = 'AISchemaError';
    this.type = type;
    this.rawOutput = rawOutput;
    this.parsedOutput = parsedOutput;
  }

  /**
   * Get error details for display
   */
  getDetails(): { type: string; message: string; raw: string; parsed: unknown } {
    return {
      type: this.type,
      message: this.message,
      raw: this.rawOutput,
      parsed: this.parsedOutput
    };
  }
}

/**
 * Safely parse JSON with schema validation
 */
/**
 * Attempt to fix truncated JSON by closing incomplete structures
 */
function attemptFixTruncatedJson(jsonStr: string): string {
  // Count open/close braces and brackets
  const openBraces = (jsonStr.match(/{/g) || []).length;
  const closeBraces = (jsonStr.match(/}/g) || []).length;
  const openBrackets = (jsonStr.match(/\[/g) || []).length;
  const closeBrackets = (jsonStr.match(/\]/g) || []).length;

  let fixed = jsonStr;

  // Close any open strings (unterminated strings)
  if (fixed.endsWith('"')) {
    // String is properly closed, remove trailing quote
  } else if (fixed.includes('"') && !fixed.endsWith('"')) {
    // Likely an unterminated string - close it
    const lastQuote = fixed.lastIndexOf('"');
    if (lastQuote > 0 && fixed.charAt(lastQuote - 1) !== '\\') {
      fixed = fixed.substring(0, lastQuote + 1);
    }
  }

  // Close any open brackets
  const neededCloseBrackets = openBrackets - closeBrackets;
  for (let i = 0; i < neededCloseBrackets; i++) {
    fixed += ']';
  }

  // Close any open braces
  const neededCloseBraces = openBraces - closeBraces;
  for (let i = 0; i < neededCloseBraces; i++) {
    fixed += '}';
  }

  if (fixed !== jsonStr) {
    console.log('[safeJsonParse] Attempted to fix truncated JSON', {
      originalLength: jsonStr.length,
      fixedLength: fixed.length,
      addedChars: fixed.length - jsonStr.length
    });
  }

  return fixed;
}

export function safeJsonParse<T>(
  raw: string,
  validator?: AIValidator<T>
): T | null {
  console.log('[safeJsonParse] Input raw:', { rawLength: raw.length, rawStart: raw.substring(0, 200), rawEnd: raw.substring(raw.length - 200) });

  // Strip markdown code blocks if present
  let cleaned = raw.trim();
  cleaned = cleaned.replace(/^```json\s*/i, '');
  cleaned = cleaned.replace(/^```\s*/i, '');
  cleaned = cleaned.replace(/\s*```$/g, '');
  // Normalize smart quotes / typographic delimiters that some models emit (e.g.
  // local gemma3 uses curly quotes as JSON string delimiters) — would break JSON.parse.
  cleaned = cleaned
    .replace(/[“”«»]/g, '"')
    .replace(/[‘’ʻ]/g, "'")
    .replace(/…/g, '...');
  cleaned = cleaned.trim();

  console.log('[safeJsonParse] Cleaned for parsing:', { cleanedLength: cleaned.length, cleanedPreview: cleaned.substring(0, 200), cleanedEnd: cleaned.substring(cleaned.length - 200) });

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch (parseError) {
    console.error('[safeJsonParse] JSON.parse failed, attempting to fix truncated JSON', {
      error: (parseError as Error).message,
      cleanedLength: cleaned.length
    });

    // Try to fix truncated JSON
    const fixed = attemptFixTruncatedJson(cleaned);
    try {
      parsed = JSON.parse(fixed);
      console.log('[safeJsonParse] Successfully parsed after fixing truncated JSON');
    } catch (secondError) {
      console.error('[safeJsonParse] Still failed after fix attempt', {
        error: (secondError as Error).message,
        fixedLength: fixed.length
      });
      throw new AISchemaError(
        'JSON_PARSE_ERROR',
        'Failed to parse AI response as JSON',
        raw
      );
    }
  }

  // Validate schema if validator provided
  if (validator && !validator(parsed)) {
    // Detailed validation error logging
    if (parsed && typeof parsed === 'object' && 'categories' in parsed && Array.isArray((parsed as any).categories)) {
      const cats = (parsed as any).categories;
      console.error('[safeJsonParse] Validation failed - checking each category:', {
        totalCategories: cats.length,
        categoryDetails: cats.map((cat: any, idx: number) => ({
          idx,
          title: cat.title,
          hasClues: Array.isArray(cat.clues),
          cluesCount: Array.isArray(cat.clues) ? cat.clues.length : 0,
          firstClue: Array.isArray(cat.clues) && cat.clues[0] ? {
            hasValue: 'value' in cat.clues[0],
            hasClue: 'clue' in cat.clues[0],
            hasResponse: 'response' in cat.clues[0],
            value: cat.clues[0].value,
            cluePreview: cat.clues[0].clue?.substring(0, 50),
            responsePreview: cat.clues[0].response?.substring(0, 50)
          } : null
        }))
      });
    }

    throw new AISchemaError(
      'SCHEMA_VALIDATION_ERROR',
      'AI response does not match expected format',
      raw,
      parsed
    );
  }

  return parsed as T;
}

/**
 * Main AI generation function
 *
 * @param promptType - Type of prompt
 * @param context - Context data for the prompt
 * @param difficulty - 'easy', 'normal', or 'hard'
 * @param config - Optional server configuration
 * @param authToken - Optional Clerk auth token
 * @returns Parsed JSON response
 */
export async function generateAI<T = unknown>(
  promptType: AIPromptType,
  context: AIContext,
  difficulty: AIDifficulty = 'normal',
  config?: AIServerConfig,
  authToken?: string | null,
  options: GenerationOptions = {}
): Promise<T> {
  checkAbort(options.signal);
  if (!serverAvailable) {
    throw new Error('AI server is not available. Please start the AI server with: node server.js');
  }

  const apiBase = getAIApiBase(config);

  // Get selected model from localStorage
  const selectedModel = typeof window !== 'undefined'
    ? localStorage.getItem('jeop3:aiModel')
    : null;

  // Build the prompt client-side (single source of truth: lib/ai/prompts.ts).
  // The server forwards { system, user } to the provider unchanged.
  const prompt = buildPrompt(promptType, context, difficulty);

  const requestBody: AIGenerateRequest = {
    promptType,
    prompt,
    model: options.model || selectedModel || undefined
  };

  // Build headers with auth token if available
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (authToken) {
    headers['Authorization'] = `Bearer ${authToken}`;
  }

  const response = await fetch(`${apiBase}/ai/generate`, {
    method: 'POST',
    headers,
    body: JSON.stringify(requestBody),
    signal: options.signal
  });

  // Handle rate limiting
  if (response.status === 429) {
    const error = await response.json().catch(() => ({ message: 'Rate limit exceeded' }));
    throw new Error(error.message || 'Rate limit exceeded. Please wait a moment.');
  }

  // Handle other errors
  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: response.statusText }));
    throw new Error(error.error || error.message || `AI error: ${response.status}`);
  }

  const data = await response.json() as AIGenerateResponse;
  const result = data.result; // Raw JSON string from AI

  return result as T;
}

// =============================================================================
// Wikipedia retrieval — topic-mode grounding (per-category real sources).
// Breaks the self-referential loop where the model invents a fact-sheet and
// then grades clues against its own invention. Server endpoints at
// /api/search-wikipedia + /api/fetch-article do the work; this is the paired
// search-then-fetch client helper.
// =============================================================================

export interface CategorySource {
  /** Clean plain-text source material for the answer-first pipeline. */
  text: string;
  /** Wikipedia article title that grounded this category. */
  title: string;
  /** Canonical Wikipedia URL. */
  url: string;
}

/** Lexical relevance is only a retrieval filter; final clues still require review. */
export function sourceMatchesTopic(topic: string | undefined, title: string, text: string): boolean {
  if (!topic?.trim() || topic.toLowerCase() === 'random') return true;
  const filler = new Set(['famous', 'world', 'worlds', 'best', 'greatest', 'great', 'top', 'about',
    'around', 'history', 'historical', 'facts', 'trivia', 'general', 'knowledge', 'popular', 'common',
    'classic', 'modern', 'from', 'with', 'that', 'this', 'their', 'things', 'and', 'the', 'of']);
  const words = (s: string) => s.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean);
  const topics = words(topic).filter(w => w.length > 2 && !filler.has(w));
  const stem = (w: string) => w === 'roman' || w === 'rome' ? 'rome' : w.replace(/ies$/, 'y').replace(/(ch|sh|x|ss)es$/, '$1').replace(/s$/, '');
  // Inspect the introductory paragraph, not incidental mentions in later sections.
  const lead = text.trim().split(/\n\s*\n/)[0].slice(0, 1200);
  const leadWords = words(title + ' ' + lead);
  return !topics.length || topics.some(w => leadWords.some(l => stem(l) === stem(w) || (w === 'tech' && l === 'technology')));
}

/** Search with the actual topic, inspect multiple hits, and reject wrong senses. */
export async function searchAndFetchCategorySource(
  query: string,
  authToken?: string | null,
  contextTopic?: string,
  options: GenerationOptions = {}
): Promise<CategorySource | null> {
  const apiBase = getAIApiBase();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (authToken) headers['Authorization'] = `Bearer ${authToken}`;
  const scoped = contextTopic?.trim() && contextTopic.toLowerCase() !== 'random';
  // Playful category labels are presentation, not reliable search terms. Anchor
  // retrieval in the requested subject before trying the category angle.
  const queries = scoped ? [...new Set([contextTopic!, `${contextTopic} ${query}`])] : [query];
  const seen = new Set<string>();
  for (const searchQuery of queries) {
    checkAbort(options.signal);
    try {
      const sr = await fetch(`${apiBase}/search-wikipedia`, {
        method: 'POST', headers, body: JSON.stringify({ query: searchQuery }), signal: timedSignal(options.signal, 20000),
      });
      if (!sr.ok) continue;
      const sdata = await sr.json();
      const results: Array<{ title?: string; url?: string }> = Array.isArray(sdata?.results) ? sdata.results : [];
      for (const hit of results.slice(0, 3)) {
        if (!hit.url || seen.has(hit.url) || /disambiguation/i.test(hit.title || '')) continue;
        seen.add(hit.url);
        try {
          const fr = await fetch(`${apiBase}/fetch-article`, {
            method: 'POST', headers, body: JSON.stringify({ url: hit.url }), signal: timedSignal(options.signal, 20000),
          });
          if (!fr.ok) continue;
          const data = await fr.json();
          if (typeof data?.text !== 'string' || data.text.length < 400) continue;
          if (!sourceMatchesTopic(contextTopic, hit.title || '', data.text)) continue;
          return { text: data.text, title: hit.title || query, url: hit.url };
        } catch (error) { if (isAbort(error, options.signal)) throw error; /* Try the next candidate. */ }
      }
    } catch (error) { if (isAbort(error, options.signal)) throw error; }
  }
  return null;
}

/**
 * Fetch article content from URL
 *
 * @param url - The URL to fetch content from
 * @param authToken - Optional Clerk auth token
 * @returns Object with success status, text content, and error details
 */
export async function fetchArticleContent(
  url: string,
  authToken?: string | null,
  options: GenerationOptions = {}
): Promise<{
  success: boolean;
  text?: string;
  truncated?: boolean;
  error?: string;
}> {
  const apiBase = getAIApiBase();

  try {
    // Build headers with auth token if available
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (authToken) {
      headers['Authorization'] = `Bearer ${authToken}`;
    }

    const response = await fetch(`${apiBase}/fetch-article`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ url }),
      signal: options.signal
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: response.statusText }));
      return {
        success: false,
        error: error.error || error.message || `HTTP ${response.status}`
      };
    }

    const data = await response.json();
    return {
      success: true,
      text: data.text || '',
      truncated: data.truncated || false
    };
  } catch (error) {
    if (isAbort(error, options.signal)) throw error;
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch article'
    };
  }
}

/**
 * Initialize AI service - check server on load
 */
export function initAIService(config?: AIServerConfig): void {
  checkAIServer(config).then(available => {
    if (available) {
      console.log('AI Server is available');
    }
    // Silent if not available - components will handle it
  });
}

/**
 * Re-export types for convenience
 */
export type {
  AIPromptType,
  AIContext,
  AIDifficulty,
  AIServerConfig,
  AIValidator
} from './types';
