import type { CSSProperties } from 'react';
import type { GameMeta, GameState } from '@/lib/storage';
import type { Theme } from '@/lib/themes';
import { calculateGameCompletion, getGamePlayStats, loadGameState } from '@/lib/storage';

export type GameStatus = 'new' | 'inProgress' | 'done';

export interface GameSummary {
  id: string;
  title: string;
  subtitle: string;
  categoryTitles: string[];
  /** Clue values per row, taken from the first category that has a full set. */
  rowValues: number[];
  rows: number;
  clueCount: number;
  difficulty?: 'easy' | 'normal' | 'hard';
  status: GameStatus;
  completed: number;
  percent: number;
  used: Record<string, boolean>;
  lastPlayed: number | null;
  playCount: number;
  hue: number;
}

/** Stable 0-359 hue from a string, so every game keeps its own "box art" colour. */
export function hueFromString(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h) % 360;
}

export function summarizeGame(meta: GameMeta, savedState?: GameState | null): GameSummary {
  const game = meta.game;
  const categories = game?.categories ?? [];
  const rows = Math.max(game?.rows ?? 0, ...categories.map((c) => c.clues?.length ?? 0), 0);
  const clueCount = categories.reduce((sum, c) => sum + (c.clues?.length ?? 0), 0);
  const valueSource = categories.find((c) => (c.clues?.length ?? 0) === rows) ?? categories[0];
  const rowValues = (valueSource?.clues ?? []).map((c) => c.value);

  const state = savedState === undefined ? loadGameState(meta.id) : savedState;
  const used = state?.used ?? {};
  const completion = calculateGameCompletion(meta.id, game ?? null);
  const hasProgress = Object.values(used).some(Boolean);
  const percent = completion?.percentage ?? 0;
  const status: GameStatus = !hasProgress ? 'new' : percent >= 100 ? 'done' : 'inProgress';
  const stats = getGamePlayStats(meta.id);

  return {
    id: meta.id,
    title: meta.title,
    subtitle: meta.subtitle ?? '',
    categoryTitles: categories.map((c) => c.title),
    rowValues,
    rows,
    clueCount,
    difficulty: game?.metadata?.difficulty,
    status,
    completed: completion?.completed ?? 0,
    percent,
    used,
    lastPlayed: stats?.lastPlayed ?? null,
    playCount: stats?.playCount ?? 0,
    hue: hueFromString(meta.id),
  };
}

export function timeAgo(ts: number | null): string | null {
  if (!ts) return null;
  const diff = Date.now() - ts;
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} hr ago`;
  const day = Math.floor(hr / 24);
  if (day === 1) return 'yesterday';
  if (day < 30) return `${day} days ago`;
  const mo = Math.floor(day / 30);
  if (mo < 12) return `${mo} mo ago`;
  return 'over a year ago';
}

/** Pick dark or white text, whichever reads better on the given #rrggbb. */
export function readableOn(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return '#ffffff';
  const n = parseInt(m[1], 16);
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  const L = 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
  const darkContrast = (L + 0.05) / (0.01 + 0.05);
  const whiteContrast = 1.05 / (L + 0.05);
  return darkContrast >= whiteContrast ? '#15110a' : '#ffffff';
}

/** Theme colours as the custom properties lobby.css reads. */
export function lobbyVars(theme: Theme): CSSProperties {
  return {
    ['--lb-primary' as string]: theme.primary,
    ['--lb-secondary' as string]: theme.secondary,
    ['--lb-accent' as string]: theme.accent,
    ['--lb-gold' as string]: theme.gold,
    ['--lb-success' as string]: '#4ade80',
    ['--lb-bg0' as string]: theme.bgStart,
    ['--lb-bg1' as string]: theme.bgMid,
    ['--lb-on-accent' as string]: readableOn(theme.accent),
  };
}
