/**
 * AI Generation Statistics Tracker
 *
 * Tracks generation times per model to provide estimates and comparisons.
 * Also includes pricing information for cost estimates.
 */

export interface GenerationStats {
  modelId: string;
  count: number;
  totalTimeMs: number;
  averageTimeMs: number;
  fastestTimeMs: number;
  slowestTimeMs: number;
  lastGeneratedAt: string;
}

/**
 * Model pricing information (per million tokens)
 * Prices from OpenRouter as of 2025-01
 */
export interface ModelPricing {
  inputPrice: number;  // Price per million input tokens
  outputPrice: number; // Price per million output tokens
  avgTokensPerGame: number; // Average tokens used to generate a full 6-category game
}

/**
 * Fallback/default token estimates for models without benchmark data
 */
const DEFAULT_TOKEN_ESTIMATE = 4000;

/**
 * Manual pricing overrides and token estimates from our benchmarks
 * These override OpenRouter pricing and provide avgTokensPerGame data
 */
export const MODEL_PRICING: Record<string, Partial<ModelPricing>> = {
  'google/gemini-3-flash-preview': {
    avgTokensPerGame: 3024, // From benchmarks: 504 tokens/category * 6 categories
  },
  'openai/gpt-4o-mini': {
    avgTokensPerGame: 2556, // From benchmarks: 426 tokens/category * 6 categories
  },
};

const STATS_KEY = 'jeop3:aiStats:v1';
const PRICING_CACHE_KEY = 'jeop3:aiPricing:v1';
const PRICING_CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours

interface OpenRouterModel {
  id: string;
  name: string;
  pricing: {
    prompt: string;
    completion: string;
  };
}

interface PricingCache {
  timestamp: number;
  pricing: Record<string, ModelPricing>;
}

/**
 * Fetch model pricing from OpenRouter API
 */
async function fetchPricingFromOpenRouter(): Promise<Record<string, ModelPricing>> {
  try {
    const response = await fetch('https://openrouter.ai/api/v1/models');
    if (!response.ok) {
      throw new Error(`OpenRouter API error: ${response.status}`);
    }

    const data = await response.json();
    const models: OpenRouterModel[] = data.data || [];

    const pricing: Record<string, ModelPricing> = {};

    for (const model of models) {
      const promptPrice = parseFloat(model.pricing.prompt) || 0;
      const completionPrice = parseFloat(model.pricing.completion) || 0;

      // Skip free models (price = 0)
      if (promptPrice === 0 && completionPrice === 0) {
        continue;
      }

      // Skip models with suspiciously low pricing (likely errors or free models)
      // Less than $0.001 per million tokens is suspicious
      if (promptPrice < 0.001 && completionPrice < 0.001) {
        console.warn(`Skipping ${model.id} due to suspicious pricing: prompt=$${promptPrice}/M, completion=$${completionPrice}/M`);
        continue;
      }

      pricing[model.id] = {
        inputPrice: promptPrice,
        outputPrice: completionPrice,
        avgTokensPerGame: DEFAULT_TOKEN_ESTIMATE,
      };
    }

    return pricing;
  } catch (error) {
    console.error('Failed to fetch pricing from OpenRouter:', error);
    return {};
  }
}

/**
 * Get cached pricing from localStorage
 */
function getCachedPricing(): Record<string, ModelPricing> {
  const raw = localStorage.getItem(PRICING_CACHE_KEY);
  if (!raw) return {};

  try {
    const cached: PricingCache = JSON.parse(raw);
    const age = Date.now() - cached.timestamp;

    // Return cached pricing if it's less than 24 hours old
    if (age < PRICING_CACHE_DURATION) {
      return cached.pricing;
    }
  } catch {
    // Invalid cache, ignore
  }

  return {};
}

/**
 * Save pricing to localStorage cache
 */
function cachePricing(pricing: Record<string, ModelPricing>): void {
  const cached: PricingCache = {
    timestamp: Date.now(),
    pricing,
  };
  localStorage.setItem(PRICING_CACHE_KEY, JSON.stringify(cached));
}

