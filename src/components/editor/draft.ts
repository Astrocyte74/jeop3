/**
 * Editor drafts: a recoverable copy of the in-progress Game, kept in
 * localStorage while the editor has unsaved changes. A draft never touches the
 * saved game; it is deleted on Save/Discard and offered back on the next open.
 * Every storage call is wrapped so a blocked/full store degrades to "no draft".
 */
import type { Game } from '@/lib/storage';

/** Bump when the stored shape changes; old drafts are then ignored. */
export const DRAFT_VERSION = 1;
const KEY_PREFIX = 'jeop3:editorDraft:v1:';

export interface EditorDraft {
  v: number;
  /** Epoch ms of the write. */
  savedAt: number;
  game: Game;
}

export const draftKey = (gameId?: string | null): string => `${KEY_PREFIX}${gameId || 'new'}`;

export function writeDraft(gameId: string | null | undefined, game: Game): number | null {
  try {
    const savedAt = Date.now();
    const draft: EditorDraft = { v: DRAFT_VERSION, savedAt, game };
    localStorage.setItem(draftKey(gameId), JSON.stringify(draft));
    return savedAt;
  } catch {
    return null;
  }
}

export function readDraft(gameId: string | null | undefined): EditorDraft | null {
  try {
    const raw = localStorage.getItem(draftKey(gameId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<EditorDraft>;
    if (
      !parsed ||
      parsed.v !== DRAFT_VERSION ||
      typeof parsed.savedAt !== 'number' ||
      !parsed.game ||
      !Array.isArray(parsed.game.categories)
    ) {
      return null;
    }
    return parsed as EditorDraft;
  } catch {
    return null;
  }
}

export function clearDraft(gameId: string | null | undefined): void {
  try {
    localStorage.removeItem(draftKey(gameId));
  } catch {
    /* storage unavailable */
  }
}

/** "just now", "3 min ago", "2 h ago", "yesterday", or a short date. */
export function relativeTime(then: number, now: number = Date.now()): string {
  const sec = Math.max(0, Math.round((now - then) / 1000));
  if (sec < 10) return 'just now';
  if (sec < 60) return `${sec} s ago`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min} min ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr} h ago`;
  const day = Math.round(hr / 24);
  if (day === 1) return 'yesterday';
  if (day < 7) return `${day} days ago`;
  return new Date(then).toLocaleDateString();
}
