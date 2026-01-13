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

export type Game = {
  title: string;
  subtitle?: string;
  categories: Category[];
  rows?: number;
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
};

const CUSTOM_GAMES_KEY = 'jeop3:customGames:v1';
const STATE_PREFIX = 'jeop3:state:v2';
const SELECTED_GAME_KEY = 'jeop3:selectedGameId:v1';

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
      game: g.game ?? null,
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