/**
 * Initialize pricing by fetching from OpenRouter and merging with manual overrides
 * Call this on app startup to ensure pricing is available
 */
export async function initializePricing(): Promise<void> {
  // Try to get cached pricing first
  let cachedPricing = getCachedPricing();

  // If cache is empty or expired, fetch fresh data
  if (Object.keys(cachedPricing).length === 0) {
    const fetchedPricing = await fetchPricingFromOpenRouter();

    // Merge fetched pricing with manual overrides
    const mergedPricing: Record<string, ModelPricing> = {};

    // Start with fetched pricing
    for (const [modelId, pricing] of Object.entries(fetchedPricing)) {
      mergedPricing[modelId] = pricing;
    }

    // Apply manual overrides (for benchmarked token counts)
    for (const [modelId, override] of Object.entries(MODEL_PRICING)) {
      if (mergedPricing[modelId]) {
        // Merge with existing fetched pricing
        mergedPricing[modelId] = {
          ...mergedPricing[modelId],
          ...override,
        };
      } else {
        // No fetched pricing, use override with defaults
        mergedPricing[modelId] = {
          inputPrice: override.inputPrice || 0,
          outputPrice: override.outputPrice || 0,
          avgTokensPerGame: override.avgTokensPerGame || DEFAULT_TOKEN_ESTIMATE,
        };
      }
    }

    cachedPricing = mergedPricing;
    cachePricing(mergedPricing);
  }
}

/**
 * Get pricing info for a model from cache or fallback
 */
function getPricingFromCache(modelId: string): ModelPricing | null {
  const cached = getCachedPricing();
  return cached[modelId] || null;
}

/**
 * Get all generation stats from localStorage
 */
