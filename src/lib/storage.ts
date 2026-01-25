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
  // Creation Info
  modelUsed?: string;  // e.g., "Gemini 3 Flash Preview"
  generatedAt?: string;  // ISO timestamp
  generationTimeMs?: number;  // Time taken to generate in milliseconds

  // Source/Mode Info
  sourceMode?: 'scratch' | 'topic' | 'content' | 'url' | 'custom';  // How the game was created
  sourceMaterial?: string;  // For topic/content/url mode: the topic, URL, or content preview
  customSources?: Array<{  // For custom mode: list of sources used
    type: 'topic' | 'paste' | 'url';
    content: string;  // Topic, URL, or content preview
  }>;
  difficulty?: 'easy' | 'normal' | 'hard';
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

export type GameVisibility = 'public' | 'private';

// Admin email - hardcoded for now, could be env variable later
export const ADMIN_EMAIL = 'markcdarby@gmail.com';

export type GameMeta = {
  id: string;
  title: string;
  subtitle?: string;
  source: 'index' | 'custom';
  path?: string;
  game?: Game;
  createdAt?: string;  // ISO timestamp for sorting
  createdBy?: string;   // Email of user who created the game
  visibility?: GameVisibility; // 'public' or 'private' (default: 'private' for user-created games, 'public' for index games)
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
      createdAt: g.createdAt,
      createdBy: g.createdBy,
      visibility: g.visibility ?? 'private', // Default to private for user-created games
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

// ==================== GAME PERMISSIONS & VISIBILITY ====================

/**
 * Check if a user is an admin
 */
export function isAdmin(email: string | null | undefined): boolean {
  return email?.toLowerCase() === ADMIN_EMAIL.toLowerCase();
}

/**
 * Check if a user can view a game
 * - Admin can view all games
 * - Users can view public games or their own private games
 * - Index games are always visible to everyone
 * - Games without createdBy (created before tracking) are treated as owned by current user
 */
export function canViewGame(game: GameMeta, userEmail: string | null): boolean {
  // Admin can see everything
  if (isAdmin(userEmail)) return true;

  // Index games are always public
  if (game.source === 'index') return true;

  // Public games are visible to everyone
  if (game.visibility === 'public') return true;

  // Private games are only visible to creator
  if (game.visibility === 'private') {
    // Backward compatibility: games without createdBy are treated as owned by current user
    const isMyGame = !game.createdBy || game.createdBy === userEmail;
    return isMyGame;
  }

  // Default: treat as private (don't show)
  return false;
}

/**
 * Check if a user can edit/delete a game
 * - Admin can edit all games
 * - Users can only edit their own games
 * - Index games cannot be edited by anyone (they're read-only)
 * - Games without createdBy (created before tracking) are treated as owned by current user
 */
export function canEditGame(game: GameMeta, userEmail: string | null): boolean {
  // Index games are read-only
  if (game.source === 'index') return false;

  // Admin can edit everything
  if (isAdmin(userEmail)) return true;

  // Users can only edit their own games
  // Backward compatibility: games without createdBy are treated as owned by current user
  return !game.createdBy || game.createdBy === userEmail;
}

/**
 * Update game visibility
 */
export function updateGameVisibility(gameId: string, games: GameMeta[], newVisibility: GameVisibility): GameMeta[] {
  return games.map(g =>
    g.id === gameId ? { ...g, visibility: newVisibility } : g
  );
}
