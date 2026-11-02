import { useState, useEffect, useRef, useMemo, useCallback, useId, type CSSProperties } from 'react';
import type { Team } from '@/lib/storage';
import { X, Eye, Info, Trophy, XCircle, Volume2, Loader2, Square, Timer } from 'lucide-react';
import { iconMatcher, type IconMatch } from '@/lib/iconMatcher';
import { GameModeMenu, type GameMode } from '@/components/GameModeMenu';
import { useTTSClue, useTTS } from '@/lib/tts/hooks';
import { getTTSSettings } from '@/lib/tts';
import { playSfx } from '@/lib/sfx';
import { useFitText } from '@/components/clue/useFitText';
import { ThinkTimer } from '@/components/clue/ThinkTimer';
import { TeamTiles } from '@/components/clue/TeamTiles';
import { formatMoney } from '@/components/clue/format';
import { recentTileRect } from '@/components/clue/tileOrigin';
import '@/components/clue/clue.css';

interface ClueDialogProps {
  isOpen: boolean;
  categoryTitle: string;
  value: number;
  clue: string;
  response: string;
  teams: Team[];
  activeTeamId: string;
  globalGameMode?: GameMode;
  onClose: () => void;
  onMarkCorrect: (teamId: string) => void;
  onMarkIncorrect: (teamId: string) => void;
  onSetActiveTeam: (teamId: string) => void;
  onSwitchToSnake?: () => void;
  snakeGameResult?: { wasCorrect: boolean | null; teamId: string | null } | null;
}

const TIMER_KEY = 'jeop3:clueTimerSecs';
const TIMER_OPTIONS = [0, 15, 30, 60];
/** Beat between a score tap and the dialog closing, so the win/miss lands. */
const SETTLE_MS = 650;

function loadTimerSecs(): number {
  try {
    const n = Number(localStorage.getItem(TIMER_KEY));
    if (localStorage.getItem(TIMER_KEY) !== null && TIMER_OPTIONS.includes(n)) return n;
  } catch {
    /* storage unavailable */
  }
  return 30;
}

function isTextField(t: EventTarget | null): boolean {
  const el = t as HTMLElement | null;
  if (!el || !el.tagName) return false;
  return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable;
}

const FOCUSABLE = 'button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])';

