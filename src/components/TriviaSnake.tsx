import { useState, useEffect, useLayoutEffect, useRef, useCallback } from 'react';
import { X, Play, Pause, RotateCcw, Info, Worm, Volume2, VolumeX, ArrowRight, Check } from 'lucide-react';
import type { Team } from '@/lib/storage';
import { GameModeMenu, type GameMode } from '@/components/GameModeMenu';
import { buildSnakeOptions, type SnakeOption } from '@/lib/snakeOptions';
import { playSfx, isSfxMuted, setSfxMuted } from '@/lib/sfx';
import { teamColor } from '@/lib/teamColors';

interface TriviaSnakeProps {
  isOpen: boolean;
  categories: Array<{ title: string; clues: Array<{ value: number; clue: string; response: string }> }>;
  currentCategoryIndex: number;
  currentValue: number;
  currentClue: string;
  currentResponse: string;
  teams: Team[];
  activeTeamId: string;
  currentMode: GameMode;
  onClose: () => void;
  onGameComplete: (wasCorrect: boolean, teamId: string) => void;
  onModeChange?: (mode: GameMode) => void;
}

interface Position {
  x: number;
  y: number;
}

interface Apple {
  position: Position;
  label: string;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  color: string;
  size: number;
}

type Status = 'ready' | 'countdown' | 'playing' | 'paused' | 'won' | 'lost';
type Result =
  | { kind: 'correct'; label: string; response: string }
  | { kind: 'wrong'; label: string; response: string }
  | { kind: 'crash' };

// A-E are chosen to stay clear of the neon-green snake and of each other.
const LETTER_STYLES: Record<string, { bg: string; fg: string }> = {
  A: { bg: '#4f8cff', fg: '#ffffff' },
  B: { bg: '#ff8a3d', fg: '#1d0d00' },
  C: { bg: '#ffd23f', fg: '#241a00' },
  D: { bg: '#22d3ee', fg: '#03222a' },
  E: { bg: '#f43f9e', fg: '#ffffff' },
};

const BOARD_SIZE = 20;
const FRAME = 12; // frame border + glow room around the board, in px
const WON_DELAY = 2600;
const WRONG_DELAY = 3200;
const DISPLAY = "'Anton', 'Arial Narrow', sans-serif";

const getSpeedForValue = (value: number): number =>
  ({ 200: 200, 400: 175, 600: 150, 800: 125, 1000: 100 } as Record<number, number>)[value] || 150;

const getSnakeLengthForValue = (value: number): number =>
  ({ 200: 6, 400: 8, 600: 10, 800: 12, 1000: 14 } as Record<number, number>)[value] || 6;

const SNAKE_HEAD_START: Position = { x: 15, y: 10 };

const makeSnake = (value: number): Position[] =>
  Array.from({ length: getSnakeLengthForValue(value) }, (_, i) => ({
    x: SNAKE_HEAD_START.x - i,
    y: SNAKE_HEAD_START.y,
  }));

function placeApples(labels: string[], snake: Position[]): Apple[] {
  const used = new Set<string>();
  const mark = (p: Position, r: number) => {
    for (let dx = -r; dx <= r; dx++) {
      for (let dy = -r; dy <= r; dy++) {
        used.add(`${p.x + dx},${p.y + dy}`);
      }
    }
  };
  snake.forEach((s) => mark(s, 1));
  // Keep the snake's first few moves clear.
  for (let i = 1; i <= 4; i++) mark({ x: (SNAKE_HEAD_START.x + i) % BOARD_SIZE, y: SNAKE_HEAD_START.y }, 1);

  return labels.map((label) => {
    let position: Position = { x: 1, y: 1 };
    for (let attempt = 0; attempt < 300; attempt++) {
      const candidate = {
        x: 1 + Math.floor(Math.random() * (BOARD_SIZE - 2)),
        y: 1 + Math.floor(Math.random() * (BOARD_SIZE - 2)),
      };
      if (!used.has(`${candidate.x},${candidate.y}`)) {
        position = candidate;
        break;
      }
    }
    mark(position, 1);
    return { position, label };
  });
}

