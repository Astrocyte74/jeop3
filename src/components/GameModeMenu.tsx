import { useState, useRef, useEffect, type ComponentType } from 'react';
import { ChevronDown, Gamepad2, Check, ScrollText, Worm, HelpCircle, Sparkles } from 'lucide-react';

export type GameMode = 'regular' | 'snake' | 'trivia' | 'coming-soon';

type IconType = ComponentType<{ className?: string; style?: React.CSSProperties }>;

interface GameModeOption {
  id: GameMode;
  label: string;
  tag?: string;
  Icon: IconType;
  description: string;
  accent: string;
  disabled?: boolean;
}

const GAME_MODES: GameModeOption[] = [
  {
    id: 'regular',
    label: 'Regular',
    Icon: ScrollText,
    description: 'Read the clue, call out the response.',
    accent: '#ffcc00',
  },
  {
    id: 'snake',
    label: 'Trivia Snake',
    tag: 'Bonus round',
    Icon: Worm,
    description: 'Steer the snake to the apple with the right answer.',
    accent: '#39ff88',
  },
  {
    id: 'trivia',
    label: 'Multiple choice',
    tag: 'Soon',
    Icon: HelpCircle,
    description: 'Pick from lettered options.',
    accent: '#94a3b8',
    disabled: true,
  },
  {
    id: 'coming-soon',
    label: 'More games',
    tag: 'Soon',
    Icon: Sparkles,
    description: 'More mini-games are on the way.',
    accent: '#94a3b8',
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
    if (!isOpen) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKey, true);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKey, true);
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

  const currentModeInfo = isControlled
    ? GAME_MODES.find((m) => m.id === currentMode) || GAME_MODES[0]
    : null;
  const snakeActive = isControlled && currentMode === 'snake';
  const TriggerIcon = currentModeInfo?.Icon ?? Gamepad2;

  return (
    <div className="relative" ref={menuRef}>
      {/* Trigger */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        className="flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold text-white transition-all hover:brightness-125 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#39ff88]"
        style={
          snakeActive
            ? {
                background: 'rgba(57,255,136,0.12)',
                borderColor: 'rgba(57,255,136,0.55)',
                boxShadow: '0 0 18px rgba(57,255,136,0.22)',
              }
            : { background: 'rgba(255,255,255,0.08)', borderColor: 'rgba(255,255,255,0.18)' }
        }
        title={isControlled ? `Game mode: ${currentModeInfo?.label || 'Regular'}. Open to switch (Trivia Snake is a bonus round).` : 'Select Game Mode'}
      >
        <TriggerIcon className="h-4 w-4" style={snakeActive ? { color: '#39ff88' } : undefined} />
        <span className="hidden sm:inline">
          {currentModeInfo ? (
            <>
              <span className="opacity-60">Mode:</span> {currentModeInfo.label}
            </>
          ) : (
            'Game mode'
          )}
        </span>
        {isControlled && currentMode === 'regular' && (
          <Worm className="h-4 w-4" style={{ color: '#39ff88' }} aria-label="Trivia Snake is available" />
        )}
        <ChevronDown className={`h-4 w-4 opacity-70 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {/* Menu */}
      {isOpen && (
        <div
          role="menu"
          className="absolute right-0 top-full z-50 mt-2 w-80 overflow-hidden rounded-2xl p-2 shadow-2xl"
          style={{
            background: '#0f0a24',
            border: '1px solid rgba(140,112,255,0.45)',
            boxShadow: '0 18px 50px rgba(0,0,0,0.6), 0 0 30px rgba(140,112,255,0.18)',
          }}
        >
          {GAME_MODES.map((mode, i) => {
            const selected = isControlled && currentMode === mode.id && !mode.disabled;
            const primary = i < 2;
            return (
              <button
                key={mode.id}
                role="menuitemradio"
                aria-checked={selected}
                onClick={() => handleModeSelect(mode)}
                disabled={mode.disabled}
                className={`flex w-full items-center gap-3 rounded-xl text-left transition-all ${
                  primary ? 'mb-1.5 p-3.5' : 'p-2.5'
                } ${mode.disabled ? 'cursor-not-allowed opacity-45' : 'cursor-pointer hover:brightness-125'}`}
                style={
                  primary
                    ? {
                        background: selected ? `${mode.accent}1f` : 'rgba(255,255,255,0.04)',
                        border: `2px solid ${selected ? mode.accent : 'rgba(255,255,255,0.08)'}`,
                        boxShadow: selected ? `0 0 20px ${mode.accent}38` : undefined,
                      }
                    : { border: '2px solid transparent' }
                }
              >
                <span
                  className={`grid shrink-0 place-items-center rounded-lg ${primary ? 'h-11 w-11' : 'h-8 w-8'}`}
                  style={{ background: `${mode.accent}22`, color: mode.accent }}
                >
                  <mode.Icon className={primary ? 'h-6 w-6' : 'h-4 w-4'} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className={`font-bold text-white ${primary ? 'text-[15px]' : 'text-sm'}`}>{mode.label}</span>
                    {mode.tag && (
                      <span
                        className="rounded-full px-2 py-0.5 text-[11px] font-bold"
                        style={
                          mode.disabled
                            ? { background: 'rgba(255,255,255,0.1)', color: '#94a3b8' }
                            : { background: 'rgba(244,63,158,0.18)', color: '#ff7fc2' }
                        }
                      >
                        {mode.tag}
                      </span>
                    )}
                  </span>
                  <span className="mt-0.5 block text-xs leading-snug text-slate-400">{mode.description}</span>
                </span>
                {selected && <Check className="h-5 w-5 shrink-0" style={{ color: mode.accent }} />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
