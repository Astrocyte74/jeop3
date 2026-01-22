import { useState, useEffect, useRef, useCallback } from 'react';
import { X, Play, Pause, RotateCcw, Info } from 'lucide-react';
import type { Team } from '@/lib/storage';
import { GameModeMenu, type GameMode } from '@/components/GameModeMenu';

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
  onCorrect: (teamId: string) => void;
  onIncorrect: (teamId: string) => void;
  onModeChange?: (mode: GameMode) => void;
}

interface Position {
  x: number;
  y: number;
}

interface Apple {
  position: Position;
  label: string; // "A", "B", "C", "D", or "E"
}

interface AnswerOption {
  label: string; // "A", "B", "C", "D", or "E"
  response: string;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number; // 0 to 1
  color: string;
  size: number;
}

// Color mapping for each letter
const LETTER_COLORS: Record<string, string> = {
  'A': '#3b82f6', // Blue
  'B': '#22c55e', // Green
  'C': '#f59e0b', // Amber
  'D': '#a855f7', // Purple
  'E': '#ec4899', // Pink
};

// Calculate game speed based on clue value (lower = faster)
const getSpeedForValue = (value: number): number => {
  const speeds: Record<number, number> = {
    200: 200,  // Slowest
    400: 175,
    600: 150,
    800: 125,
    1000: 100, // Fastest
  };
  return speeds[value] || 150;
};