export function TriviaSnake({
  isOpen,
  categories,
  currentCategoryIndex,
  currentValue,
  currentClue,
  currentResponse,
  teams,
  activeTeamId,
  currentMode,
  onClose,
  onGameComplete,
  onModeChange,
}: TriviaSnakeProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const boardWrapRef = useRef<HTMLDivElement>(null);

  // UI state
  const [options, setOptions] = useState<SnakeOption[]>([]);
  const [gameStatus, setGameStatus] = useState<Status>('ready');
  const [result, setResult] = useState<Result | null>(null);
  const [count, setCount] = useState(3);
  const [showInfo, setShowInfo] = useState(false);
  const [selectedTeamId, setSelectedTeamId] = useState(activeTeamId);
  const [muted, setMuted] = useState(() => isSfxMuted());
  const [cell, setCell] = useState(25);

  // Gameplay refs (no React re-renders in the hot path)
  const statusRef = useRef<Status>('ready');
  const optionsRef = useRef<SnakeOption[]>([]);
  const snakeRef = useRef<Position[]>(makeSnake(currentValue));
  const applesRef = useRef<Apple[]>([]);
  const directionRef = useRef<Position>({ x: 1, y: 0 }); // direction of the last move
  const dirQueueRef = useRef<Position[]>([]); // buffered turns, applied one per tick
  const lastTickRef = useRef(0);
  const particlesRef = useRef<Particle[]>([]);
  const shakeRef = useRef({ intensity: 0, duration: 0 });
  const cellRef = useRef(25);
  const dprRef = useRef(1);
  const reducedRef = useRef(false);
  const completedRef = useRef(false);
  const resultRef = useRef<Result | null>(null);
  const completionTimerRef = useRef<number | undefined>(undefined);
  const countdownTimerRef = useRef<number | undefined>(undefined);

  // Always-fresh props for callbacks created once
  const latest = useRef({ onClose, onGameComplete, selectedTeamId, currentResponse, currentValue });
  latest.current = { onClose, onGameComplete, selectedTeamId, currentResponse, currentValue };

  const setStatus = useCallback((s: Status) => {
    statusRef.current = s;
    setGameStatus(s);
  }, []);

  const clearTimers = useCallback(() => {
    window.clearTimeout(completionTimerRef.current);
    window.clearInterval(countdownTimerRef.current);
    completionTimerRef.current = undefined;
    countdownTimerRef.current = undefined;
  }, []);

  // Respect prefers-reduced-motion for shake / particles / pulsing
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    reducedRef.current = mq.matches;
    const onChange = (e: MediaQueryListEvent) => {
      reducedRef.current = e.matches;
    };
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  // Stable signature so a fresh `categories` array identity never reshuffles mid-game
  const optionsSignature =
    (categories[currentCategoryIndex]?.clues ?? []).map((c) => c.response).join('\u0001') + '\u0002' + currentResponse;

  // Build options + apples when the round opens
  useEffect(() => {
    clearTimers();
    if (!isOpen || !categories[currentCategoryIndex]) return;

    const built = buildSnakeOptions(categories, currentCategoryIndex, currentResponse);
    optionsRef.current = built;
    setOptions(built);

    const snake = makeSnake(currentValue);
    snakeRef.current = snake;
    applesRef.current = placeApples(built.map((o) => o.label), snake);
    directionRef.current = { x: 1, y: 0 };
    dirQueueRef.current = [];
    particlesRef.current = [];
    shakeRef.current = { intensity: 0, duration: 0 };
    completedRef.current = false;
    resultRef.current = null;
    setResult(null);
    setStatus('ready');
    setSelectedTeamId(activeTeamId);
    return clearTimers;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, currentCategoryIndex, currentValue, optionsSignature]);

  // Fit the board to the available space: whole cells, square, crisp on hi-dpi
  useLayoutEffect(() => {
    if (!isOpen) return;
    const el = boardWrapRef.current;
    if (!el) return;
    const measure = () => {
      const side = Math.min(el.clientWidth, el.clientHeight) - FRAME * 2;
      const next = Math.max(12, Math.floor(side / BOARD_SIZE));
      cellRef.current = next;
      dprRef.current = Math.min(2, window.devicePixelRatio || 1);
      setCell(next);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [isOpen]);

  // ---------------------------------------------------------------- effects
  const createParticles = useCallback((x: number, y: number, color: string, n: number) => {
    if (reducedRef.current) return;
    const k = cellRef.current / 25;
    for (let i = 0; i < n; i++) {
      const angle = (Math.PI * 2 * i) / n + Math.random() * 0.5;
      const speed = (2 + Math.random() * 3) * k;
      particlesRef.current.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 1,
        color,
        size: (3 + Math.random() * 4) * k,
      });
    }
  }, []);

  const createConfetti = useCallback(() => {
    if (reducedRef.current) return;
    const size = BOARD_SIZE * cellRef.current;
    const k = cellRef.current / 25;
    const colors = ['#ff6b6b', '#ffd93d', '#39ff88', '#4d96ff', '#ff6fff', '#ffffff'];
    for (let i = 0; i < 110; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = (3 + Math.random() * 8) * k;
      particlesRef.current.push({
        x: size / 2,
        y: size / 2,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 2 * k,
        life: 1.5 + Math.random() * 0.5,
        color: colors[Math.floor(Math.random() * colors.length)],
        size: (5 + Math.random() * 8) * k,
      });
    }
  }, []);

  const shake = useCallback((intensity: number, duration: number) => {
    if (reducedRef.current) return;
    shakeRef.current = { intensity, duration };
  }, []);

  // ---------------------------------------------------------------- render
  const render = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    const c = cellRef.current;
    const dpr = dprRef.current;
    const size = BOARD_SIZE * c;
    const now = performance.now();
    const reduced = reducedRef.current;
    const status = statusRef.current;
    const k = c / 25;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    let shakeX = 0;
    let shakeY = 0;
    if (shakeRef.current.duration > 0) {
      shakeX = (Math.random() - 0.5) * shakeRef.current.intensity * 2 * k;
      shakeY = (Math.random() - 0.5) * shakeRef.current.intensity * 2 * k;
      shakeRef.current.duration = Math.max(0, shakeRef.current.duration - 16);
    }

    ctx.save();
    ctx.translate(shakeX, shakeY);

    // Backdrop + aligned grid
    const bg = ctx.createLinearGradient(0, 0, size, size);
    bg.addColorStop(0, '#0e0628');
    bg.addColorStop(1, '#06121f');
    ctx.fillStyle = bg;
    ctx.fillRect(-20, -20, size + 40, size + 40);

    ctx.strokeStyle = 'rgba(140, 112, 255, 0.14)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 0; i <= BOARD_SIZE; i++) {
      ctx.moveTo(i * c + 0.5, 0);
      ctx.lineTo(i * c + 0.5, size);
      ctx.moveTo(0, i * c + 0.5);
      ctx.lineTo(size, i * c + 0.5);
    }
    ctx.stroke();

    // Snake (tail first so the head sits on top)
    const snake = snakeRef.current;
    const dir = directionRef.current;
    for (let index = snake.length - 1; index >= 0; index--) {
      const seg = snake[index];
      const x = seg.x * c;
      const y = seg.y * c;
      const isHead = index === 0;
      const t = index / Math.max(1, snake.length - 1);

      ctx.shadowColor = '#39ff88';
      ctx.shadowBlur = (isHead ? 0.9 : 0.55) * c * (1 - t * 0.5);
      ctx.fillStyle = isHead ? '#7dffb0' : `hsl(${146 - t * 8}, 88%, ${52 - t * 20}%)`;
      ctx.beginPath();
      ctx.roundRect(x + c * 0.06, y + c * 0.06, c * 0.88, c * 0.88, isHead ? c * 0.3 : c * 0.2);
      ctx.fill();
      ctx.shadowBlur = 0;

      if (isHead) {
        const off = c * 0.26;
        const er = c * 0.16;
        let lx: number, ly: number, rx: number, ry: number;
        if (dir.x === 1) {
          lx = x + c - off; ly = y + off; rx = lx; ry = y + c - off;
        } else if (dir.x === -1) {
          lx = x + off; ly = y + off; rx = lx; ry = y + c - off;
        } else if (dir.y === -1) {
          lx = x + off; ly = y + off; rx = x + c - off; ry = ly;
        } else {
          lx = x + off; ly = y + c - off; rx = x + c - off; ry = ly;
        }
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(lx, ly, er, 0, Math.PI * 2);
        ctx.arc(rx, ry, er, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#10051f';
        ctx.beginPath();
        ctx.arc(lx + dir.x * er * 0.35, ly + dir.y * er * 0.35, er * 0.55, 0, Math.PI * 2);
        ctx.arc(rx + dir.x * er * 0.35, ry + dir.y * er * 0.35, er * 0.55, 0, Math.PI * 2);
        ctx.fill();

        if (status === 'won' || status === 'lost') {
          ctx.strokeStyle = '#10051f';
          ctx.lineWidth = Math.max(1.5, c * 0.07);
          ctx.beginPath();
          if (status === 'won') ctx.arc(x + c / 2, y + c * 0.55, c * 0.17, 0.1 * Math.PI, 0.9 * Math.PI);
          else ctx.arc(x + c / 2, y + c * 0.78, c * 0.15, 1.1 * Math.PI, 1.9 * Math.PI);
          ctx.stroke();
        }
      }
    }

    // Answer apples
    const eaten = resultRef.current && resultRef.current.kind !== 'crash' ? resultRef.current.label : null;
    applesRef.current.forEach((apple, i) => {
      if (apple.label === eaten) return;
      const style = LETTER_STYLES[apple.label] ?? { bg: '#ef4444', fg: '#fff' };
      const cx = apple.position.x * c + c / 2;
      const cy = apple.position.y * c + c / 2;
      const pulse = reduced ? 0 : Math.sin(now / 320 + i * 1.3) * 0.035;
      const r = c * (0.43 + pulse);

      ctx.shadowColor = style.bg;
      ctx.shadowBlur = c * 0.9;
      ctx.fillStyle = style.bg;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;

      ctx.lineWidth = Math.max(1.5, c * 0.07);
      ctx.strokeStyle = 'rgba(255,255,255,0.85)';
      ctx.stroke();

      ctx.fillStyle = style.fg;
      ctx.font = `${Math.round(c * 0.6)}px ${DISPLAY}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(apple.label, cx, cy + c * 0.04);
    });

    // Particles
    particlesRef.current = particlesRef.current.filter((p) => {
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.1 * k;
      p.life -= 0.02;
      return p.life > 0;
    });
    for (const p of particlesRef.current) {
      ctx.globalAlpha = Math.min(1, p.life);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, Math.max(0.5, p.size * Math.min(1, p.life)), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // Wrong-answer red flash
    if (status === 'lost' && !reduced && shakeRef.current.duration > 100) {
      ctx.fillStyle = 'rgba(255, 40, 70, 0.22)';
      ctx.fillRect(0, 0, size, size);
    }

    ctx.restore();
  }, []);

  // ------------------------------------------------------------- game logic
  const complete = useCallback(() => {
    if (completedRef.current) return;
    const r = resultRef.current;
    if (!r || r.kind === 'crash') return;
    completedRef.current = true;
    window.clearTimeout(completionTimerRef.current);
    const { onGameComplete: done, onClose: close, selectedTeamId: team } = latest.current;
    done(r.kind === 'correct', team);
    close();
  }, []);

  const finishRound = useCallback(
    (r: Result, eatenAt?: Position) => {
      resultRef.current = r;
      setResult(r);
      const c = cellRef.current;
      const px = eatenAt ? eatenAt.x * c + c / 2 : (BOARD_SIZE * c) / 2;
      const py = eatenAt ? eatenAt.y * c + c / 2 : (BOARD_SIZE * c) / 2;

      if (r.kind === 'correct') {
        setStatus('won');
        createParticles(px, py, LETTER_STYLES[r.label]?.bg ?? '#39ff88', 24);
        createConfetti();
        shake(3, 200);
        playSfx('correct');
        window.setTimeout(() => playSfx('fanfare'), 260);
        completionTimerRef.current = window.setTimeout(complete, WON_DELAY);
      } else if (r.kind === 'wrong') {
        setStatus('lost');
        createParticles(px, py, '#ff3b5c', 26);
        shake(8, 320);
        playSfx('incorrect');
        completionTimerRef.current = window.setTimeout(complete, WRONG_DELAY);
      } else {
        setStatus('lost');
        createParticles(px, py, '#ff9f43', 18);
        shake(6, 260);
        playSfx('incorrect');
      }
    },
    [setStatus, createParticles, createConfetti, shake, complete],
  );

  const gameTick = useCallback(() => {
    const snake = snakeRef.current;
    if (dirQueueRef.current.length) directionRef.current = dirQueueRef.current.shift()!;
    const d = directionRef.current;

    const head = {
      x: (snake[0].x + d.x + BOARD_SIZE) % BOARD_SIZE,
      y: (snake[0].y + d.y + BOARD_SIZE) % BOARD_SIZE,
    };

    // The tail cell is vacated this tick, so it is safe to move into
    if (snake.slice(0, -1).some((s) => s.x === head.x && s.y === head.y)) {
      snakeRef.current = [head, ...snake.slice(0, -1)];
      finishRound({ kind: 'crash' }, head);
      return;
    }

    const apple = applesRef.current.find((a) => a.position.x === head.x && a.position.y === head.y);
    snakeRef.current = [head, ...snake.slice(0, -1)];
    if (!apple) return;

    const option = optionsRef.current.find((o) => o.label === apple.label);
    if (!option) return;
    finishRound(
      { kind: option.isCorrect ? 'correct' : 'wrong', label: option.label, response: option.response },
      head,
    );
  }, [finishRound]);

  // One always-on animation loop while open; logic ticks only while playing
  useEffect(() => {
    if (!isOpen) return;
    const speed = getSpeedForValue(currentValue);
    let raf = 0;
    const loop = (t: number) => {
      if (statusRef.current === 'playing' && t - lastTickRef.current >= speed) {
        gameTick();
        lastTickRef.current = t;
      }
      render();
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [isOpen, currentValue, gameTick, render]);

  // ---------------------------------------------------------------- controls
  const resetRound = useCallback(() => {
    clearTimers();
    snakeRef.current = makeSnake(latest.current.currentValue);
    directionRef.current = { x: 1, y: 0 };
    dirQueueRef.current = [];
    particlesRef.current = [];
    shakeRef.current = { intensity: 0, duration: 0 };
    completedRef.current = false;
    resultRef.current = null;
    setResult(null);
  }, [clearTimers]);

  const beginPlaying = useCallback(() => {
    lastTickRef.current = performance.now();
    setStatus('playing');
  }, [setStatus]);

  const startGame = useCallback(() => {
    resetRound();
    (document.activeElement as HTMLElement | null)?.blur?.();
    setCount(3);
    setStatus('countdown');
    playSfx('tick');
    let n = 3;
    countdownTimerRef.current = window.setInterval(() => {
      n -= 1;
      if (n > 0) {
        setCount(n);
        playSfx('tick');
      } else {
        window.clearInterval(countdownTimerRef.current);
        playSfx('select');
        beginPlaying();
      }
    }, 650);
  }, [resetRound, setStatus, beginPlaying]);

  const togglePause = useCallback(() => {
    if (statusRef.current === 'playing') {
      setStatus('paused');
    } else if (statusRef.current === 'paused') {
      beginPlaying();
    }
  }, [setStatus, beginPlaying]);

  const toggleMute = useCallback(() => {
    const next = !isSfxMuted();
    setSfxMuted(next);
    setMuted(next);
  }, []);

  const queueTurn = useCallback((next: Position) => {
    const q = dirQueueRef.current;
    const ref = q.length ? q[q.length - 1] : directionRef.current;
    if (next.x === ref.x && next.y === ref.y) return; // same direction
    if (next.x === -ref.x && next.y === -ref.y) return; // no 180s
    if (q.length < 3) q.push(next);
  }, []);

  // Keyboard: arrows + WASD, Space/Enter, Escape, i, m
  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;

      const status = statusRef.current;
      const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      const pending = resultRef.current && resultRef.current.kind !== 'crash' && !completedRef.current;

      switch (key) {
        case 'ArrowUp':
        case 'w':
          e.preventDefault();
          queueTurn({ x: 0, y: -1 });
          break;
        case 'ArrowDown':
        case 's':
          e.preventDefault();
          queueTurn({ x: 0, y: 1 });
          break;
        case 'ArrowLeft':
        case 'a':
          e.preventDefault();
          queueTurn({ x: -1, y: 0 });
          break;
        case 'ArrowRight':
        case 'd':
          e.preventDefault();
          queueTurn({ x: 1, y: 0 });
          break;
        case 'i':
          e.preventDefault();
          setShowInfo((prev) => !prev);
          break;
        case 'm':
          e.preventDefault();
          toggleMute();
          break;
        case ' ':
        case 'Enter':
          e.preventDefault();
          if (showInfo) setShowInfo(false);
          else if (pending) complete();
          else if (status === 'ready' || (status === 'lost' && resultRef.current?.kind === 'crash')) startGame();
          else if (key === ' ' && (status === 'playing' || status === 'paused')) togglePause();
          else if (key === 'Enter' && status === 'paused') togglePause();
          break;
        case 'Escape':
          e.preventDefault();
          if (showInfo) setShowInfo(false);
          else if (pending) complete();
          else latest.current.onClose();
          break;
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, showInfo, queueTurn, toggleMute, complete, startGame, togglePause]);

  useEffect(() => clearTimers, [clearTimers]);

  if (!isOpen) return null;

  const category = categories[currentCategoryIndex];
  const boardPx = BOARD_SIZE * cell;
  const selectedTeam = teams.find((t) => t.id === selectedTeamId);
  const roundOver = gameStatus === 'won' || (gameStatus === 'lost' && result?.kind === 'wrong');
  const correctOption = options.find((o) => o.isCorrect);
  const teamsLocked = gameStatus === 'countdown' || gameStatus === 'playing' || roundOver;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Trivia Snake bonus round"
      className="fixed inset-0 z-50 flex h-dvh w-screen flex-col overflow-hidden text-white"
      style={{
        background:
          'radial-gradient(1100px 600px at 12% -10%, rgba(244,63,158,0.22), transparent 60%), radial-gradient(900px 600px at 100% 110%, rgba(34,211,238,0.16), transparent 60%), #070313',
        fontFamily: "'Public Sans Variable', 'Public Sans', sans-serif",
      }}
    >
      <style>{`
        @keyframes snakePop { 0% { transform: scale(0.4); opacity: 0 } 60% { transform: scale(1.12); opacity: 1 } 100% { transform: scale(1) } }
        @keyframes snakeRise { from { transform: translateY(14px); opacity: 0 } to { transform: none; opacity: 1 } }
        @keyframes snakeDrain { from { transform: scaleX(1) } to { transform: scaleX(0) } }
        @keyframes snakeBlink { 0%, 100% { opacity: 1 } 50% { opacity: 0.45 } }
        .snake-pop { animation: snakePop 0.45s cubic-bezier(0.34, 1.56, 0.64, 1) both }
        .snake-rise { animation: snakeRise 0.4s ease-out both }
        .snake-blink { animation: snakeBlink 1.4s ease-in-out infinite }
        .snake-scan { background-image: repeating-linear-gradient(0deg, rgba(255,255,255,0.035) 0 1px, transparent 1px 3px) }
        .snake-focus:focus-visible { outline: 2px solid #39ff88; outline-offset: 2px }
        @media (prefers-reduced-motion: reduce) {
          .snake-pop, .snake-rise, .snake-blink { animation: none !important }
        }
      `}</style>

      {/* HUD */}
      <header className="flex h-16 shrink-0 items-center justify-between gap-4 px-6">
        <div className="flex min-w-0 items-center gap-4">
          <div
            className="flex items-center gap-2.5 rounded-xl px-3 py-1.5"
            style={{ background: 'rgba(57,255,136,0.08)', border: '1px solid rgba(57,255,136,0.35)', boxShadow: '0 0 24px rgba(57,255,136,0.18)' }}
          >
            <Worm className="h-6 w-6" style={{ color: '#39ff88', filter: 'drop-shadow(0 0 6px #39ff88)' }} />
            <span className="text-[26px] leading-none tracking-wide" style={{ fontFamily: DISPLAY, color: '#d8ffe8' }}>
              Trivia Snake
            </span>
          </div>
          <span
            className="rounded-full px-3 py-1 text-sm font-bold"
            style={{ background: 'rgba(244,63,158,0.16)', color: '#ff7fc2', border: '1px solid rgba(244,63,158,0.5)' }}
          >
            Bonus round
          </span>
          {category && (
            <span className="hidden truncate text-lg font-semibold text-white/70 xl:block">{category.title}</span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <span
            className="mr-2 text-[34px] leading-none"
            style={{ fontFamily: DISPLAY, color: '#ffd23f', textShadow: '0 0 16px rgba(255,210,63,0.55)' }}
            aria-label={`${currentValue} dollars`}
          >
            ${currentValue}
          </span>
          {onModeChange && (
            <GameModeMenu
              currentMode={currentMode}
              onModeChange={(mode) => {
                if (mode === 'regular') {
                  onClose();
                  onModeChange(mode);
                }
                // Snake selected: already in snake mode
              }}
            />
          )}
          <button
            onClick={toggleMute}
            className="snake-focus rounded-lg p-2 text-white/60 transition-colors hover:bg-white/10 hover:text-white"
            title={muted ? 'Sound off (M)' : 'Sound on (M)'}
            aria-label={muted ? 'Unmute sound' : 'Mute sound'}
          >
            {muted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
          </button>
          <button
            onClick={() => setShowInfo((v) => !v)}
            className="snake-focus rounded-lg p-2 text-white/60 transition-colors hover:bg-white/10 hover:text-white"
            title="How to play (I)"
            aria-label="How to play"
          >
            <Info className="h-5 w-5" />
          </button>
          <button
            onClick={onClose}
            className="snake-focus rounded-lg p-2 text-white/60 transition-colors hover:bg-white/10 hover:text-white"
            title="Close (Esc)"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </header>

      {/* Play area */}
      <main
        className="grid min-h-0 flex-1 gap-5 px-6 pb-5"
        style={{
          gridTemplateColumns: 'clamp(240px, 21vw, 440px) minmax(0, 1fr) clamp(240px, 21vw, 440px)',
          gridTemplateRows: 'minmax(0, 1fr)',
        }}
      >
        {/* Clue + team */}
        <section className="flex min-h-0 flex-col gap-4">
          <div
            className="flex min-h-0 flex-1 flex-col justify-center rounded-2xl p-6"
            style={{ background: 'rgba(255,255,255,0.045)', border: '1px solid rgba(140,112,255,0.35)', boxShadow: 'inset 0 0 40px rgba(140,112,255,0.08)' }}
          >
            <p
              className="overflow-auto font-bold leading-snug text-white"
              style={{ fontSize: 'clamp(18px, min(2.4vw, 3.4vh), 40px)', textWrap: 'balance' as React.CSSProperties['textWrap'] }}
            >
              {currentClue}
            </p>
          </div>

          <div className="shrink-0 rounded-2xl p-3" style={{ background: 'rgba(255,255,255,0.045)', border: '1px solid rgba(255,255,255,0.1)' }}>
            <p className="mb-2 px-1 text-sm font-semibold text-white/55">Playing</p>
            <div className={`grid gap-2 ${teams.length > 3 ? 'grid-cols-2' : 'grid-cols-1'}`}>
              {teams.map((team, i) => {
                const col = teamColor(i);
                const selected = team.id === selectedTeamId;
                return (
                  <button
                    key={team.id}
                    onClick={() => setSelectedTeamId(team.id)}
                    disabled={teamsLocked && !selected}
                    aria-pressed={selected}
                    className="snake-focus flex items-center justify-between gap-2 rounded-xl px-3 py-2 text-left transition-all disabled:opacity-40"
                    style={{
                      background: selected ? col.soft : 'rgba(255,255,255,0.04)',
                      border: `2px solid ${selected ? col.main : 'transparent'}`,
                      boxShadow: selected ? `0 0 18px ${col.soft}` : undefined,
                    }}
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: col.main }} />
                      <span className="truncate font-semibold" style={{ fontSize: 'clamp(14px, 1.1vw, 20px)' }}>{team.name}</span>
                    </span>
                    <span className="font-bold tabular-nums text-white/70" style={{ fontSize: 'clamp(13px, 1vw, 18px)' }}>${team.score}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex shrink-0 items-center justify-between gap-2 px-1 text-sm text-white/55">
            <span>Arrows or WASD to steer</span>
            {(gameStatus === 'playing' || gameStatus === 'paused') && (
              <button
                onClick={togglePause}
                className="snake-focus flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-1.5 font-semibold text-white hover:bg-white/20"
              >
                {gameStatus === 'paused' ? <Play size={15} /> : <Pause size={15} />}
                {gameStatus === 'paused' ? 'Resume' : 'Pause'}
              </button>
            )}
          </div>
        </section>

        {/* Board */}
        <div ref={boardWrapRef} className="relative flex min-h-0 min-w-0 items-center justify-center">
          <div
            className="relative shrink-0 overflow-hidden"
            style={{
              width: boardPx + 6,
              height: boardPx + 6,
              borderRadius: 14,
              border: '3px solid #8c70ff',
              boxShadow: '0 0 0 1px rgba(255,255,255,0.08), 0 0 36px rgba(140,112,255,0.55), 0 0 90px rgba(244,63,158,0.2)',
              background: '#07041a',
            }}
          >
            <canvas
              ref={canvasRef}
              width={boardPx * dprRef.current}
              height={boardPx * dprRef.current}
              style={{ width: boardPx, height: boardPx, display: 'block' }}
              aria-label="Snake game board"
            />
            <div className="snake-scan pointer-events-none absolute inset-0" />

            {/* Overlays */}
            {gameStatus === 'ready' && (
              <Overlay>
                <div className="snake-rise flex flex-col items-center gap-4 px-8 text-center">
                  <Worm className="h-12 w-12" style={{ color: '#39ff88', filter: 'drop-shadow(0 0 10px #39ff88)' }} />
                  <h2 className="leading-none" style={{ fontFamily: DISPLAY, fontSize: 'clamp(40px, 5.5vh, 76px)', color: '#d8ffe8', textShadow: '0 0 24px rgba(57,255,136,0.6)' }}>
                    Get ready
                  </h2>
                  <p className="max-w-sm font-semibold text-white/90" style={{ fontSize: 'clamp(16px, 2.2vh, 24px)' }}>
                    Eat the apple that holds the right answer.
                  </p>
                  <p className="max-w-sm text-white/55" style={{ fontSize: 'clamp(13px, 1.7vh, 18px)' }}>
                    One wrong apple ends the round.
                  </p>
                  <button
                    onClick={startGame}
                    className="snake-focus mt-1 flex items-center gap-2.5 rounded-xl px-8 py-3.5 font-extrabold transition-transform hover:scale-105"
                    style={{ background: '#39ff88', color: '#032a14', fontSize: 'clamp(17px, 2.2vh, 24px)', boxShadow: '0 0 30px rgba(57,255,136,0.55)' }}
                  >
                    <Play size={22} fill="currentColor" /> Start
                  </button>
                  <p className="text-sm text-white/45">or press Space</p>
                </div>
              </Overlay>
            )}

            {gameStatus === 'countdown' && (
              <Overlay light>
                <div key={count} className="snake-pop" style={{ fontFamily: DISPLAY, fontSize: 'clamp(110px, 22vh, 260px)', lineHeight: 1, color: '#ffd23f', textShadow: '0 0 40px rgba(255,210,63,0.7)' }}>
                  {count}
                </div>
              </Overlay>
            )}

            {gameStatus === 'paused' && (
              <Overlay>
                <div className="flex flex-col items-center gap-4">
                  <h2 className="snake-blink leading-none" style={{ fontFamily: DISPLAY, fontSize: 'clamp(44px, 6vh, 80px)', color: '#ffd23f' }}>Paused</h2>
                  <button
                    onClick={togglePause}
                    className="snake-focus flex items-center gap-2 rounded-xl bg-white/15 px-6 py-3 text-lg font-bold hover:bg-white/25"
                  >
                    <Play size={20} /> Resume
                  </button>
                  <p className="text-sm text-white/50">Space to resume</p>
                </div>
              </Overlay>
            )}

            {result && gameStatus !== 'ready' && gameStatus !== 'countdown' && gameStatus !== 'paused' && (
              <ResultOverlay
                result={result}
                teamName={selectedTeam?.name}
                correctOption={correctOption}
                onContinue={complete}
                onRetry={startGame}
                delay={result.kind === 'correct' ? WON_DELAY : WRONG_DELAY}
              />
            )}
          </div>
        </div>

        {/* Legend */}
        <section className="flex min-h-0 flex-col gap-3" aria-label="Answer choices">
          {options.map((option, i) => {
            const style = LETTER_STYLES[option.label];
            const chosen = result && result.kind !== 'crash' && result.label === option.label;
            const revealCorrect = roundOver && option.isCorrect;
            const dim = roundOver && !chosen && !revealCorrect;
            return (
              <div
                key={option.label}
                className="snake-rise flex min-h-0 flex-1 items-center gap-4 rounded-2xl pr-4 transition-opacity"
                style={{
                  animationDelay: `${i * 60}ms`,
                  background: `linear-gradient(90deg, ${style.bg}26, rgba(255,255,255,0.04) 60%)`,
                  border: `2px solid ${revealCorrect ? '#39ff88' : chosen ? '#ff3b5c' : `${style.bg}66`}`,
                  boxShadow: revealCorrect ? '0 0 26px rgba(57,255,136,0.55)' : chosen ? '0 0 22px rgba(255,59,92,0.5)' : undefined,
                  opacity: dim ? 0.38 : 1,
                }}
              >
                <div
                  className="grid aspect-square h-full max-h-[96px] min-h-[44px] shrink-0 place-items-center rounded-l-[14px]"
                  style={{ background: style.bg, color: style.fg, fontFamily: DISPLAY, fontSize: 'clamp(26px, 4.2vh, 48px)', boxShadow: `0 0 20px ${style.bg}88` }}
                >
                  {option.label}
                </div>
                <div
                  className="min-w-0 flex-1 overflow-hidden font-bold leading-tight text-white"
                  style={{ fontSize: 'clamp(15px, min(1.6vw, 2.6vh), 30px)' }}
                >
                  {option.response}
                </div>
                {revealCorrect && <Check className="h-6 w-6 shrink-0" style={{ color: '#39ff88' }} />}
              </div>
            );
          })}
        </section>
      </main>

      {/* How to play */}
      {showInfo && (
        <div className="absolute inset-0 z-20 grid place-items-center bg-black/75 p-6 backdrop-blur-sm" onClick={() => setShowInfo(false)}>
          <div
            className="relative w-full max-w-xl rounded-2xl p-8"
            style={{ background: '#120a2b', border: '2px solid #8c70ff', boxShadow: '0 0 60px rgba(140,112,255,0.4)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <button onClick={() => setShowInfo(false)} className="snake-focus absolute right-4 top-4 rounded-lg p-2 text-white/60 hover:bg-white/10 hover:text-white" aria-label="Close help">
              <X className="h-5 w-5" />
            </button>
            <h3 className="mb-5 text-4xl" style={{ fontFamily: DISPLAY, color: '#d8ffe8' }}>How to play</h3>
            <ul className="space-y-3 text-lg text-white/85">
              <li>Steer the snake into the apple whose letter matches the right answer.</li>
              <li>Arrow keys or WASD turn the snake. The board wraps around the edges.</li>
              <li><span className="font-bold" style={{ color: '#ff7a8f' }}>One wrong apple ends the round.</span> Running into yourself lets you retry.</li>
              <li>Space pauses, M mutes, Esc closes.</li>
            </ul>
            <p className="mt-5 text-white/55">Higher clue values mean a longer, faster snake: $200 is slowest, $1000 is fastest.</p>
          </div>
        </div>
      )}
    </div>
  );
}

function Overlay({ children, light = false }: { children: React.ReactNode; light?: boolean }) {
  return (
    <div
      className="absolute inset-0 z-10 grid place-items-center"
      style={{ background: light ? 'rgba(7,3,19,0.55)' : 'rgba(7,3,19,0.82)', backdropFilter: 'blur(2px)' }}
    >
      {children}
    </div>
  );
}

function ResultOverlay({
  result,
  teamName,
  correctOption,
  onContinue,
  onRetry,
  delay,
}: {
  result: Result;
  teamName?: string;
  correctOption?: SnakeOption;
  onContinue: () => void;
  onRetry: () => void;
  delay: number;
}) {
  const palette =
    result.kind === 'correct'
      ? { title: 'Correct!', color: '#39ff88', glow: 'rgba(57,255,136,0.65)' }
      : result.kind === 'wrong'
        ? { title: 'Wrong apple', color: '#ff4d6d', glow: 'rgba(255,77,109,0.6)' }
        : { title: 'Crunch!', color: '#ff9f43', glow: 'rgba(255,159,67,0.6)' };

  return (
    <div
      className="absolute inset-0 z-10 grid place-items-center"
      style={{ background: 'radial-gradient(circle at center, rgba(7,3,19,0.8), rgba(7,3,19,0.55))' }}
      aria-live="polite"
    >
      <div className="snake-pop flex max-w-[88%] flex-col items-center gap-3 text-center">
        <h2 className="leading-none" style={{ fontFamily: DISPLAY, fontSize: 'clamp(54px, 9vh, 120px)', color: palette.color, textShadow: `0 0 36px ${palette.glow}` }}>
          {palette.title}
        </h2>

        {result.kind === 'correct' && (
          <>
            <p className="font-bold text-white" style={{ fontSize: 'clamp(20px, 3vh, 34px)' }}>{result.response}</p>
            {teamName && <p className="text-white/65" style={{ fontSize: 'clamp(14px, 2vh, 22px)' }}>Nicely eaten, {teamName}.</p>}
          </>
        )}

        {result.kind === 'wrong' && (
          <>
            <p className="text-white/70" style={{ fontSize: 'clamp(14px, 2vh, 22px)' }}>
              You ate {result.label}: {result.response}
            </p>
            {correctOption && (
              <p className="font-bold text-white" style={{ fontSize: 'clamp(16px, 2.4vh, 28px)' }}>
                The answer was {correctOption.label}: <span style={{ color: '#39ff88' }}>{correctOption.response}</span>
              </p>
            )}
          </>
        )}

        {result.kind === 'crash' && (
          <p className="text-white/75" style={{ fontSize: 'clamp(15px, 2.2vh, 24px)' }}>The snake ran into itself.</p>
        )}

        <div className="mt-3 flex flex-col items-center gap-2">
          {result.kind === 'crash' ? (
            <button
              onClick={onRetry}
              className="snake-focus flex items-center gap-2 rounded-xl px-7 py-3 text-lg font-extrabold hover:scale-105"
              style={{ background: '#ff9f43', color: '#2a1400', boxShadow: '0 0 26px rgba(255,159,67,0.5)' }}
            >
              <RotateCcw size={20} /> Try again
            </button>
          ) : (
            <>
              <button
                onClick={onContinue}
                className="snake-focus flex items-center gap-2 rounded-xl px-7 py-3 text-lg font-extrabold hover:scale-105"
                style={{ background: palette.color, color: '#0a0316', boxShadow: `0 0 26px ${palette.glow}` }}
              >
                Show the answer <ArrowRight size={20} />
              </button>
              <div className="h-1 w-48 overflow-hidden rounded-full bg-white/15">
                <div
                  className="h-full origin-left"
                  style={{ background: palette.color, animation: `snakeDrain ${delay}ms linear forwards` }}
                />
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