export function ClueDialog({
  isOpen,
  categoryTitle,
  value,
  clue,
  response,
  teams,
  activeTeamId,
  globalGameMode,
  onClose,
  onMarkCorrect,
  onMarkIncorrect,
  onSetActiveTeam,
  onSwitchToSnake,
  snakeGameResult,
}: ClueDialogProps) {
  const [showResponse, setShowResponse] = useState(false);
  const ttsSettings = getTTSSettings();
  const { isAvailable } = useTTS();
  const { audio, playClue, playAnswer, stopPlayback, preloadAnswer } = useTTSClue(clue, response);

  // TTS is only available in local development mode
  const isLocalDev = import.meta.env.DEV;
  const ttsActuallyEnabled = ttsSettings.enabled && isAvailable && isLocalDev;

  const titleId = useId();
  const stageRef = useRef<HTMLDivElement>(null);
  const clueFitRef = useRef<HTMLDivElement>(null);
  const clueTextRef = useRef<HTMLParagraphElement>(null);
  const answerFitRef = useRef<HTMLDivElement>(null);
  const answerTextRef = useRef<HTMLParagraphElement>(null);

  // --- Scoring state -------------------------------------------------------
  // Wrong answers are held locally (so the next team can steal) and applied
  // through onMarkIncorrect when the clue is finally settled.
  const [missedIds, setMissedIds] = useState<string[]>([]);
  const [wonId, setWonId] = useState<string | null>(null);
  const [settling, setSettling] = useState(false);
  const settleTimer = useRef<number | undefined>(undefined);
  const [timerSecs, setTimerSecs] = useState(loadTimerSecs);

  // Latest props for deferred callbacks
  const latest = useRef({ onMarkCorrect, onMarkIncorrect, onSetActiveTeam, onClose });
  useEffect(() => {
    latest.current = { onMarkCorrect, onMarkIncorrect, onSetActiveTeam, onClose };
  });

  const hasSnakeResult = !!snakeGameResult && snakeGameResult.wasCorrect !== null;

  // Auto-show response and set active team when coming from snake game
  useEffect(() => {
    if (isOpen && snakeGameResult && snakeGameResult.wasCorrect !== null && snakeGameResult.teamId) {
      setShowResponse(true);
      onSetActiveTeam(snakeGameResult.teamId);
    }
  }, [isOpen, snakeGameResult, onSetActiveTeam]);

  // Auto-read clue when dialog opens if enabled
  const hasTriggeredAutoReadRef = useRef(false);

  useEffect(() => {
    // Reset flag when dialog closes
    if (!isOpen) {
      hasTriggeredAutoReadRef.current = false;
      return;
    }

    if (isOpen && ttsActuallyEnabled && ttsSettings.autoRead && !snakeGameResult && !hasTriggeredAutoReadRef.current) {
      console.log('[ClueDialog] Triggering auto-read');
      hasTriggeredAutoReadRef.current = true;
      // Immediate playback - no delay needed
      playClue();
    }
  }, [isOpen, ttsActuallyEnabled, ttsSettings.autoRead, snakeGameResult, playClue]);

  // Preload answer when response is shown (if not already loaded)
  useEffect(() => {
    if (showResponse && ttsActuallyEnabled && !audio.answerAudioUrl && !audio.isAnswerLoading) {
      preloadAnswer();
    }
  }, [showResponse, ttsActuallyEnabled, audio.answerAudioUrl, audio.isAnswerLoading, preloadAnswer]);

  const [showMatchedKeywords, setShowMatchedKeywords] = useState(false);
  const [clueIcons, setClueIcons] = useState<IconMatch[]>([]);
  const [answerIcons, setAnswerIcons] = useState<IconMatch[]>([]);
  const [currentClueIconIndex, setCurrentClueIconIndex] = useState(0);
  const [currentAnswerIconIndex, setCurrentAnswerIconIndex] = useState(0);

  useEffect(() => {
    if (isOpen) {
      // Only reset showResponse if NOT coming from snake game
      if (!snakeGameResult || snakeGameResult.wasCorrect === null) {
        setShowResponse(false);
      }
      setShowMatchedKeywords(false);
      setCurrentClueIconIndex(0);
      setCurrentAnswerIconIndex(0);
      setMissedIds([]);
      setWonId(null);
      setSettling(false);
      window.clearTimeout(settleTimer.current);

      // Find matching icons for clue only (doesn't give away answer)
      const clueMatches = iconMatcher.findMatches(clue, undefined, categoryTitle, 5);
      setClueIcons(clueMatches);

      // Find matching icons for clue + answer (shown after reveal)
      const answerMatches = iconMatcher.findMatches(clue, response, categoryTitle, 5);
      setAnswerIcons(answerMatches);
    }
  }, [isOpen, clue, response, categoryTitle, snakeGameResult]);

  useEffect(() => () => window.clearTimeout(settleTimer.current), []);

  // Takeover opening sound
  useEffect(() => {
    if (isOpen) playSfx('whoosh');
  }, [isOpen, clue]);

  // Focus: move into the dialog on open, hand it back on close; lock page scroll.
  useEffect(() => {
    if (!isOpen) return;
    const previous = document.activeElement as HTMLElement | null;
    stageRef.current?.focus({ preventScroll: true });
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevOverflow;
      previous?.focus?.({ preventScroll: true });
    };
  }, [isOpen]);

  // Where the clicked tile was, for the expand-from-tile animation.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const originRect = useMemo(() => (isOpen ? recentTileRect() : null), [isOpen, clue, response]);
  const originStyle = useMemo<CSSProperties | undefined>(() => {
    if (!originRect) return undefined;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    return {
      '--cs-t': `${Math.max(0, originRect.top)}px`,
      '--cs-r': `${Math.max(0, vw - originRect.right)}px`,
      '--cs-b': `${Math.max(0, vh - originRect.bottom)}px`,
      '--cs-l': `${Math.max(0, originRect.left)}px`,
    } as CSSProperties;
  }, [originRect]);

  // --- Actions -------------------------------------------------------------
  const showResponseRef = useRef(false);
  useEffect(() => {
    showResponseRef.current = showResponse;
  }, [showResponse]);

  const reveal = useCallback(() => {
    if (showResponseRef.current) return;
    showResponseRef.current = true;
    setShowResponse(true);
    playSfx('reveal');
    // Auto-play answer when showing response if TTS is enabled
    if (ttsActuallyEnabled) {
      console.log('[ClueDialog] Show Answer clicked, playing answer audio');
      playAnswer();
    }
  }, [ttsActuallyEnabled, playAnswer]);

  /** Apply pending wrong answers (and optionally a winner) through the score callbacks. */
  const settle = useCallback(
    (missed: string[], winnerId: string | null) => {
      setSettling(true);
      window.clearTimeout(settleTimer.current);
      settleTimer.current = window.setTimeout(() => {
        const cb = latest.current;
        // The parent closes the dialog on the first score callback but applies
        // each update functionally, so misses first then the winner all land.
        missed.forEach((id) => cb.onMarkIncorrect(id));
        if (winnerId) {
          cb.onSetActiveTeam(winnerId);
          cb.onMarkCorrect(winnerId);
        }
      }, SETTLE_MS);
    },
    [],
  );

  const awardTeam = useCallback(
    (teamId: string) => {
      if (settling || !showResponseRef.current || missedIds.includes(teamId)) return;
      setWonId(teamId);
      playSfx(missedIds.length > 0 ? 'fanfare' : 'correct');
      settle(missedIds, teamId);
    },
    [settling, missedIds, settle],
  );

  const deductTeam = useCallback(
    (teamId: string) => {
      if (settling || !showResponseRef.current) return;
      if (missedIds.includes(teamId)) {
        // Tapping a missed team again undoes it
        setMissedIds((ids) => ids.filter((id) => id !== teamId));
        playSfx('select');
        return;
      }
      const next = [...missedIds, teamId];
      setMissedIds(next);
      playSfx('incorrect');
      if (next.length >= teams.length) settle(next, null);
    },
    [settling, missedIds, teams.length, settle],
  );

  const closeWithMisses = useCallback(() => {
    if (settling || missedIds.length === 0) return;
    playSfx('select');
    settle(missedIds, null);
  }, [settling, missedIds, settle]);

  // The next team (in board order) after the most recent miss that hasn't missed yet
  const stealId = useMemo(() => {
    if (missedIds.length === 0 || missedIds.length >= teams.length) return null;
    const lastIdx = teams.findIndex((t) => t.id === missedIds[missedIds.length - 1]);
    for (let step = 1; step <= teams.length; step++) {
      const t = teams[(lastIdx + step) % teams.length];
      if (!missedIds.includes(t.id)) return t.id;
    }
    return null;
  }, [missedIds, teams]);

  const teamName = (id: string | null) => teams.find((t) => t.id === id)?.name ?? '';

  // --- Keyboard ------------------------------------------------------------
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
      if (isTextField(e.target)) return;

      if (e.key === 'Escape') {
        e.preventDefault();
        latest.current.onClose();
        return;
      }

      if (e.key === ' ' || e.code === 'Space') {
        if (!showResponseRef.current) {
          e.preventDefault();
          reveal();
        }
        return;
      }

      const digit = /^(?:Digit|Numpad)([1-9])$/.exec(e.code);
      if (digit && showResponseRef.current) {
        const team = teams[Number(digit[1]) - 1];
        if (team) {
          e.preventDefault();
          if (e.shiftKey) deductTeam(team.id);
          else awardTeam(team.id);
        }
        return;
      }

      // Press 'i' to toggle matched keywords
      if (e.key === 'i' || e.key === 'I') {
        setShowMatchedKeywords((prev) => !prev);
        return;
      }

      // Arrow keys to navigate icons
      const icons = showResponse ? answerIcons : clueIcons;
      const currentIndex = showResponse ? currentAnswerIconIndex : currentClueIconIndex;
      const setCurrentIndex = showResponse ? setCurrentAnswerIconIndex : setCurrentClueIconIndex;

      if (icons.length > 1) {
        if (e.key === 'ArrowLeft') {
          e.preventDefault();
          setCurrentIndex((currentIndex - 1 + icons.length) % icons.length);
        } else if (e.key === 'ArrowRight') {
          e.preventDefault();
          setCurrentIndex((currentIndex + 1) % icons.length);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, showResponse, clueIcons, answerIcons, currentClueIconIndex, currentAnswerIconIndex, teams, reveal, awardTeam, deductTeam]);

  // Keep Tab inside the dialog
  const trapTab = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Tab') return;
    const stage = stageRef.current;
    if (!stage) return;
    const items = Array.from(stage.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
      (el) => el.offsetParent !== null && !el.closest('[inert]'),
    );
    if (items.length === 0) {
      e.preventDefault();
      stage.focus();
      return;
    }
    const first = items[0];
    const lastEl = items[items.length - 1];
    const active = document.activeElement;
    if (e.shiftKey && (active === first || active === stage)) {
      e.preventDefault();
      lastEl.focus();
    } else if (!e.shiftKey && active === lastEl) {
      e.preventDefault();
      first.focus();
    }
  };

  // Auto-fit clue/answer type
  useFitText(clueFitRef, clueTextRef, [isOpen, clue], { min: 22, max: 240 });
  useFitText(answerFitRef, answerTextRef, [isOpen, response, showResponse], { min: 22, max: 200 });

  const cycleTimer = () => {
    const next = TIMER_OPTIONS[(TIMER_OPTIONS.indexOf(timerSecs) + 1) % TIMER_OPTIONS.length];
    setTimerSecs(next);
    playSfx('select');
    try {
      localStorage.setItem(TIMER_KEY, String(next));
    } catch {
      /* storage unavailable */
    }
  };

  if (!isOpen) return null;

  const activeIcons = showResponse ? answerIcons : clueIcons;
  const activeIconIndex = showResponse ? currentAnswerIconIndex : currentClueIconIndex;
  const activeIcon = activeIcons[activeIconIndex] || activeIcons[0];
  const timerRunning = isOpen && !showResponse && !hasSnakeResult;
  const mustConfirmSteal = missedIds.length > 0;

  return (
    <div
      ref={stageRef}
      className="cs-stage"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      tabIndex={-1}
      data-origin={originRect ? 'tile' : 'none'}
      data-reveal={showResponse}
      style={originStyle}
      onKeyDown={trapTab}
    >
      {/* Header */}
      <header className="cs-top">
        <div className="cs-value" aria-label={`${value} dollars`}>
          ${value}
        </div>
        <h2 id={titleId} className="cs-cat">
          {categoryTitle}
        </h2>
        {ttsActuallyEnabled && (audio.isClueLoading || audio.isAnswerLoading) && (
          <span className="cs-prep">Preparing audio...</span>
        )}
        <div className="cs-tools">
          {ttsActuallyEnabled && (
            <>
              {audio.isPlaying && (
                <button
                  type="button"
                  onClick={stopPlayback}
                  className="cs-icon-btn cs-icon-btn--stop"
                  title="Stop playback"
                  aria-label="Stop playback"
                >
                  <Square className="w-5 h-5" />
                </button>
              )}
              {showResponse ? (
                <button
                  type="button"
                  onClick={playAnswer}
                  disabled={audio.isAnswerLoading}
                  className="cs-icon-btn"
                  title="Read answer"
                  aria-label="Read answer"
                >
                  {audio.isAnswerLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Volume2 className="w-5 h-5" />}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={playClue}
                  disabled={audio.isClueLoading}
                  className="cs-icon-btn"
                  title="Read clue"
                  aria-label="Read clue"
                >
                  {audio.isClueLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Volume2 className="w-5 h-5" />}
                </button>
              )}
            </>
          )}
          {onSwitchToSnake && (
            <GameModeMenu
              currentMode={globalGameMode}
              onModeChange={(mode) => {
                if (mode === 'snake') {
                  onClose();
                  onSwitchToSnake();
                }
                // If regular is selected, just stay in ClueDialog (already there)
              }}
            />
          )}
          <button
            type="button"
            onClick={onClose}
            className="cs-icon-btn"
            title="Close (Esc)"
            aria-label="Close clue"
          >
            <X className="w-6 h-6" />
          </button>
        </div>
      </header>

      <main className="cs-main">
        {/* Clue */}
        <section className="cs-clue-zone" aria-label="Clue">
          {activeIcon && (
            <figure className="cs-icon">
              <div className="cs-icon-art">
                <img
                  key={activeIcon.icon.file_name}
                  src={iconMatcher.buildIconUrl(activeIcon) || undefined}
                  alt={activeIcon.icon.title}
                  loading="lazy"
                />
              </div>
              <div className="cs-icon-meta">
                {activeIcons.length > 1 &&
                  activeIcons.map((_, idx) => (
                    <button
                      type="button"
                      key={idx}
                      onClick={() => (showResponse ? setCurrentAnswerIconIndex : setCurrentClueIconIndex)(idx)}
                      className="cs-dot"
                      data-on={idx === activeIconIndex}
                      aria-label={`Go to icon ${idx + 1}`}
                      aria-current={idx === activeIconIndex}
                    />
                  ))}
                <button
                  type="button"
                  onClick={() => setShowMatchedKeywords((v) => !v)}
                  className="cs-info"
                  title="Show icon details (press 'i')"
                  aria-label="Show icon details"
                  aria-pressed={showMatchedKeywords}
                >
                  <Info className="w-4 h-4" />
                </button>
              </div>
              {showMatchedKeywords && (
                <figcaption className="cs-icon-detail">
                  <strong>{activeIcon.icon.title}</strong>
                  {activeIcon.matchedTokens.length > 0 && (
                    <span className="cs-tokens">
                      {activeIcon.matchedTokens.map((token) => (
                        <span key={token}>{token}</span>
                      ))}
                    </span>
                  )}
                </figcaption>
              )}
            </figure>
          )}
          <div className="cs-fit" ref={clueFitRef}>
            <p className="cs-clue-text" ref={clueTextRef}>
              {clue}
            </p>
          </div>
        </section>

        {/* Answer: a card that flips from timer-back to answer-front */}
        <section className="cs-answer" data-revealed={showResponse} aria-label="Answer">
          <div className="cs-flip">
            <div className="cs-face cs-face--back" aria-hidden={showResponse}>
              {timerSecs > 0 && !hasSnakeResult && (
                <ThinkTimer key={`${timerSecs}:${clue}`} seconds={timerSecs} running={timerRunning} />
              )}
              <button type="button" className="cs-reveal" onClick={reveal} tabIndex={showResponse ? -1 : 0}>
                <Eye className="w-7 h-7" />
                <span>Show answer</span>
                <kbd>Space</kbd>
              </button>
              {!hasSnakeResult && (
                <button
                  type="button"
                  className="cs-timer-chip"
                  onClick={cycleTimer}
                  tabIndex={showResponse ? -1 : 0}
                  aria-label={`Think timer: ${timerSecs === 0 ? 'off' : `${timerSecs} seconds`}. Change`}
                >
                  <Timer className="w-4 h-4" />
                  {timerSecs === 0 ? 'Off' : `${timerSecs}s`}
                </button>
              )}
            </div>
            <div className="cs-face cs-face--front" aria-live="polite" aria-hidden={!showResponse}>
              <div className="cs-fit" ref={answerFitRef}>
                {showResponse && (
                  <p className="cs-answer-text" ref={answerTextRef}>
                    {response}
                  </p>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* Scoring dock */}
        <section className="cs-dock" data-open={showResponse} aria-label="Scoring" inert={!showResponse}>
          <div className="cs-dock-inner">
            {/* Snake Game Result Indicator */}
            {showResponse && snakeGameResult && snakeGameResult.wasCorrect !== null && (
              <div className="cs-snake" data-correct={snakeGameResult.wasCorrect}>
                {snakeGameResult.wasCorrect ? (
                  <>
                    <Trophy className="w-5 h-5" />
                    <span>Snake Game: Correct!</span>
                  </>
                ) : (
                  <>
                    <XCircle className="w-5 h-5" />
                    <span>Snake Game: Incorrect</span>
                  </>
                )}
              </div>
            )}

            {mustConfirmSteal && !settling && (
              <div className="cs-steal-bar" role="status">
                <p>
                  {missedIds.map(teamName).join(', ')} missed ({formatMoney(-value)}).
                  {stealId && (
                    <>
                      {' '}
                      <strong>{teamName(stealId)}</strong> can steal for {formatMoney(value)}.
                    </>
                  )}
                </p>
                <button type="button" onClick={closeWithMisses}>
                  No steal, close clue
                </button>
              </div>
            )}

            {teams.length > 0 ? (
              <TeamTiles
                teams={teams}
                value={value}
                activeTeamId={activeTeamId}
                missedIds={missedIds}
                stealId={stealId}
                wonId={wonId}
                locked={settling}
                onAward={awardTeam}
                onDeduct={deductTeam}
              />
            ) : (
              <p className="cs-no-teams">No teams yet. Close the clue and add a team to keep score.</p>
            )}
          </div>
        </section>
      </main>

      <footer className="cs-hints" aria-hidden="true">
        {!showResponse ? (
          <>
            <span><kbd>Space</kbd> show answer</span>
            <span><kbd>Esc</kbd> close</span>
          </>
        ) : (
          <>
            <span><kbd>1</kbd>–<kbd>9</kbd> award team</span>
            <span><kbd>Shift</kbd> + <kbd>1</kbd>–<kbd>9</kbd> wrong answer</span>
            <span><kbd>Esc</kbd> close without scoring</span>
          </>
        )}
      </footer>
    </div>
  );
}
