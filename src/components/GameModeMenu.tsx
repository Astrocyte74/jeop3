import { useState, useRef, useEffect } from 'react';
import { ChevronDown, Gamepad2 } from 'lucide-react';

type GameMode = 'regular' | 'snake' | 'trivia' | 'coming-soon';

interface GameModeOption {
  id: GameMode;
  label: string;
  icon: string;
  description: string;
  disabled?: boolean;
}

const GAME_MODES: GameModeOption[] = [
  {
    id: 'regular',
    label: 'Regular Mode',
    icon: '📝',
    description: 'Classic Jeopardy-style clue display',
  },
  {
    id: 'snake',
    label: 'Snake Mode',
    icon: '🐍',
    description: 'Navigate the snake to eat the correct answer',
  },
  {
    id: 'trivia',
    label: 'Trivia Mode',
    icon: '❓',
    description: 'Coming soon - Multiple choice trivia',
    disabled: true,
  },
  {
    id: 'coming-soon',
    label: 'More Games...',
    icon: '🎮',
    description: 'More mini-games coming soon!',
    disabled: true,
  },
];

interface GameModeMenuProps {
  onSwitchToSnake?: () => void;
}

export function GameModeMenu({ onSwitchToSnake }: GameModeMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const handleModeSelect = (mode: GameModeOption) => {
    if (mode.disabled) return;

    if (mode.id === 'snake' && onSwitchToSnake) {
      onSwitchToSnake();
    }
    // Regular mode does nothing (just close the menu)
    setIsOpen(false);
  };

  return (
    <div className="relative" ref={menuRef}>
      {/* Main Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-1 px-3 py-2 bg-green-600 hover:bg-green-500 text-white rounded-lg transition-all text-sm font-medium"
        title="Select Game Mode"
      >
        <Gamepad2 className="w-4 h-4" />
        <span className="hidden sm:inline">Game Mode</span>
        <ChevronDown className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="absolute top-full right-0 mt-2 w-64 bg-slate-800 rounded-lg shadow-xl border border-slate-700 z-50 overflow-hidden">
          <div className="p-2">
            {GAME_MODES.map((mode) => (
              <button
                key={mode.id}
                onClick={() => handleModeSelect(mode)}
                disabled={mode.disabled}
                className={`
                  w-full flex items-start gap-3 p-3 rounded-lg transition-all text-left
                  ${mode.disabled
                    ? 'opacity-50 cursor-not-allowed'
                    : 'hover:bg-slate-700 cursor-pointer'
                  }
                `}
              >
                <span className="text-2xl">{mode.icon}</span>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-white text-sm">{mode.label}</div>
                  <div className="text-xs text-slate-400 mt-0.5">{mode.description}</div>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
