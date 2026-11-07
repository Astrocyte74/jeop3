import { useState, useEffect, useRef, useMemo, useCallback, useId, type CSSProperties } from 'react';
import type { Team } from '@/lib/storage';
import { X, Eye, Info, Trophy, XCircle, Timer } from 'lucide-react';
import { iconMatcher, type IconMatch } from '@/lib/iconMatcher';
import { useIconsEnabled } from '@/lib/iconSettings';
import { GameModeMenu, type GameMode } from '@/components/GameModeMenu';
import { playSfx } from '@/lib/sfx';
import { useFitText } from '@/components/clue/useFitText';
import { ThinkTimer } from '@/components/clue/ThinkTimer';
import { TeamDock } from '@/components/clue/TeamDock';
import { AnswerActions } from '@/components/clue/AnswerActions';
import { nextTeamId, useGameRules } from '@/lib/gameRules';
import { teamColor } from '@/lib/teamColors';
import { DailyDoubleSplash } from '@/components/clue/DailyDoubleSplash';
import { WagerPanel } from '@/components/clue/WagerPanel';
import { DailyDoubleScoring } from '@/components/clue/DailyDoubleScoring';
import { wagerCap } from '@/components/clue/wager';
import { recentTileRect } from '@/components/clue/tileOrigin';
import '@/components/clue/clue.css';
import '@/components/clue/dailyDouble.css';

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
  /** `amount` overrides the clue value (Daily Double wagers). */
  onMarkCorrect: (teamId: string, amount?: number) => void;
  onMarkIncorrect: (teamId: string, amount?: number) => void;
  /** This clue is a Daily Double: the active team wagers, only they answer, no steal. */
  dailyDouble?: boolean;
  /** Highest clue value on the board; caps wagers at max(team score, this). */
  boardMaxValue?: number;
  onSetActiveTeam: (teamId: string) => void;
  /** "Nobody got it": mark the clue used without scoring anyone. */
  onSkipClue?: () => void;
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