// Calculate initial snake length based on clue value
const getSnakeLengthForValue = (value: number): number => {
  const lengths: Record<number, number> = {
    200: 6,
    400: 8,
    600: 10,
    800: 12,
    1000: 14,
  };
  return lengths[value] || 6;
};

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
  onCorrect,
  onIncorrect,
  onModeChange,
}: TriviaSnakeProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameLoopRef = useRef<number | undefined>(undefined);
  const lastUpdateTimeRef = useRef<number>(0);

  // Game state - ONLY for UI, not gameplay loop
  const [answerOptions, setAnswerOptions] = useState<AnswerOption[]>([]);
  const [gameStatus, setGameStatus] = useState<'ready' | 'playing' | 'won' | 'lost'>('ready');
  const [showInfo, setShowInfo] = useState(false);
  const [selectedTeamId, setSelectedTeamId] = useState(activeTeamId);

  // Gameplay refs - immediate updates, no React re-renders
  const directionRef = useRef<Position>({ x: 1, y: 0 });
  const lastDirectionRef = useRef<Position>({ x: 1, y: 0 }); // Prevent 180° turns
  const snakeRef = useRef<Position[]>(Array.from({ length: getSnakeLengthForValue(currentValue) }, (_, i) => ({ x: 5 - i, y: 5 })));
  const applesRef = useRef<Apple[]>([]);
  const eatenAppleLabelsRef = useRef<Set<string>>(new Set());

  // Visual effects refs
  const particlesRef = useRef<Particle[]>([]);
  const screenShakeRef = useRef<{ intensity: number; duration: number }>({ intensity: 0, duration: 0 });
  const backgroundOffsetRef = useRef<number>(0);

  // Board configuration
  const BOARD_SIZE = 20; // 20x20 grid
  const CELL_SIZE = 25; // pixels per cell

  // Helper: Create particle explosion
  const createParticles = useCallback((x: number, y: number, color: string, count: number = 15) => {
    const newParticles: Particle[] = [];
    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i) / count + Math.random() * 0.5;
      const speed = 2 + Math.random() * 3;
      newParticles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 1.0,
        color,
        size: 3 + Math.random() * 4,
      });
    }
    particlesRef.current = [...particlesRef.current, ...newParticles];
  }, []);

  // Helper: Trigger screen shake
  const triggerScreenShake = useCallback((intensity: number, duration: number) => {
    screenShakeRef.current = { intensity, duration };
  }, []);

  // Helper: Create confetti explosion
  const createConfetti = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    const colors = ['#ff6b6b', '#ffd93d', '#6bcb77', '#4d96ff', '#ff6fff', '#ffffff'];

    for (let i = 0; i < 100; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 3 + Math.random() * 8;
      const color = colors[Math.floor(Math.random() * colors.length)];
      particlesRef.current.push({
        x: centerX,
        y: centerY,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 2, // Slight upward bias
        life: 1.5 + Math.random() * 0.5, // Longer life for confetti
        color,
        size: 5 + Math.random() * 8,
      });
    }
  }, []);

  // Shuffle array function
  const shuffleArray = <T,>(array: T[]): T[] => {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  };

  // Initialize answer options and apples when game opens
  useEffect(() => {
    if (isOpen && categories[currentCategoryIndex]) {
      const category = categories[currentCategoryIndex];

      // Get all 5 responses from this category
      const allResponses = category.clues.map(c => c.response);

      // Shuffle and assign labels A-E
      const shuffledResponses = shuffleArray(allResponses);
      const labels = ['A', 'B', 'C', 'D', 'E'];
      const newAnswerOptions: AnswerOption[] = shuffledResponses.map((response, index) => ({
        label: labels[index],
        response,
      }));

      setAnswerOptions(newAnswerOptions);

      // Reset snake for new clue value (handles component reuse)
      const snakeLength = getSnakeLengthForValue(currentValue);
      snakeRef.current = Array.from({ length: snakeLength }, (_, i) => ({ x: 5 - i, y: 5 }));
      directionRef.current = { x: 1, y: 0 };
      lastDirectionRef.current = { x: 1, y: 0 };
      eatenAppleLabelsRef.current = new Set();
      setGameStatus('ready');
      setSelectedTeamId(activeTeamId);

      // Generate random apple positions anywhere on board
      const newApples: Apple[] = [];
      const usedPositions = new Set<string>();

      // Add ALL snake segments to avoid spawning on or near snake
      for (let i = 0; i < snakeLength; i++) {
        const seg = { x: 5 - i, y: 5 };
        // Mark the segment itself
        usedPositions.add(`${seg.x},${seg.y}`);
        // Mark buffer zone around segment (1 cell radius)
        for (let dx = -1; dx <= 1; dx++) {
          for (let dy = -1; dy <= 1; dy++) {
            const bx = seg.x + dx;
            const by = seg.y + dy;
            if (bx >= 0 && bx < BOARD_SIZE && by >= 0 && by < BOARD_SIZE) {
              usedPositions.add(`${bx},${by}`);
            }
          }
        }
      }

      labels.forEach((label) => {
        let position: Position;
        let placeAttempts = 0;
        do {
          // Random position anywhere on board (except edges)
          position = {
            x: 1 + Math.floor(Math.random() * (BOARD_SIZE - 2)),
            y: 1 + Math.floor(Math.random() * (BOARD_SIZE - 2)),
          };
          placeAttempts++;
        } while (usedPositions.has(`${position.x},${position.y}`) && placeAttempts < 100);

        usedPositions.add(`${position.x},${position.y}`);
        newApples.push({ position, label });
      });

      applesRef.current = newApples;
    }
  }, [isOpen, currentCategoryIndex, categories]);

  // Render game to canvas (imperative, no React re-renders)
  const render = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Update background offset for animation
    backgroundOffsetRef.current = (backgroundOffsetRef.current + 0.5) % CELL_SIZE;

    // Apply screen shake
    let shakeX = 0;
    let shakeY = 0;
    if (screenShakeRef.current.duration > 0) {
      shakeX = (Math.random() - 0.5) * screenShakeRef.current.intensity * 2;
      shakeY = (Math.random() - 0.5) * screenShakeRef.current.intensity * 2;
      screenShakeRef.current.duration -= 16; // Decrease by ~1 frame at 60fps
      if (screenShakeRef.current.duration < 0) {
        screenShakeRef.current.duration = 0;
      }
    }

    ctx.save();
    ctx.translate(shakeX, shakeY);

    // Clear canvas with animated gradient background
    const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
    gradient.addColorStop(0, '#1a1a2e');
    gradient.addColorStop(1, '#16213e');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw animated grid
    ctx.strokeStyle = '#2a2a4e';
    ctx.lineWidth = 0.5;
    for (let i = 0; i <= BOARD_SIZE; i++) {
      // Vertical lines with offset
      ctx.beginPath();
      ctx.moveTo(i * CELL_SIZE - backgroundOffsetRef.current, 0);
      ctx.lineTo(i * CELL_SIZE - backgroundOffsetRef.current, BOARD_SIZE * CELL_SIZE);
      ctx.stroke();
      // Horizontal lines with offset
      ctx.beginPath();
      ctx.moveTo(0, i * CELL_SIZE - backgroundOffsetRef.current);
      ctx.lineTo(BOARD_SIZE * CELL_SIZE, i * CELL_SIZE - backgroundOffsetRef.current);
      ctx.stroke();
    }

    // Update and draw particles
    particlesRef.current = particlesRef.current.filter(p => {
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.1; // Gravity
      p.life -= 0.02;
      return p.life > 0;
    });

    particlesRef.current.forEach(p => {
      ctx.globalAlpha = p.life;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.globalAlpha = 1;

    // Draw glow trail behind snake (older segments are more transparent)
    snakeRef.current.forEach((segment, index) => {
      const x = segment.x * CELL_SIZE;
      const y = segment.y * CELL_SIZE;
      const trailAlpha = 1 - (index / snakeRef.current.length) * 0.7;

      // Outer glow
      ctx.shadowColor = '#22c55e';
      ctx.shadowBlur = 15;
      ctx.fillStyle = `rgba(34, 197, 94, ${trailAlpha * 0.3})`;
      ctx.beginPath();
      ctx.arc(x + CELL_SIZE / 2, y + CELL_SIZE / 2, CELL_SIZE / 2 - 1, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    });

    // Draw snake with eyes that follow direction
    const direction = directionRef.current;
    snakeRef.current.forEach((segment, index) => {
      const x = segment.x * CELL_SIZE;
      const y = segment.y * CELL_SIZE;
      const isHead = index === 0;

      // Snake body
      ctx.fillStyle = isHead ? '#22c55e' : '#16a34a';
      ctx.beginPath();
      ctx.roundRect(x + 1, y + 1, CELL_SIZE - 2, CELL_SIZE - 2, isHead ? 6 : 4);
      ctx.fill();

      if (isHead) {
        // Calculate eye positions based on direction
        const eyeOffset = 6;
        const eyeSize = 4;
        let leftEyeX, leftEyeY, rightEyeX, rightEyeY;

        if (direction.x === 1) { // Right
          leftEyeX = x + CELL_SIZE - eyeOffset - 2;
          leftEyeY = y + eyeOffset;
          rightEyeX = x + CELL_SIZE - eyeOffset - 2;
          rightEyeY = y + CELL_SIZE - eyeOffset;
        } else if (direction.x === -1) { // Left
          leftEyeX = x + eyeOffset + 2;
          leftEyeY = y + eyeOffset;
          rightEyeX = x + eyeOffset + 2;
          rightEyeY = y + CELL_SIZE - eyeOffset;
        } else if (direction.y === -1) { // Up
          leftEyeX = x + eyeOffset;
          leftEyeY = y + eyeOffset + 2;
          rightEyeX = x + CELL_SIZE - eyeOffset;
          rightEyeY = y + eyeOffset + 2;
        } else { // Down
          leftEyeX = x + eyeOffset;
          leftEyeY = y + CELL_SIZE - eyeOffset - 2;
          rightEyeX = x + CELL_SIZE - eyeOffset;
          rightEyeY = y + CELL_SIZE - eyeOffset - 2;
        }

        // Eye whites
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(leftEyeX, leftEyeY, eyeSize, 0, Math.PI * 2);
        ctx.arc(rightEyeX, rightEyeY, eyeSize, 0, Math.PI * 2);
        ctx.fill();

        // Pupils
        ctx.fillStyle = '#000000';
        ctx.beginPath();
        ctx.arc(leftEyeX + direction.x, leftEyeY + direction.y, eyeSize / 2, 0, Math.PI * 2);
        ctx.arc(rightEyeX + direction.x, rightEyeY + direction.y, eyeSize / 2, 0, Math.PI * 2);
        ctx.fill();

        // Cute expression - tongue when happy (won)
        if (gameStatus === 'won') {
          ctx.strokeStyle = '#ff6b9d';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(x + CELL_SIZE / 2 - 3, y + CELL_SIZE - 4);
          ctx.quadraticCurveTo(x + CELL_SIZE / 2, y + CELL_SIZE + 2, x + CELL_SIZE / 2 + 3, y + CELL_SIZE - 4);
          ctx.stroke();
        }
        // Sad expression when lost
        if (gameStatus === 'lost') {
          ctx.strokeStyle = '#ff6b9d';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(x + CELL_SIZE / 2, y + CELL_SIZE / 2 + 2, 4, 0, Math.PI);
          ctx.stroke();
        }
      }
    });

    // Draw apples (just letters, skip eaten ones)
    applesRef.current.forEach(apple => {
      if (eatenAppleLabelsRef.current.has(apple.label)) return;

      const x = apple.position.x * CELL_SIZE;
      const y = apple.position.y * CELL_SIZE;

      // Glow effect on apples
      ctx.shadowColor = LETTER_COLORS[apple.label] || '#ef4444';
      ctx.shadowBlur = 10;
      ctx.fillStyle = LETTER_COLORS[apple.label] || '#ef4444';
      ctx.beginPath();
      ctx.arc(x + CELL_SIZE / 2, y + CELL_SIZE / 2, CELL_SIZE / 2 - 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;

      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 14px Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(apple.label, x + CELL_SIZE / 2, y + CELL_SIZE / 2);
    });

    // Red flash overlay when lost
    if (gameStatus === 'lost' && screenShakeRef.current.duration > 100) {
      ctx.fillStyle = 'rgba(255, 0, 0, 0.2)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    ctx.restore();
  }, [BOARD_SIZE, CELL_SIZE, gameStatus]);

  // Game tick - updates game logic (not rendering)
  const gameTick = useCallback(() => {
    const snake = snakeRef.current;
    const direction = directionRef.current;

    // Calculate new head position
    const newHead = {
      x: snake[0].x + direction.x,
      y: snake[0].y + direction.y,
    };

    // Wrap around board
    const wrappedHead = {
      x: (newHead.x + BOARD_SIZE) % BOARD_SIZE,
      y: (newHead.y + BOARD_SIZE) % BOARD_SIZE,
    };

    // Check if snake hits itself
    if (snake.some(seg => seg.x === wrappedHead.x && seg.y === wrappedHead.y)) {
      setGameStatus('lost');
      return;
    }

    // Check if snake eats an apple
    const eatenAppleIndex = applesRef.current.findIndex(
      apple => apple.position.x === wrappedHead.x && apple.position.y === wrappedHead.y
    );

    if (eatenAppleIndex !== -1) {
      const eatenApple = applesRef.current[eatenAppleIndex];

      // Skip if already eaten
      if (eatenAppleLabelsRef.current.has(eatenApple.label)) {
        snakeRef.current = [wrappedHead, ...snake.slice(0, -1)];
        return;
      }

      // Find the answer for this letter
      const selectedAnswer = answerOptions.find(opt => opt.label === eatenApple.label);

      if (selectedAnswer) {
        // Mark as eaten
        eatenAppleLabelsRef.current = new Set([...eatenAppleLabelsRef.current, eatenApple.label]);

        // Get pixel position for particle effects
        const pixelX = wrappedHead.x * CELL_SIZE + CELL_SIZE / 2;
        const pixelY = wrappedHead.y * CELL_SIZE + CELL_SIZE / 2;
        const appleColor = LETTER_COLORS[eatenApple.label] || '#ef4444';

        if (selectedAnswer.response === currentResponse) {
          // Correct answer - particles and confetti!
          createParticles(pixelX, pixelY, appleColor, 20);
          triggerScreenShake(3, 200); // Gentle shake
          createConfetti();
          setGameStatus('won');
          onCorrect(selectedTeamId);
          // Close immediately so feedback shows in parent ClueDialog at top of page
          setTimeout(() => onClose(), 500);
        } else {
          // Wrong answer - red flash and strong shake
          createParticles(pixelX, pixelY, '#ff0000', 25);
          triggerScreenShake(8, 300); // Strong shake
          setGameStatus('lost');
          onIncorrect(selectedTeamId);
          // Close immediately so feedback shows in parent ClueDialog at top of page
          setTimeout(() => onClose(), 500);
        }
        return;
      }

      // Grow snake
      snakeRef.current = [wrappedHead, ...snake];
    } else {
      // Move snake
      snakeRef.current = [wrappedHead, ...snake.slice(0, -1)];
    }
  }, [answerOptions, currentResponse, onCorrect, onIncorrect, onClose, BOARD_SIZE, selectedTeamId, createParticles, triggerScreenShake, createConfetti]);

  // Animation loop - smooth rendering with fixed timestep for logic
  useEffect(() => {
    if (gameStatus === 'playing') {
      const speed = getSpeedForValue(currentValue);
      const gracePeriod = 120; // 120ms grace period
      const startTime = performance.now();
      lastUpdateTimeRef.current = startTime;

      const animationLoop = (currentTime: number) => {
        // Stop if game ended
        if (gameStatus !== 'playing') return;

        const deltaTime = currentTime - lastUpdateTimeRef.current;
        const elapsedTime = currentTime - startTime;

        // Only update game logic after grace period and at fixed intervals
        if (elapsedTime >= gracePeriod && deltaTime >= speed) {
          gameTick();
          lastUpdateTimeRef.current = currentTime;
        }

        // Render every frame for smoothness
        render();

        gameLoopRef.current = requestAnimationFrame(animationLoop);
      };

      gameLoopRef.current = requestAnimationFrame(animationLoop);

      return () => {
        if (gameLoopRef.current) {
          cancelAnimationFrame(gameLoopRef.current);
        }
      };
    }
  }, [gameStatus, gameTick, render, currentValue]);

  // Game control functions
  const startGame = useCallback(() => {
    const length = getSnakeLengthForValue(currentValue);
    snakeRef.current = Array.from({ length }, (_, i) => ({ x: 5 - i, y: 5 }));
    directionRef.current = { x: 1, y: 0 };
    lastDirectionRef.current = { x: 1, y: 0 };
    eatenAppleLabelsRef.current = new Set();
    setGameStatus('playing');
  }, [currentValue]);

  const resetGame = useCallback(() => {
    const length = getSnakeLengthForValue(currentValue);
    snakeRef.current = Array.from({ length }, (_, i) => ({ x: 5 - i, y: 5 }));
    directionRef.current = { x: 1, y: 0 };
    lastDirectionRef.current = { x: 1, y: 0 };
    eatenAppleLabelsRef.current = new Set();
    setGameStatus('ready');
    render(); // Render initial state
  }, [currentValue, render]);

  // Keyboard controls - IMMEDIATE updates via ref
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;

      // Press 'i' to toggle info
      if (e.key === 'i' || e.key === 'I') {
        e.preventDefault();
        setShowInfo(prev => !prev);
        return;
      }

      const currentDir = lastDirectionRef.current;

      // Arrow keys for direction - prevent 180° turns and use ref for immediate updates
      switch (e.key) {
        case 'ArrowUp':
          e.preventDefault();
          if (currentDir.y === 0) {
            directionRef.current = { x: 0, y: -1 };
            lastDirectionRef.current = { x: 0, y: -1 };
          }
          break;
        case 'ArrowDown':
          e.preventDefault();
          if (currentDir.y === 0) {
            directionRef.current = { x: 0, y: 1 };
            lastDirectionRef.current = { x: 0, y: 1 };
          }
          break;
        case 'ArrowLeft':
          e.preventDefault();
          if (currentDir.x === 0) {
            directionRef.current = { x: -1, y: 0 };
            lastDirectionRef.current = { x: -1, y: 0 };
          }
          break;
        case 'ArrowRight':
          e.preventDefault();
          if (currentDir.x === 0) {
            directionRef.current = { x: 1, y: 0 };
            lastDirectionRef.current = { x: 1, y: 0 };
          }
          break;
        case ' ':
          e.preventDefault();
          if (gameStatus === 'ready' || gameStatus === 'lost') {
            startGame();
          } else if (gameStatus === 'playing') {
            resetGame();
          }
          break;
        case 'Escape':
          e.preventDefault();
          onClose();
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, gameStatus, onClose, startGame, resetGame]);

  // Initial render when game opens
  useEffect(() => {
    if (isOpen) {
      render();
    }
  }, [isOpen, render]);

  if (!isOpen) return null;

  return (
    <div className="clue-dialog-backdrop" onClick={onClose}>
      <div className="clue-dialog-card" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-2xl font-bold text-yellow-500">${currentValue}</span>
            <div className="flex items-center gap-2">
              <span className="text-2xl">🐍</span>
              <h2 className="text-lg font-semibold text-slate-300">Trivia Snake</h2>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {onModeChange && (
              <GameModeMenu
                currentMode={currentMode}
                onModeChange={(mode) => {
                  if (mode === 'regular') {
                    onClose();
                    onModeChange(mode);
                  }
                  // If snake is selected, we're already in snake mode, so do nothing
                }}
              />
            )}
            <button
              onClick={() => setShowInfo(!showInfo)}
              className="text-slate-400 hover:text-white transition-colors p-2"
              title="How to play (press 'i')"
            >
              <Info className="w-5 h-5" />
            </button>
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-white transition-colors p-2"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Instructions Modal */}
        {showInfo && (
          <div className="absolute inset-0 bg-slate-900/95 rounded-lg p-6 overflow-auto z-10">
            <button
              onClick={() => setShowInfo(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white transition-colors p-2"
            >
              <X className="w-5 h-5" />
            </button>
            <h3 className="text-xl font-bold text-white mb-4">How to Play</h3>
            <div className="text-slate-300 space-y-4">
              <div>
                <p className="font-semibold text-white mb-2">Controls:</p>
                <ul className="list-disc list-inside space-y-1 text-sm">
                  <li>⬆️⬇️⬅️➡️ Arrow Keys - Move snake</li>
                  <li>Space - Start/Pause game</li>
                  <li>Escape - Close</li>
                  <li>Press 'i' - Toggle these instructions</li>
                </ul>
              </div>
              <div>
                <p className="font-semibold text-white mb-2">Goal:</p>
                <ul className="list-disc list-inside space-y-1 text-sm">
                  <li>Eat the apple with the correct answer!</li>
                  <li>Match the letter (A-E) from the game board to the answer above</li>
                  <li><span className="text-red-400 font-semibold">One wrong apple and it's game over!</span></li>
                </ul>
              </div>
              <div>
                <p className="font-semibold text-white mb-2">Difficulty:</p>
                <ul className="list-disc list-inside space-y-1 text-sm">
                  <li>$200: 6 segments (slowest)</li>
                  <li>$400: 8 segments</li>
                  <li>$600: 10 segments</li>
                  <li>$800: 12 segments</li>
                  <li>$1000: 14 segments (fastest)</li>
                </ul>
              </div>
            </div>
          </div>
        )}

        {/* Team Selection */}
        <div className="scoring-panel">
          <p className="text-sm text-slate-400 text-center mb-3 uppercase tracking-wide">Playing Team</p>
          <div className="flex flex-wrap gap-2 justify-center">
            {teams.map((team) => (
              <button
                key={team.id}
                onClick={() => setSelectedTeamId(team.id)}
                className={`team-chip ${selectedTeamId === team.id ? 'selected' : ''}`}
              >
                <div className="font-medium">{team.name}</div>
                <div className="text-sm text-slate-400">${team.score}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Game Controls */}
        <div className="flex items-center justify-center gap-3 py-3">
          {gameStatus === 'ready' && (
            <button
              onClick={startGame}
              className="flex items-center gap-2 px-6 py-3 bg-green-600 hover:bg-green-500 text-white font-bold rounded-lg transition-all"
            >
              <Play size={20} /> Start Game
            </button>
          )}
          {gameStatus === 'playing' && (
            <button
              onClick={() => setGameStatus('ready')}
              className="flex items-center gap-2 px-6 py-3 bg-yellow-600 hover:bg-yellow-500 text-white font-bold rounded-lg transition-all"
            >
              <Pause size={20} /> Pause
            </button>
          )}
          {(gameStatus === 'won' || gameStatus === 'lost') && (
            <button
              onClick={resetGame}
              className="flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-lg transition-all"
            >
              <RotateCcw size={20} /> Try Again
            </button>
          )}
        </div>

        {/* Clue */}
        <div className="clue-text">{currentClue}</div>

        {/* Answer Options */}
        <div className="grid grid-cols-5 gap-2">
          {answerOptions.map(option => (
            <div
              key={option.label}
              className="rounded-lg p-3 text-center transition-transform hover:scale-105"
              style={{ backgroundColor: LETTER_COLORS[option.label] }}
            >
              <div className="text-white font-bold text-xl">{option.label}</div>
              <div className="text-white text-sm mt-1">{option.response}</div>
            </div>
          ))}
        </div>

        {/* Game Canvas */}
        <div className="p-4 flex justify-center bg-slate-800/50 rounded-lg">
          <canvas
            ref={canvasRef}
            width={BOARD_SIZE * CELL_SIZE}
            height={BOARD_SIZE * CELL_SIZE}
            className="border-2 border-slate-600 rounded"
          />
        </div>

        {/* Game Status Overlay */}
        {gameStatus === 'won' && (
          <div className="absolute inset-0 bg-green-900/50 flex items-center justify-center">
            <div className="bg-slate-900 p-6 rounded-lg text-center">
              <p className="text-3xl mb-2">🎉 Correct!</p>
              <p className="text-white text-xl">+${currentValue}</p>
            </div>
          </div>
        )}
        {gameStatus === 'lost' && (
          <div className="absolute inset-0 bg-red-900/50 flex items-center justify-center">
            <div className="bg-slate-900 p-6 rounded-lg text-center">
              <p className="text-3xl mb-2">❌ Wrong!</p>
              <p className="text-white text-xl">-${currentValue}</p>
              <p className="text-slate-400 mt-2">Correct: {currentResponse}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
