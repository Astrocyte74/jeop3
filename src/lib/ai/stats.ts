/**
 * AI Generation Statistics Tracker
 *
 * Tracks generation times per model to provide estimates and comparisons.
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

const STATS_KEY = 'jeop3:aiStats:v1';

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
