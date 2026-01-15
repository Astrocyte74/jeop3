// Types defined inline to avoid module resolution issues
export type Clue = {
  value: number;
  clue: string;
  response: string;
};

export type Category = {
  title: string;
  contentTopic?: string;
  clues: Clue[];
};

export type GameMetadata = {
  modelUsed?: string;  // e.g., "or:google/gemini-2.5-flash-lite" or "ollama:gemma3:12b"
  generatedAt?: string;  // ISO timestamp
  generationTimeMs?: number;  // Time taken to generate in milliseconds
};

export type Game = {
  title: string;
  subtitle?: string;
  categories: Category[];
  rows?: number;
  suggestedTeamNames?: string[];
  metadata?: GameMetadata;
};

export type Team = {
  id: string;
  name: string;
  score: number;
};

export type GameState = {
  used: Record<string, boolean>;
  teams: Team[];
  activeTeamId: string;
  currentRound: number;
};

export type GameMeta = {
  id: string;
  title: string;
  subtitle?: string;
  source: 'index' | 'custom';
  path?: string;
  game?: Game;
  createdAt?: string;  // ISO timestamp for sorting
};

export type GamePlayStats = {
  lastPlayed: number;  // Unix timestamp
  playCount: number;
};

const CUSTOM_GAMES_KEY = 'jeop3:customGames:v1';
const STATE_PREFIX = 'jeop3:state:v2';
const SELECTED_GAME_KEY = 'jeop3:selectedGameId:v1';
const PLAY_STATS_KEY = 'jeop3:playStats:v1';

export function stateKey(gameId: string): string {
  return `${STATE_PREFIX}:${gameId}`;
}

export function safeJsonParse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function loadCustomGames(): GameMeta[] {
  const raw = localStorage.getItem(CUSTOM_GAMES_KEY);
  const parsed = safeJsonParse<GameMeta[]>(raw, []);

  return parsed
    .filter((g) => g && typeof g === 'object')
    .map((g) => ({
      id: String(g.id ?? ''),
      title: String(g.title ?? 'Custom game'),
      subtitle: String(g.subtitle ?? ''),
      source: 'custom' as const,
      game: g.game ?? undefined,
    }))
    .filter((g) => g.id && g.game && typeof g.game === 'object');
}

export function saveCustomGames(list: GameMeta[]): void {
  localStorage.setItem(CUSTOM_GAMES_KEY, JSON.stringify(list));
}

export function loadGameState(gameId: string): GameState | null {
  const raw = localStorage.getItem(stateKey(gameId));
  return safeJsonParse<GameState | null>(raw, null);
}

export function saveGameState(gameId: string, state: GameState): void {
  localStorage.setItem(stateKey(gameId), JSON.stringify(state));
}

export function getSelectedGameId(): string | null {
  return localStorage.getItem(SELECTED_GAME_KEY);
}

export function setSelectedGameId(gameId: string): void {
  localStorage.setItem(SELECTED_GAME_KEY, gameId);
}

export function createInitialGameState(teams: Team[] = []): GameState {
  return {
    used: {},
    teams: teams.length > 0 ? teams : [
      { id: '1', name: 'Team 1', score: 0 },
      { id: '2', name: 'Team 2', score: 0 },
    ],
    activeTeamId: '1',
    currentRound: 1,
  };
}

export function slugify(input: string): string {
  return String(input ?? '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

// ==================== GAME PLAY STATISTICS ====================

/**
 * Load play statistics for all games
 */
export function loadPlayStats(): Record<string, GamePlayStats> {
  const raw = localStorage.getItem(PLAY_STATS_KEY);
  return safeJsonParse<Record<string, GamePlayStats>>(raw, {});
}

/**
 * Save play statistics for all games
 */
function savePlayStats(stats: Record<string, GamePlayStats>): void {
  localStorage.setItem(PLAY_STATS_KEY, JSON.stringify(stats));
}

/**
 * Record that a game was played (increments play count and updates lastPlayed)
 */
export function recordGamePlay(gameId: string): void {
  const stats = loadPlayStats();
  const now = Date.now();

  stats[gameId] = {
    lastPlayed: now,
    playCount: (stats[gameId]?.playCount || 0) + 1,
  };

  savePlayStats(stats);
}

/**
 * Get play statistics for a specific game
 */
export function getGamePlayStats(gameId: string): GamePlayStats | null {
  const stats = loadPlayStats();
  return stats[gameId] || null;
}

// ==================== GAME COMPLETION CALCULATION ====================

/**
 * Calculate the completion percentage of a game from its saved state
 * @returns { completed: number, total: number, percentage: number } or null
 */
export function calculateGameCompletion(gameId: string, game: Game | null): { completed: number; total: number; percentage: number } | null {
  const state = loadGameState(gameId);
  if (!state || !game) return null;

  // Count total clues across all categories
  let totalClues = 0;
  for (const cat of game.categories) {
    totalClues += cat.clues.length;
  }

  if (totalClues === 0) return null;

  // Count used clues
  const usedCount = Object.values(state.used).filter(v => v).length;

  return {
    completed: usedCount,
    total: totalClues,
    percentage: Math.round((usedCount / totalClues) * 100),
  };
}
