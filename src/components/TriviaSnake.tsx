import { useState, useEffect, useRef, useCallback } from 'react';
import { X, Play, Pause, RotateCcw } from 'lucide-react';

interface TriviaSnakeProps {
  isOpen: boolean;
  categoryTitle: string;
  categories: Array<{ title: string; clues: Array<{ value: number; clue: string; response: string }> }>;
  currentCategoryIndex: number;
  currentValue: number;
  currentClue: string;
  currentResponse: string;
  onClose: () => void;
  onCorrect: () => void;
  onIncorrect: () => void;
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

export function TriviaSnake({
  isOpen,
  categoryTitle,
  categories,
  currentCategoryIndex,
  currentValue,
  currentClue,
  currentResponse,
  onClose,
  onCorrect,
  onIncorrect,
}: TriviaSnakeProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameLoopRef = useRef<number | undefined>(undefined);
  const attemptsRef = useRef(0);
  const maxAttempts = 2; // Max attempts per clue

  // Game state
  const [snake, setSnake] = useState<Position[]>([
    { x: 5, y: 5 },
    { x: 4, y: 5 },
    { x: 3, y: 5 },
  ]);
  const [direction, setDirection] = useState<Position>({ x: 1, y: 0 });
  const [apples, setApples] = useState<Apple[]>([]);
  const [answerOptions, setAnswerOptions] = useState<AnswerOption[]>([]);
  const [gameStatus, setGameStatus] = useState<'ready' | 'playing' | 'won' | 'lost'>('ready');
  const [attempts, setAttempts] = useState(0);
  const [eatenAppleLabels, setEatenAppleLabels] = useState<Set<string>>(new Set());

  // Board configuration
  const BOARD_SIZE = 20; // 20x20 grid
  const CELL_SIZE = 25; // pixels per cell

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

      // Generate random apple positions on the right side of board
      const newApples: Apple[] = [];
      const usedPositions = new Set<string>();

      // Add snake starting position to avoid spawning on it
      const snakeStart = { x: 5, y: 5 };
      usedPositions.add(`${snakeStart.x},${snakeStart.y}`);

      labels.forEach((label) => {
        let position: Position;
        let placeAttempts = 0;
        do {
          // Random position on right half of board (x: 12-19, y: 2-17)
          position = {
            x: 12 + Math.floor(Math.random() * 8),
            y: 2 + Math.floor(Math.random() * 16),
          };
          placeAttempts++;
        } while (usedPositions.has(`${position.x},${position.y}`) && placeAttempts < 50);

        usedPositions.add(`${position.x},${position.y}`);
        newApples.push({ position, label });
      });

      setApples(newApples);
    }
  }, [isOpen, currentCategoryIndex, categories]);

  // Game loop
  const gameLoop = useCallback(() => {
    setSnake(prevSnake => {
      // Calculate new head position
      const newHead = {
        x: prevSnake[0].x + direction.x,
        y: prevSnake[0].y + direction.y,
      };

      // Wrap around board
      const wrappedHead = {
        x: (newHead.x + BOARD_SIZE) % BOARD_SIZE,
        y: (newHead.y + BOARD_SIZE) % BOARD_SIZE,
      };

      // Check if snake hits itself
      if (prevSnake.some(seg => seg.x === wrappedHead.x && seg.y === wrappedHead.y)) {
        setGameStatus('lost');
        return prevSnake;
      }

      // Check if snake eats an apple
      const eatenAppleIndex = apples.findIndex(
        apple => apple.position.x === wrappedHead.x && apple.position.y === wrappedHead.y
      );

      if (eatenAppleIndex !== -1) {
        const eatenApple = apples[eatenAppleIndex];

        // Skip if this apple was already eaten
        if (eatenAppleLabels.has(eatenApple.label)) {
          // Just move, don't grow
          return [wrappedHead, ...prevSnake.slice(0, -1)];
        }

        // Find the answer for this letter
        const selectedAnswer = answerOptions.find(opt => opt.label === eatenApple.label);

        if (selectedAnswer) {
          // Mark this apple as eaten
          setEatenAppleLabels(prev => new Set([...prev, eatenApple.label]));

          // Check if it's the correct answer
          if (selectedAnswer.response === currentResponse) {
            setGameStatus('won');
            onCorrect();
            // Close after showing result
            setTimeout(() => onClose(), 2000);
          } else {
            // Wrong answer - subtract points immediately
            onIncorrect();
            attemptsRef.current += 1;
            setAttempts(attemptsRef.current);

            if (attemptsRef.current >= maxAttempts) {
              // Max attempts reached, mark as lost
              setGameStatus('lost');
              // Close after showing result
              setTimeout(() => onClose(), 2000);
            } else {
              // Decrement snake length (penalty) but continue
              // Return snake without growing (remove tail to shrink slightly)
              return prevSnake.length > 3 ? [wrappedHead, ...prevSnake.slice(0, -2)] : [wrappedHead, ...prevSnake.slice(0, -1)];
            }
          }
        }

        // Grow snake when eating
        return [wrappedHead, ...prevSnake];
      }

      // Move snake (remove tail if no apple eaten)
      return [wrappedHead, ...prevSnake.slice(0, -1)];
    });
  }, [direction, apples, answerOptions, currentResponse, onCorrect, onIncorrect, onClose, maxAttempts, BOARD_SIZE, eatenAppleLabels]);

  // Start game loop
  useEffect(() => {
    if (gameStatus === 'playing') {
      gameLoopRef.current = window.setInterval(() => {
        gameLoop();
      }, 150); // Speed: 150ms per tick

      return () => {
        if (gameLoopRef.current) {
          clearInterval(gameLoopRef.current);
        }
      };
    }
  }, [gameStatus, gameLoop]);

  // Keyboard controls
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;

      // Arrow keys for direction
      switch (e.key) {
        case 'ArrowUp':
          e.preventDefault();
          setDirection(prev => prev.y === 0 ? { x: 0, y: -1 } : prev);
          break;
        case 'ArrowDown':
          e.preventDefault();
          setDirection(prev => prev.y === 0 ? { x: 0, y: 1 } : prev);
          break;
        case 'ArrowLeft':
          e.preventDefault();
          setDirection(prev => prev.x === 0 ? { x: -1, y: 0 } : prev);
          break;
        case 'ArrowRight':
          e.preventDefault();
          setDirection(prev => prev.x === 0 ? { x: 1, y: 0 } : prev);
          break;
        case ' ':
          e.preventDefault();
          if (gameStatus === 'ready' || gameStatus === 'lost') {
            startGame();
          } else if (gameStatus === 'playing') {
            setGameStatus('ready');
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
  }, [isOpen, gameStatus, onClose]);

  // Draw game
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear canvas
    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw grid
    ctx.strokeStyle = '#2a2a4e';
    ctx.lineWidth = 0.5;
    for (let i = 0; i <= BOARD_SIZE; i++) {
      ctx.beginPath();
      ctx.moveTo(i * CELL_SIZE, 0);
      ctx.lineTo(i * CELL_SIZE, BOARD_SIZE * CELL_SIZE);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, i * CELL_SIZE);
      ctx.lineTo(BOARD_SIZE * CELL_SIZE, i * CELL_SIZE);
      ctx.stroke();
    }

    // Draw apples (just letters, no text)
    apples.forEach(apple => {
      // Skip already eaten apples
      if (eatenAppleLabels.has(apple.label)) return;

      const x = apple.position.x * CELL_SIZE;
      const y = apple.position.y * CELL_SIZE;

      // Apple circle
      ctx.fillStyle = '#ef4444';
      ctx.beginPath();
      ctx.arc(x + CELL_SIZE / 2, y + CELL_SIZE / 2, CELL_SIZE / 2 - 2, 0, Math.PI * 2);
      ctx.fill();

      // Apple label (A, B, C, D, E)
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 14px Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(apple.label, x + CELL_SIZE / 2, y + CELL_SIZE / 2);
    });

    // Draw snake
    snake.forEach((segment, index) => {
      const x = segment.x * CELL_SIZE;
      const y = segment.y * CELL_SIZE;

      // Snake body
      ctx.fillStyle = index === 0 ? '#22c55e' : '#16a34a';
      ctx.fillRect(x + 1, y + 1, CELL_SIZE - 2, CELL_SIZE - 2);

      // Snake eyes on head
      if (index === 0) {
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(x + 8, y + 8, 2, 0, Math.PI * 2);
        ctx.arc(x + 17, y + 8, 2, 0, Math.PI * 2);
        ctx.fill();
      }
    });
  }, [snake, apples, eatenAppleLabels, BOARD_SIZE, CELL_SIZE]);

  const startGame = () => {
    setSnake([
      { x: 5, y: 5 },
      { x: 4, y: 5 },
      { x: 3, y: 5 },
    ]);
    setDirection({ x: 1, y: 0 });
    setGameStatus('playing');
    setAttempts(0);
    attemptsRef.current = 0;
    setEatenAppleLabels(new Set());
  };

  const resetGame = () => {
    setSnake([
      { x: 5, y: 5 },
      { x: 4, y: 5 },
      { x: 3, y: 5 },
    ]);
    setDirection({ x: 1, y: 0 });
    setGameStatus('ready');
    setAttempts(0);
    attemptsRef.current = 0;
    setEatenAppleLabels(new Set());
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
      <div className="bg-slate-900 rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-700">
          <div className="flex items-center gap-3">
            <span className="text-2xl">🐍</span>
            <div>
              <h2 className="text-xl font-bold text-white">Trivia Snake</h2>
              <p className="text-sm text-slate-400">{categoryTitle}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white transition-colors"
          >
            <X size={24} />
          </button>
        </div>

        {/* Clue Display */}
        <div className="p-4 bg-slate-800 border-b border-slate-700">
          <div className="flex items-center justify-between mb-2">
            <span className="text-yellow-400 font-bold text-lg">${currentValue}</span>
            <div className="flex gap-2">
              {gameStatus === 'ready' && (
                <button
                  onClick={startGame}
                  className="flex items-center gap-1 px-3 py-1 bg-green-600 text-white rounded hover:bg-green-700 transition-colors"
                >
                  <Play size={16} /> Start
                </button>
              )}
              {gameStatus === 'playing' && (
                <button
                  onClick={() => setGameStatus('ready')}
                  className="flex items-center gap-1 px-3 py-1 bg-yellow-600 text-white rounded hover:bg-yellow-700 transition-colors"
                >
                  <Pause size={16} /> Pause
                </button>
              )}
              {(gameStatus === 'won' || gameStatus === 'lost') && (
                <button
                  onClick={resetGame}
                  className="flex items-center gap-1 px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
                >
                  <RotateCcw size={16} /> Retry
                </button>
              )}
            </div>
          </div>
          <p className="text-white text-lg mb-3">{currentClue}</p>

          {/* Answer Options */}
          <div className="grid grid-cols-5 gap-2 mt-3">
            {answerOptions.map(option => (
              <div
                key={option.label}
                className="bg-slate-700 rounded p-2 text-center"
              >
                <div className="text-yellow-400 font-bold text-lg">{option.label}</div>
                <div className="text-white text-sm mt-1">{option.response}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Game Canvas */}
        <div className="p-4 flex justify-center bg-slate-950">
          <canvas
            ref={canvasRef}
            width={BOARD_SIZE * CELL_SIZE}
            height={BOARD_SIZE * CELL_SIZE}
            className="border-2 border-slate-700 rounded"
          />
        </div>

        {/* Instructions */}
        <div className="p-4 bg-slate-800 border-t border-slate-700">
          <div className="grid grid-cols-2 gap-4 text-sm text-slate-300">
            <div>
              <p className="font-bold text-white mb-1">Controls:</p>
              <p>⬆️⬇️⬅️➡️ Arrow Keys - Move snake</p>
              <p>Space - Start/Pause</p>
              <p>Escape - Close</p>
            </div>
            <div>
              <p className="font-bold text-white mb-1">Goal:</p>
              <p>Eat the apple with the correct answer!</p>
              <p>Find the matching answer from above, then eat its letter.</p>
              <p className="text-yellow-400 mt-1">Attempts left: {maxAttempts - attempts}/{maxAttempts}</p>
            </div>
          </div>
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
