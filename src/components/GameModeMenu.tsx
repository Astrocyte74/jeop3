import { useState, useRef, useEffect } from 'react';
import { ChevronDown, Gamepad2 } from 'lucide-react';

export type GameMode = 'regular' | 'snake' | 'trivia' | 'coming-soon';

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
  // For per-clue usage (ClueDialog): immediate switch to snake mode
  onSwitchToSnake?: () => void;
  // For global usage (GameBoard): controlled mode state
  currentMode?: GameMode;
  onModeChange?: (mode: GameMode) => void;
}

export function GameModeMenu({
  onSwitchToSnake,
  currentMode,
  onModeChange,
}: GameModeMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Determine if this is controlled (global) or uncontrolled (per-clue)
  const isControlled = currentMode !== undefined && onModeChange !== undefined;

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

    if (isControlled) {
      // Global mode: update the mode state
      onModeChange(mode.id);
      setIsOpen(false);
    } else if (mode.id === 'snake' && onSwitchToSnake) {
      // Per-clue mode: immediately switch to snake
      onSwitchToSnake();
      setIsOpen(false);
    }
    // For regular mode in per-clue usage, just close the menu
    if (!isControlled && mode.id === 'regular') {
      setIsOpen(false);
    }
  };

  // Get display info for current mode (only for controlled mode)
  const getCurrentModeInfo = () => {
    if (!isControlled || !currentMode) return null;
    return GAME_MODES.find(m => m.id === currentMode) || GAME_MODES[0];
  };

  const currentModeInfo = getCurrentModeInfo();

  return (
    <div className="relative" ref={menuRef}>
      {/* Main Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center gap-1 px-3 py-2 rounded-lg transition-all text-sm font-medium ${
          isControlled && currentMode === 'snake'
            ? 'bg-green-600 hover:bg-green-500 text-white'
            : isControlled && currentMode === 'regular'
            ? 'bg-slate-700 hover:bg-slate-600 text-white'
            : 'bg-green-600 hover:bg-green-500 text-white'
        }`}
        title={isControlled ? `Current: ${currentModeInfo?.label || 'Game Mode'}` : 'Select Game Mode'}
      >
        {isControlled && currentModeInfo ? (
          <>
            <span className="text-lg">{currentModeInfo.icon}</span>
            <span className="hidden sm:inline">{currentModeInfo.label}</span>
          </>
        ) : (
          <>
            <Gamepad2 className="w-4 h-4" />
            <span className="hidden sm:inline">Game Mode</span>
          </>
        )}
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
                  ${isControlled && currentMode === mode.id && !mode.disabled
                    ? 'bg-slate-700'
                    : ''
                  }
                `}
              >
                <span className="text-2xl">{mode.icon}</span>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-white text-sm">{mode.label}</div>
                  <div className="text-xs text-slate-400 mt-0.5">{mode.description}</div>
                </div>
                {isControlled && currentMode === mode.id && (
                  <div className="text-green-400">
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  </div>
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
