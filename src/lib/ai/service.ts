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
    console.error('[safeJsonParse] Validation failed', {
      parsed,
      parsedKeys: typeof parsed === 'object' && parsed ? Object.keys(parsed) : 'not an object',
      parsedCategories: typeof parsed === 'object' && parsed && 'categories' in parsed ? (parsed as any).categories : 'no categories'
    });
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
 * @returns Parsed JSON response
 */
export async function generateAI<T = unknown>(
  promptType: AIPromptType,
  context: AIContext,
  difficulty: AIDifficulty = 'normal',
  config?: AIServerConfig
): Promise<T> {
  if (!serverAvailable) {
    throw new Error('AI server is not available. Please start the AI server with: node server.js');
  }

  const apiBase = getAIApiBase(config);

  // Get selected model from localStorage
  const selectedModel = typeof window !== 'undefined'
    ? localStorage.getItem('jeop3:aiModel')
    : null;

  const requestBody: AIGenerateRequest = {
    promptType,
    context,
    difficulty,
    model: selectedModel || undefined
  };

  const response = await fetch(`${apiBase}/ai/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(requestBody)
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

/**
 * Fetch article content from URL
 *
 * @param url - The URL to fetch content from
 * @returns Object with success status, text content, and error details
 */
export async function fetchArticleContent(url: string): Promise<{
  success: boolean;
  text?: string;
  truncated?: boolean;
  error?: string;
}> {
  const apiBase = getAIApiBase();

  try {
    const response = await fetch(`${apiBase}/fetch-article`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url })
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