/** How long the DAILY DOUBLE! splash holds before the wager step opens. */
const DD_SPLASH_MS = 2800;
type DdPhase = 'splash' | 'wager' | 'play';

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
  onSkipClue,
  onSwitchToSnake,
  snakeGameResult,
  dailyDouble = false,
  boardMaxValue,
}: ClueDialogProps) {
  const [showResponse, setShowResponse] = useState(false);
  const iconsEnabled = useIconsEnabled();
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
  const rules = useGameRules();
  // Whose pick opened this clue; in 'rotate' mode the pick passes to the team after them.
  const [openerId, setOpenerId] = useState(activeTeamId);
  // Manual choice of who is answering (null = follow the opener / steal order). Reset on every new clue.
  const [pickedId, setPickedId] = useState<string | null>(null);

  // --- Daily Double state --------------------------------------------------
  // splash -> wager (active team) -> play (clue revealed, wagering team scores).
  // Reset synchronously when a clue opens so the hidden clue never flashes.
  const dd = dailyDouble && teams.length > 0;
  const openSig = isOpen ? `${categoryTitle}\u0000${clue}\u0000${response}` : '';
  const [prevSig, setPrevSig] = useState('');
  const [ddPhase, setDdPhase] = useState<DdPhase>('play');
  const [wagerText, setWagerText] = useState('');
  const [lockedWager, setLockedWager] = useState<number | null>(null);
  const [lockedTeamId, setLockedTeamId] = useState<string | null>(null);
  const [ddOutcome, setDdOutcome] = useState<'correct' | 'incorrect' | null>(null);
  if (openSig !== prevSig) {
    setPrevSig(openSig);
    if (isOpen) {
      setDdPhase(dd ? 'splash' : 'play');
      setWagerText('');
      setLockedWager(null);
      setLockedTeamId(null);
      setDdOutcome(null);
      setOpenerId(activeTeamId);
      setPickedId(null);
    }
  }
  const ddPre = dd && ddPhase !== 'play';
  const wagerTeamIdx = Math.max(0, teams.findIndex((t) => t.id === (lockedTeamId ?? activeTeamId)));
  const wagerTeam: Team | undefined = teams[wagerTeamIdx];
  const cap = wagerCap(wagerTeam?.score ?? 0, boardMaxValue);

  // Latest props for deferred callbacks
  const latest = useRef({ onMarkCorrect, onMarkIncorrect, onSetActiveTeam, onSkipClue, onClose, rules, teams, openerId });
  useEffect(() => {
    latest.current = { onMarkCorrect, onMarkIncorrect, onSetActiveTeam, onSkipClue, onClose, rules, teams, openerId };
  });

  const hasSnakeResult = !dailyDouble && !!snakeGameResult && snakeGameResult.wasCorrect !== null;

  // Auto-show response and set active team when coming from snake game
  useEffect(() => {
    if (isOpen && !dailyDouble && snakeGameResult && snakeGameResult.wasCorrect !== null && snakeGameResult.teamId) {
      setShowResponse(true);
      onSetActiveTeam(snakeGameResult.teamId);
    }
  }, [isOpen, dailyDouble, snakeGameResult, onSetActiveTeam]);

  const [showMatchedKeywords, setShowMatchedKeywords] = useState(false);
  const [answerIcons, setAnswerIcons] = useState<IconMatch[]>([]);
  const [currentAnswerIconIndex, setCurrentAnswerIconIndex] = useState(0);

  useEffect(() => {
    if (isOpen) {
      // Only reset showResponse if NOT coming from snake game
      if (dailyDouble || !snakeGameResult || snakeGameResult.wasCorrect === null) {
        setShowResponse(false);
      }
      setShowMatchedKeywords(false);
      setCurrentAnswerIconIndex(0);
      setMissedIds([]);
      setWonId(null);
      setSettling(false);
      window.clearTimeout(settleTimer.current);

      // Find matching icons for clue + answer (shown after reveal)
      const answerMatches = iconMatcher.findMatches(clue, response, categoryTitle, 5);
      setAnswerIcons(answerMatches);
    }
  }, [isOpen, clue, response, categoryTitle, snakeGameResult, dailyDouble]);

  useEffect(() => () => window.clearTimeout(settleTimer.current), []);

  // Takeover opening sound (Daily Doubles get the fanfare splash instead)
  useEffect(() => {
    if (isOpen && !dd) playSfx('whoosh');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, clue]);

  // Daily Double splash: fanfare, then hand over to the wager step.
  useEffect(() => {
    if (!isOpen || ddPhase !== 'splash') return;
    playSfx('fanfare');
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const t = window.setTimeout(() => setDdPhase('wager'), reduced ? 1400 : DD_SPLASH_MS);
    return () => window.clearTimeout(t);
  }, [isOpen, ddPhase]);

  // Once the wager is locked the input unmounts; keep keyboard focus on the stage.
  useEffect(() => {
    if (isOpen && dd && ddPhase === 'play') stageRef.current?.focus({ preventScroll: true });
  }, [isOpen, dd, ddPhase]);

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

  // Daily Double: ignore the reveal key while the clue is still animating in.
  const revealOkAt = useRef(0);

  const reveal = useCallback(() => {
    if (showResponseRef.current) return;
    if (Date.now() < revealOkAt.current) return;
    showResponseRef.current = true;
    setShowResponse(true);
    playSfx('reveal');
  }, []);

  /** Apply pending wrong answers (and optionally a winner) through the score callbacks. */
  const settle = useCallback(
    (missed: string[], winnerId: string | null) => {
      setSettling(true);
      window.clearTimeout(settleTimer.current);
      settleTimer.current = window.setTimeout(() => {
        const cb = latest.current;
        // The parent closes the dialog on the first score callback but applies
        // each update functionally, so misses first then the winner all land.
        missed.forEach((id) => cb.onMarkIncorrect(id, cb.rules.wrongAnswerPenalty ? undefined : 0));
        // Rotate: the pick always passes to the next team. Winner: the correct team picks again.
        const next = cb.rules.turnMode === 'rotate' ? nextTeamId(cb.teams, cb.openerId) : winnerId;
        if (next) cb.onSetActiveTeam(next);
        if (winnerId) cb.onMarkCorrect(winnerId);
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
        // Tapping a missed team again undoes it, and puts them back in play
        setMissedIds((ids) => ids.filter((id) => id !== teamId));
        setPickedId(teamId);
        playSfx('select');
        return;
      }
      const next = [...missedIds, teamId];
      setMissedIds(next);
      setPickedId(null); // the steal order takes over
      playSfx('incorrect');
      if (next.length >= teams.length || !rules.allowSteal) settle(next, null);
    },
    [settling, missedIds, teams.length, settle, rules.allowSteal],
  );

  const skipSplash = useCallback(() => setDdPhase((p) => (p === 'splash' ? 'wager' : p)), []);

  const lockWager = useCallback(
    (amount: number) => {
      if (!wagerTeam) return;
      revealOkAt.current = Date.now() + 700;
      setLockedWager(amount);
      setLockedTeamId(wagerTeam.id);
      setDdPhase('play');
      playSfx('whoosh');
    },
    [wagerTeam],
  );

  /** Daily Double: only the wagering team is scored, for exactly the wager. */
  const scoreDailyDouble = useCallback(
    (correct: boolean) => {
      if (settling || !showResponseRef.current || lockedWager === null || !lockedTeamId) return;
      const teamId = lockedTeamId;
      const amount = lockedWager;
      setDdOutcome(correct ? 'correct' : 'incorrect');
      setSettling(true);
      playSfx(correct ? 'fanfare' : 'incorrect');
      window.clearTimeout(settleTimer.current);
      settleTimer.current = window.setTimeout(() => {
        const cb = latest.current;
        if (cb.rules.turnMode === 'rotate') {
          const next = nextTeamId(cb.teams, cb.openerId);
          if (next) cb.onSetActiveTeam(next);
        }
        if (correct) cb.onMarkCorrect(teamId, amount);
        else cb.onMarkIncorrect(teamId, amount);
      }, SETTLE_MS);
    },
    [settling, lockedWager, lockedTeamId],
  );

  /** Nobody got it: used with no score change, then the pick rotates (or stays) per the rules. */
  const skipClue = useCallback(() => {
    if (settling || !showResponseRef.current || missedIds.length > 0 || !latest.current.onSkipClue) return;
    playSfx('select');
    setSettling(true);
    window.clearTimeout(settleTimer.current);
    settleTimer.current = window.setTimeout(() => {
      const cb = latest.current;
      if (cb.rules.turnMode === 'rotate') {
        const next = nextTeamId(cb.teams, cb.openerId);
        if (next) cb.onSetActiveTeam(next);
      }
      cb.onSkipClue?.();
    }, SETTLE_MS);
  }, [settling, missedIds.length]);

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

  // The one team answering right now: a manual pick, else the steal order after a miss, else the
  // team that opened the clue (or the snake player).
  const inPlayId = useMemo(() => {
    if (teams.length === 0) return null;
    const known = (id: string | null | undefined) => (id && teams.some((t) => t.id === id) ? id : null);
    if (missedIds.length > 0) {
      const manual = known(pickedId);
      return manual && !missedIds.includes(manual) ? manual : stealId;
    }
    const snakeTeam = hasSnakeResult ? known(snakeGameResult?.teamId) : null;
    return known(pickedId) ?? snakeTeam ?? known(openerId) ?? teams[0].id;
  }, [teams, missedIds, pickedId, stealId, hasSnakeResult, snakeGameResult, openerId]);
  const inPlayIndex = teams.findIndex((t) => t.id === inPlayId);

  /** Change who is answering (another team buzzed first, say). */
  const selectTeam = useCallback(
    (teamId: string) => {
      if (settling || missedIds.includes(teamId)) return;
      setPickedId(teamId);
      playSfx('select');
    },
    [settling, missedIds],
  );

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

      // Daily Double before the clue: only the splash can be skipped
      if (dd && ddPhase !== 'play') {
        if (ddPhase === 'splash' && (e.key === ' ' || e.code === 'Space' || e.key === 'Enter')) {
          e.preventDefault();
          skipSplash();
        }
        return;
      }

      if (e.key === ' ' || e.code === 'Space') {
        if (!showResponseRef.current) {
          e.preventDefault();
          reveal();
        }
        return;
      }

      if (/^(?:Digit|Numpad)0$/.test(e.code) && showResponseRef.current && !dd) {
        e.preventDefault();
        skipClue();
        return;
      }

      const key = e.key.toLowerCase();
      const onButton = (e.target as HTMLElement | null)?.closest?.('button, a');
      if (!dd && showResponseRef.current && inPlayId) {
        if ((key === 'enter' && !onButton) || key === 'c') {
          e.preventDefault();
          awardTeam(inPlayId);
          return;
        }
        if (key === 'w' || key === 'backspace') {
          e.preventDefault();
          deductTeam(inPlayId);
          return;
        }
      }

      const digit = /^(?:Digit|Numpad)([1-9])$/.exec(e.code);
      if (digit) {
        const team = teams[Number(digit[1]) - 1];
        if (dd) {
          // Only the wagering team's key counts; no one else can score or steal.
          if (showResponseRef.current && team && team.id === lockedTeamId) {
            e.preventDefault();
            scoreDailyDouble(!e.shiftKey);
          }
          return;
        }
        if (team) {
          e.preventDefault();
          if (e.shiftKey && showResponseRef.current) deductTeam(team.id);
          else selectTeam(team.id);
        }
        return;
      }

      // Press 'i' to toggle matched keywords
      if (e.key === 'i' || e.key === 'I') {
        setShowMatchedKeywords((prev) => !prev);
        return;
      }

      // Arrow keys to navigate icons
      const icons = answerIcons;
      const currentIndex = currentAnswerIconIndex;
      const setCurrentIndex = setCurrentAnswerIconIndex;

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
  }, [isOpen, showResponse, iconsEnabled, answerIcons, currentAnswerIconIndex, teams, reveal, awardTeam, deductTeam, dd, ddPhase, lockedTeamId, skipSplash, scoreDailyDouble, skipClue, inPlayId, selectTeam]);

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
  useFitText(clueFitRef, clueTextRef, [isOpen, clue, ddPhase], { min: 22, max: 240 });
  useFitText(answerFitRef, answerTextRef, [isOpen, response, showResponse, ddPhase], { min: 22, max: 200 });

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

  const activeIcons = showResponse && iconsEnabled ? answerIcons : [];
  const activeIconIndex = currentAnswerIconIndex;
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
      data-dd={dd}
      data-dd-phase={dd ? ddPhase : undefined}
      style={{ ...originStyle, ...(!dd && inPlayIndex >= 0 ? ({ '--turn': teamColor(inPlayIndex).main } as CSSProperties) : null) }}
      data-turn={!dd && inPlayIndex >= 0 ? 'true' : undefined}
      onKeyDown={trapTab}
    >
      {/* Header */}
      <header className="cs-top">
        {dd && <div className="dd-badge">Daily Double</div>}
        {!ddPre && (
          <div className="cs-value" aria-label={dd ? `Wager ${lockedWager ?? 0} dollars` : `${value} dollars`}>
            ${dd ? (lockedWager ?? 0) : value}
          </div>
        )}
        <h2 id={titleId} className="cs-cat">
          {categoryTitle}
        </h2>
        <div className="cs-tools">
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


      {ddPre && (
        <main className="dd-main">
          {ddPhase === 'splash' ? (
            <DailyDoubleSplash categoryTitle={categoryTitle} onSkip={skipSplash} />
          ) : (
            wagerTeam && (
              <WagerPanel
                key={wagerTeam.id}
                team={wagerTeam}
                teamIndex={wagerTeamIdx}
                cap={cap}
                text={wagerText}
                onTextChange={setWagerText}
                onLock={lockWager}
                onCancel={() => latest.current.onClose()}
                onQuick={() => playSfx('select')}
              />
            )
          )}
        </main>
      )}

      {!ddPre && (
      <main className={dd ? 'cs-main dd-clue-in' : 'cs-main'}>
        {/* Clue */}
        <section className="cs-clue-zone" aria-label="Clue">
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
                        onClick={() => setCurrentAnswerIconIndex(idx)}
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

            {dd && wagerTeam && lockedWager !== null && (
              <DailyDoubleScoring
                team={wagerTeam}
                teamIndex={wagerTeamIdx}
                wager={lockedWager}
                outcome={ddOutcome}
                onCorrect={() => scoreDailyDouble(true)}
                onIncorrect={() => scoreDailyDouble(false)}
              />
            )}

            {!dd && teams.length > 0 && inPlayId && (
              <AnswerActions
                value={value}
                penalty={rules.wrongAnswerPenalty}
                locked={settling}
                won={wonId !== null}
                onCorrect={() => awardTeam(inPlayId)}
                onWrong={() => deductTeam(inPlayId)}
              />
            )}

            {!dd && mustConfirmSteal && !settling && (
              <div className="cs-steal-bar" role="status">
                <button type="button" onClick={closeWithMisses}>
                  No steal, close clue
                </button>
              </div>
            )}

            {!dd && teams.length === 0 && (
              <p className="cs-no-teams">No teams yet. Close the clue and add a team to keep score.</p>
            )}

            {!dd && onSkipClue && teams.length > 0 && showResponse && missedIds.length === 0 && !settling && (
              <button type="button" className="cs-skip" onClick={skipClue}>
                Nobody got it
                <kbd>0</kbd>
              </button>
            )}
          </div>
        </section>
      </main>
      )}

      <footer className="cs-hints" aria-hidden="true">
        {ddPre ? (
          ddPhase === 'splash' ? (
            <>
              <span><kbd>Space</kbd> skip</span>
              <span><kbd>Esc</kbd> close</span>
            </>
          ) : (
            <>
              <span><kbd>Enter</kbd> lock in wager</span>
              <span><kbd>Esc</kbd> close without scoring</span>
            </>
          )
        ) : dd && showResponse ? (
          <>
            <span><kbd>{wagerTeamIdx + 1}</kbd> correct</span>
            <span><kbd>Shift</kbd> + <kbd>{wagerTeamIdx + 1}</kbd> incorrect</span>
            <span><kbd>Esc</kbd> close without scoring</span>
          </>
        ) : !showResponse ? (
          <>
            <span><kbd>Space</kbd> show answer</span>
            <span><kbd>Esc</kbd> close</span>
          </>
        ) : (
          <>
            <span><kbd>Esc</kbd> close without scoring</span>
          </>
        )}
      </footer>

      {!ddPre && teams.length > 0 && (
        <TeamDock
          teams={teams}
          inPlayId={dd ? (lockedTeamId ?? wagerTeam?.id ?? null) : inPlayId}
          steal={!dd && missedIds.length > 0}
          missedIds={missedIds}
          interactive={!dd}
          locked={settling}
          onSelect={selectTeam}
          onUndoMiss={deductTeam}
        />
      )}
    </div>
  );
}
