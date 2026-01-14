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
function getAIApiBase(config?: AIServerConfig): string {
  if (config?.baseUrl) return config.baseUrl;

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
export function safeJsonParse<T>(
  raw: string,
  validator?: AIValidator<T>
): T | null {
  // Strip markdown code blocks if present
  let cleaned = raw.trim();
  cleaned = cleaned.replace(/^```json\s*/i, '');
  cleaned = cleaned.replace(/^```\s*/i, '');
  cleaned = cleaned.replace(/\s*```$/g, '');
  cleaned = cleaned.trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch (parseError) {
    throw new AISchemaError(
      'JSON_PARSE_ERROR',
      'Failed to parse AI response as JSON',
      raw
    );
  }

  // Validate schema if validator provided
  if (validator && !validator(parsed)) {
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
 * Initialize AI service - check server on load
 */
export function initAIService(config?: AIServerConfig): void {
  checkAIServer(config).then(available => {
    console.log(`AI Server ${available ? 'is available' : 'not available'}`);
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
