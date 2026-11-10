// Messages exchanged between the game window (the TV, the single source of truth) and the host
// window (a remote control that renders snapshots and sends commands). Everything is plain JSON
// text, so the same protocol can ride a WebSocket later (phones) without changing the screens.
import type { GameRules } from '@/lib/gameRules';
import type { ClueVerification } from '@/lib/ai/types';

export const PROTOCOL_VERSION = 1;
/** The host announces itself this often. */
export const HEARTBEAT_MS = 2000;
/** A host (or the TV) counts as gone after this long without hearing from it. */
export const PRESENCE_TIMEOUT_MS = 5000;

// ---------------------------------------------------------------- snapshot

export interface HostTeam {
  id: string;
  name: string;
  score: number;
}

export interface HostTile {
  value: number;
  used: boolean;
  /** Only ever set in the host snapshot: the TV never shows where the Daily Doubles are. */
  dailyDouble: boolean;
}

export interface HostBoard {
  rows: number;
  categories: { title: string; clues: (HostTile | null)[] }[];
}

export type HostDdPhase = 'splash' | 'wager' | 'play';

/** Clue-level state that only the clue screen knows. Published by ClueDialog. */
export interface HostClueRuntime {
  ddPhase: HostDdPhase | null;
  /** The locked Daily Double wager. */
  wager: number | null;
  wagerTeamId: string | null;
  wagerCap: number;
  /** The answer is showing on the TV. */
  revealed: boolean;
  judging: boolean;
  finished: boolean;
  settling: boolean;
  misses: { teamId: string; penalty: boolean }[];
  winnerId: string | null;
  inPlayId: string | null;
  timer: HostTimer | null;
}

export interface HostTimer {
  secondsLeft: number;
  total: number;
  paused: boolean;
  /** Held automatically because an answer is being judged. */
  held: boolean;
  expired: boolean;
}

export interface HostClue extends HostClueRuntime {
  c: number;
  r: number;
  category: string;
  value: number;
  clue: string;
  response: string;
  /** What the independent fact check relied on (rendered by ClueSources). */
  verification?: ClueVerification;
  dailyDouble: boolean;
}

export interface HostFinal {
  category: string;
  clue: string;
  response: string;
  /** The Final Jeopardy screen is open on the TV. */
  open: boolean;
  done: boolean;
}

export interface HostSnapshot {
  /** Null while no game is running in the main window. */
  game: {
    title: string;
    board: HostBoard;
    teams: HostTeam[];
    activeTeamId: string;
    rules: GameRules;
    canUndo: boolean;
    cluesLeft: number;
    final: HostFinal | null;
    /** A Trivia Snake round is open on the TV (the host cannot run it). */
    snakeOpen: boolean;
    clue: HostClue | null;
  } | null;
}

// ---------------------------------------------------------------- commands

export type HostCommand =
  | { type: 'openClue'; c: number; r: number }
  | { type: 'judge' }
  | { type: 'correct'; teamId: string }
  | { type: 'wrong'; teamId: string }
  | { type: 'nobody' }
  | { type: 'continue' }
  | { type: 'setAnswering'; teamId: string }
  | { type: 'timer'; action: 'pause' | 'resume' | 'add'; seconds?: number }
  | { type: 'ddWager'; amount: number }
  | { type: 'ddContinue' }
  | { type: 'closeClue' }
  | { type: 'undo' };

export const COMMAND_TYPES: HostCommand['type'][] = [
  'openClue', 'judge', 'correct', 'wrong', 'nobody', 'continue', 'setAnswering', 'timer',
  'ddWager', 'ddContinue', 'closeClue', 'undo',
];

// ---------------------------------------------------------------- messages

/** Sent by a host window. */
export type HostToTv =
  | { from: 'host'; kind: 'hello'; hostId: string }
  | { from: 'host'; kind: 'heartbeat'; hostId: string }
  | { from: 'host'; kind: 'bye'; hostId: string }
  | { from: 'host'; kind: 'command'; hostId: string; seq: number; command: HostCommand };

/** Sent by the game window. */
export type TvToHost =
  | { from: 'tv'; kind: 'snapshot'; snapshot: HostSnapshot }
  | { from: 'tv'; kind: 'beat' }
  /** A command or heartbeat from a host that is not the one in control. */
  | { from: 'tv'; kind: 'rejected'; hostId: string; reason: 'not-active' | 'no-host' };

export type LinkMessage = (HostToTv | TvToHost) & { v: number };

const HOST_KINDS = ['hello', 'heartbeat', 'bye', 'command'];
const TV_KINDS = ['snapshot', 'beat', 'rejected'];

export function encode(message: HostToTv | TvToHost): string {
  return JSON.stringify({ v: PROTOCOL_VERSION, ...message });
}

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x);
}

function isCommand(x: unknown): x is HostCommand {
  if (!isRecord(x) || typeof x.type !== 'string' || !COMMAND_TYPES.includes(x.type as HostCommand['type'])) return false;
  const num = (k: string) => typeof x[k] === 'number' && Number.isFinite(x[k] as number);
  const str = (k: string) => typeof x[k] === 'string' && (x[k] as string).length > 0;
  switch (x.type) {
    case 'openClue': return num('c') && num('r');
    case 'correct':
    case 'wrong':
    case 'setAnswering': return str('teamId');
    case 'timer':
      return (x.action === 'pause' || x.action === 'resume' || x.action === 'add') && (x.seconds === undefined || num('seconds'));
    case 'ddWager': return num('amount');
    default: return true;
  }
}

/** Parse and validate a message. Anything unknown, malformed or from another version is dropped (null). */
export function decode(raw: unknown): LinkMessage | null {
  let data: unknown = raw;
  if (typeof raw === 'string') {
    try {
      data = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (!isRecord(data) || data.v !== PROTOCOL_VERSION) return null;
  if (data.from === 'host') {
    if (typeof data.kind !== 'string' || !HOST_KINDS.includes(data.kind)) return null;
    if (typeof data.hostId !== 'string' || !data.hostId) return null;
    if (data.kind === 'command' && (typeof data.seq !== 'number' || !isCommand(data.command))) return null;
    return data as unknown as LinkMessage;
  }
  if (data.from === 'tv') {
    if (typeof data.kind !== 'string' || !TV_KINDS.includes(data.kind)) return null;
    if (data.kind === 'snapshot' && !isRecord(data.snapshot)) return null;
    if (data.kind === 'rejected' && typeof data.hostId !== 'string') return null;
    return data as unknown as LinkMessage;
  }
  return null;
}