export function getGenerationStats(): Record<string, GenerationStats> {
  const raw = localStorage.getItem(STATS_KEY);
  if (!raw) return {};

  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

/**
 * Save generation stats to localStorage
 */
function saveGenerationStats(stats: Record<string, GenerationStats>): void {
  localStorage.setItem(STATS_KEY, JSON.stringify(stats));
}

/**
 * Record a generation with its time
 */
export function recordGeneration(modelId: string, timeMs: number): void {
  const stats = getGenerationStats();
  const existing = stats[modelId];

  if (existing) {
    stats[modelId] = {
      modelId,
      count: existing.count + 1,
      totalTimeMs: existing.totalTimeMs + timeMs,
      averageTimeMs: Math.round((existing.totalTimeMs + timeMs) / (existing.count + 1)),
      fastestTimeMs: Math.min(existing.fastestTimeMs, timeMs),
      slowestTimeMs: Math.max(existing.slowestTimeMs, timeMs),
      lastGeneratedAt: new Date().toISOString(),
    };
  } else {
    stats[modelId] = {
      modelId,
      count: 1,
      totalTimeMs: timeMs,
      averageTimeMs: timeMs,
      fastestTimeMs: timeMs,
      slowestTimeMs: timeMs,
      lastGeneratedAt: new Date().toISOString(),
    };
  }

  saveGenerationStats(stats);
}

/**
 * Get stats for a specific model
 */
export function getModelStats(modelId: string): GenerationStats | null {
  const stats = getGenerationStats();
  return stats[modelId] || null;
}

/**
 * Get estimated generation time for a model
 * Returns null if no historical data
 */
export function getEstimatedTime(modelId: string): number | null {
  const stats = getModelStats(modelId);
  return stats?.averageTimeMs || null;
}

/**
 * Get all models ranked by average generation time
 */
export function getModelsBySpeed(): Array<{ modelId: string; stats: GenerationStats }> {
  const stats = getGenerationStats();
  return Object.values(stats)
    .map(stat => ({ modelId: stat.modelId, stats: stat }))
    .sort((a, b) => a.stats.averageTimeMs - b.stats.averageTimeMs);
}

/**
 * Format time for display (e.g., "45s", "1 min 15s")
 */
export function formatTime(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return remainingSeconds > 0
    ? `${minutes} min ${remainingSeconds}s`
    : `${minutes} min`;
}

/**
 * Get a human-readable estimate (e.g., "About 45s", "1-2 minutes")
 */
export function getHumanEstimate(modelId: string): string {
  const estimated = getEstimatedTime(modelId);
  if (!estimated) return 'Calculating...';

  const seconds = Math.floor(estimated / 1000);

  if (seconds < 30) return `~${seconds}s`;
  if (seconds < 60) return `~${Math.round(seconds / 10) * 10}s`;
  if (seconds < 120) return `~1 min`;
  if (seconds < 300) return `~${Math.round(seconds / 60)} min`;

  return `${Math.floor(seconds / 60)}-${Math.ceil(seconds / 60)} min`;
}

/**
 * Clear all stats (useful for testing)
 */
export function clearGenerationStats(): void {
  localStorage.removeItem(STATS_KEY);
}

/**
 * Clear pricing cache (useful for troubleshooting)
 */
export function clearPricingCache(): void {
  localStorage.removeItem(PRICING_CACHE_KEY);
}

/**
 * Get pricing info for a model
 * Checks cache first, then manual overrides
 * Strips the 'or:' prefix if present
 */
export function getModelPricing(modelId: string): ModelPricing | null {
  // Strip provider prefix if present
  const modelIdWithoutPrefix = modelId.replace(/^(or:|ollama:)/, '');

  // First check the OpenRouter cache
  const cached = getPricingFromCache(modelIdWithoutPrefix);
  if (cached) {
    return cached;
  }

  // Fall back to manual overrides (for models not in cache yet)
  const manual = MODEL_PRICING[modelIdWithoutPrefix];
  if (manual && manual.inputPrice && manual.outputPrice) {
    return {
      inputPrice: manual.inputPrice,
      outputPrice: manual.outputPrice,
      avgTokensPerGame: manual.avgTokensPerGame || DEFAULT_TOKEN_ESTIMATE,
    };
  }

  return null;
}

/**
 * Calculate cost per game for a model (in dollars)
 */
export function getCostPerGame(modelId: string): number | null {
  const pricing = getModelPricing(modelId);
  if (!pricing) return null;

  // Assume 50/50 split input/output tokens
  const inputTokens = pricing.avgTokensPerGame * 0.5;
  const outputTokens = pricing.avgTokensPerGame * 0.5;

  const inputCost = (inputTokens / 1_000_000) * pricing.inputPrice;
  const outputCost = (outputTokens / 1_000_000) * pricing.outputPrice;

  return inputCost + outputCost;
}

/**
 * Get games per dollar for a model
 */
export function getGamesPerDollar(modelId: string): number | null {
  const costPerGame = getCostPerGame(modelId);
  if (!costPerGame || costPerGame === 0) return null;
  return 1 / costPerGame;
}

/**
 * Format cost for display (e.g., "0.72¢", "$0.72")
 */
export function formatCost(dollars: number): string {
  if (dollars < 0.01) {
    const cents = dollars * 100;
    return `${cents.toFixed(2)}¢`;
  } else {
    return `$${dollars.toFixed(2)}`;
  }
}

/**
 * Get a human-readable cost estimate (e.g., "~140 games/$1", "0.72¢ per game")
 */
export function getCostEstimate(modelId: string): string {
  const costPerGame = getCostPerGame(modelId);

  if (!costPerGame) {
    return 'Pricing info unavailable';
  }

  // Games per dollar
  const gamesPerDollar = getGamesPerDollar(modelId);

  if (gamesPerDollar && gamesPerDollar >= 100) {
    return `~${Math.round(gamesPerDollar)} games/$1`;
  } else if (gamesPerDollar) {
    return `${gamesPerDollar.toFixed(0)} games/$1`;
  }

  // Fallback to cost per game
  return formatCost(costPerGame) + ' per game';
}
