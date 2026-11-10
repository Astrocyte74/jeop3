import { useState, useReducer, useEffect, useRef, useMemo, useCallback, useId, type CSSProperties } from 'react';
import type { Team } from '@/lib/storage';
import { X, Eye, Info, Trophy, XCircle, HelpCircle } from 'lucide-react';
import { iconMatcher, type IconMatch } from '@/lib/iconMatcher';
import { useIconsEnabled } from '@/lib/iconSettings';
import type { GameMode } from '@/components/GameModeMenu';
import { ClueOptions } from '@/components/clue/ClueOptions';
import { setClueTimerSecs, useClueTimerSecs } from '@/lib/clueTimerSettings';
import { toggleClueHints, useClueHints } from '@/lib/clueHintsSettings';
import { playSfx } from '@/lib/sfx';
import { useFitText } from '@/components/clue/useFitText';
import { ThinkTimer } from '@/components/clue/ThinkTimer';
import { TeamDock } from '@/components/clue/TeamDock';
import { AnswerActions } from '@/components/clue/AnswerActions';
import { clueAttemptsReducer, emptyClueAttempts, type ClueAttempts } from '@/lib/clueAttempts';
import { nextTeamId, useGameRules } from '@/lib/gameRules';
import { teamColor } from '@/lib/teamColors';
import { DailyDoubleSplash } from '@/components/clue/DailyDoubleSplash';
import { WagerPanel } from '@/components/clue/WagerPanel';
import { DailyDoubleScoring } from '@/components/clue/DailyDoubleScoring';
import { wagerCap } from '@/components/clue/wager';
import { recentTileRect } from '@/components/clue/tileOrigin';
import { formatMoney } from '@/lib/money';
import { setScorePreviews } from '@/lib/scorePreview';
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

/** Beat between a score tap and the dialog closing, so the win/miss lands. */
const SETTLE_MS = 650;

function isTextField(t: EventTarget | null): boolean {
  const el = t as HTMLElement | null;
  if (!el || !el.tagName) return false;
  return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable;
}

/** How long the DAILY DOUBLE! splash holds before the wager step opens. */
const DD_SPLASH_MS = 2800;
type DdPhase = 'splash' | 'wager' | 'play';

/** The "click to judge" hint is shown until the host has judged once this session. */
const JUDGE_HINT_KEY = 'jeop3:judgeHintUsed';
function judgeHintUsed(): boolean {
  try { return sessionStorage.getItem(JUDGE_HINT_KEY) === '1'; } catch { return false; }
}
function markJudgeHintUsed(): void {
  try { sessionStorage.setItem(JUDGE_HINT_KEY, '1'); } catch { /* best effort */ }
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
  const [hintUsed, setHintUsed] = useState(judgeHintUsed);
  // Shortcut chips and explanatory notes stay hidden until asked for ('?' or the help button). The choice
  // is a remembered device preference, so it holds from clue to clue until the host changes it.
  const showHints = useClueHints();
  // Settings (game mode, think-timer length) live behind their own Options button, apart from the tips.
  const [optionsOpen, setOptionsOpen] = useState(false);
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
  const [attempts, dispatchAttempt] = useReducer(clueAttemptsReducer, emptyClueAttempts);
  const missedIds = useMemo(() => attempts.misses.map((m) => m.teamId), [attempts.misses]);
  const wonId = attempts.winnerId;
  const [settling, setSettling] = useState(false);
  const settleTimer = useRef<number | undefined>(undefined);
  const timerSecs = useClueTimerSecs();
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
      dispatchAttempt({ type: 'reveal' });
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
      setOptionsOpen(false);
      setCurrentAnswerIconIndex(0);
      dispatchAttempt({ type: 'reset' });
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

  const canJudge = showResponse || (!dd && rules.allowSteal && attempts.judging);
  const advanceLabel = !dd && rules.allowSteal && !attempts.judging && !showResponse ? 'Judge answer' : 'Show answer';

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
    dispatchAttempt({ type: 'reveal' });
    setShowResponse(true);
    playSfx('reveal');
  }, []);

  const advanceClue = useCallback(() => {
    if (!judgeHintUsed()) {
      markJudgeHintUsed();
      setHintUsed(true);
    }
    if (dd) reveal();
    else dispatchAttempt({ type: 'advance', allowSteal: rules.allowSteal });
  }, [dd, reveal, rules.allowSteal]);

  useEffect(() => {
    if (attempts.judging && !attempts.revealed) stageRef.current?.focus({ preventScroll: true });
  }, [attempts.judging, attempts.revealed]);

  useEffect(() => {
    if (attempts.revealed && !showResponseRef.current) reveal();
  }, [attempts.revealed, reveal]);

  useEffect(() => {
    if (attempts.finished) stageRef.current?.focus({ preventScroll: true });
  }, [attempts.finished]);

  /** Apply pending wrong answers (and optionally a winner) through the score callbacks. */
  const settle = useCallback(
    (missed: ClueAttempts['misses'], winnerId: string | null) => {
      setSettling(true);
      window.clearTimeout(settleTimer.current);
      settleTimer.current = window.setTimeout(() => {
        const cb = latest.current;
        // The parent closes the dialog on the first score callback but applies
        // each update functionally, so misses first then the winner all land.
        missed.forEach(({ teamId, penalty }) => cb.onMarkIncorrect(teamId, penalty ? undefined : 0));
        // Rotate: the pick always passes to the next team. Winner: the correct team picks again.
        const next = cb.rules.turnMode === 'rotate' ? nextTeamId(cb.teams, cb.openerId) : winnerId;
        if (next) cb.onSetActiveTeam(next);
        if (winnerId) cb.onMarkCorrect(winnerId);
        else if (missed.length === 0) cb.onSkipClue?.();
      }, SETTLE_MS);
    },
    [],
  );

  const awardTeam = useCallback(
    (teamId: string) => {
      if (settling || !canJudge || attempts.finished || missedIds.includes(teamId)) return;
      dispatchAttempt({ type: 'correct', teamId });
      playSfx(missedIds.length > 0 ? 'fanfare' : 'correct');
    },
    [settling, canJudge, attempts.finished, missedIds],
  );

  const deductTeam = useCallback(
    (teamId: string) => {
      if (settling || !canJudge || attempts.finished) return;
      if (missedIds.includes(teamId)) {
        dispatchAttempt({ type: 'undoMiss', teamId });
        setPickedId(teamId);
        playSfx('select');
        return;
      }
      dispatchAttempt({ type: 'wrong', teamId, penalty: rules.wrongAnswerPenalty,
        allowSteal: rules.allowSteal, teamCount: teams.length });
      setPickedId(null);
      playSfx('incorrect');
    },
    [settling, canJudge, attempts.finished, missedIds, teams.length, rules.allowSteal, rules.wrongAnswerPenalty],
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

  const skipClue = useCallback(() => {
    if (settling || !canJudge || attempts.finished || !latest.current.onSkipClue) return;
    dispatchAttempt({ type: 'nobody' });
    playSfx('select');
  }, [settling, canJudge, attempts.finished]);

  const finishClue = useCallback(() => {
    if (settling || !attempts.finished) return;
    settle(attempts.misses, attempts.winnerId);
  }, [settling, attempts, settle]);

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
    if (attempts.finished) return attempts.winnerId ?? missedIds.at(-1) ?? openerId;
    const known = (id: string | null | undefined) => (id && teams.some((t) => t.id === id) ? id : null);
    if (missedIds.length > 0) {
      const manual = known(pickedId);
      return manual && !missedIds.includes(manual) ? manual : stealId;
    }
    const snakeTeam = hasSnakeResult ? known(snakeGameResult?.teamId) : null;
    return known(pickedId) ?? snakeTeam ?? known(openerId) ?? teams[0].id;
  }, [teams, missedIds, pickedId, stealId, hasSnakeResult, snakeGameResult, openerId, attempts.finished, attempts.winnerId]);
  const inPlayIndex = teams.findIndex((t) => t.id === inPlayId);

  // Score change given by the verdicts so far. Shown at once on the team cards; the real score is
  // still applied by settle()/scoreDailyDouble() on Continue, so undo and steal logic are unchanged.
  const deltas = useMemo(() => {
    const out: Record<string, number> = {};
    if (dd) {
      if (ddOutcome && lockedTeamId && lockedWager !== null) out[lockedTeamId] = ddOutcome === 'correct' ? lockedWager : -lockedWager;
      return out;
    }
    for (const m of attempts.misses) if (m.penalty) out[m.teamId] = (out[m.teamId] ?? 0) - value;
    if (attempts.winnerId) out[attempts.winnerId] = (out[attempts.winnerId] ?? 0) + value;
    return out;
  }, [dd, ddOutcome, lockedTeamId, lockedWager, attempts.misses, attempts.winnerId, value]);

  // Tell the board which scores this screen already counted up to, so it doesn't count them again.
  useEffect(() => {
    if (!isOpen) return;
    // Only when the verdicts change: once the real scores land, `teams` already includes them.
    const finalScores: Record<string, number> = {};
    for (const t of latest.current.teams) if (deltas[t.id]) finalScores[t.id] = t.score + deltas[t.id];
    setScorePreviews(finalScores);
  }, [isOpen, deltas]);

  /** Change who is answering (another team buzzed first, say). */
  const selectTeam = useCallback(
    (teamId: string) => {
      if (settling || attempts.finished || missedIds.includes(teamId)) return;
      setPickedId(teamId);
      playSfx('select');
    },
    [settling, attempts.finished, missedIds],
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

      // '?' toggles the shortcut tips. Holding the key repeats keydown, which must not flicker it.
      if (e.key === '?') {
        e.preventDefault();
        if (!e.repeat) toggleClueHints();
        return;
      }

      // Keys pressed inside the Options popover belong to its controls (Escape is handled by the popover).
      if ((e.target as HTMLElement | null)?.closest?.('.cs-options-panel')) return;

      // Daily Double before the clue: only the splash can be skipped
      if (dd && ddPhase !== 'play') {
        if (ddPhase === 'splash' && (e.key === ' ' || e.code === 'Space' || e.key === 'Enter')) {
          e.preventDefault();
          skipSplash();
        }
        return;
      }

      const onButton = (e.target as HTMLElement | null)?.closest?.('button, a');
      if (e.repeat) { e.preventDefault(); return; }
      if (e.key === ' ' || e.code === 'Space') {
        if (onButton) return;
        if (!showResponseRef.current) {
          e.preventDefault();
          advanceClue();
        }
        return;
      }

      if (!dd && attempts.finished) {
        if (e.key === 'Enter' && !onButton) {
          e.preventDefault();
          finishClue();
        }
        return;
      }

      if (/^(?:Digit|Numpad)0$/.test(e.code) && !dd) {
        e.preventDefault();
        skipClue();
        return;
      }

      const key = e.key.toLowerCase();
      if (!dd && inPlayId) {
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
          if (e.shiftKey) deductTeam(team.id);
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
  }, [isOpen, showResponse, iconsEnabled, answerIcons, currentAnswerIconIndex, teams, reveal, awardTeam, deductTeam, dd, ddPhase, lockedTeamId, skipSplash, scoreDailyDouble, skipClue, inPlayId, selectTeam, attempts.finished, finishClue, advanceClue]);

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

  const chooseTimer = (next: number) => {
    if (next === timerSecs) return;
    setClueTimerSecs(next);
    playSfx('select');

  };

  if (!isOpen) return null;

  const activeIcons = showResponse && iconsEnabled ? answerIcons : [];
  const activeIconIndex = currentAnswerIconIndex;
  const activeIcon = activeIcons[activeIconIndex] || activeIcons[0];
  const timerRunning = isOpen && !showResponse && !hasSnakeResult;
  // The countdown stops while the host judges an answer, and starts afresh for each stealing team.
  const timerHeld = !dd && attempts.judging && missedIds.length === 0;

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
      data-hints={showHints}
      data-dd={dd}
      data-dd-phase={dd ? ddPhase : undefined}
      style={{ ...originStyle, ...(!dd && inPlayIndex >= 0 ? ({ '--turn': teamColor(inPlayIndex).main } as CSSProperties) : null) }}
      data-turn={!dd && inPlayIndex >= 0 ? 'true' : undefined}
      onKeyDown={trapTab}
    >
      <div className="cs-drain" aria-hidden="true" />

      {/* Header */}
      <header className="cs-top">
        {dd && <div className="dd-badge">Daily Double</div>}
        {!ddPre && (
          <div className="cs-value" aria-label={dd ? `Wager ${formatMoney(lockedWager ?? 0)}` : formatMoney(value)}>
            {formatMoney(dd ? (lockedWager ?? 0) : value)}
          </div>
        )}
        <h2 id={titleId} className="cs-cat">
          {categoryTitle}
        </h2>
        <div className="cs-tools">
          <ClueOptions
            open={optionsOpen}
            onOpenChange={setOptionsOpen}
            showMode={!dd && !!onSwitchToSnake && missedIds.length === 0 && !showResponse}
            dailyDouble={dd}
            onPickSnake={() => {
              setOptionsOpen(false);
              onClose();
              onSwitchToSnake?.();
            }}
            showTimer={!ddPre && !showResponse && !hasSnakeResult}
            timerSecs={timerSecs}
            onTimerChange={chooseTimer}
          />
          <button
            type="button"
            onClick={() => toggleClueHints()}
            className="cs-icon-btn cs-help-btn"
            title="Shortcut tips (?)"
            aria-label="Show shortcut tips"
            aria-pressed={showHints}
          >
            <HelpCircle className="w-6 h-6" />
          </button>
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
          <button type="button" className="cs-clue-reveal" onClick={advanceClue}
            disabled={showResponse} title={showResponse ? undefined : advanceLabel}>
          <div className="cs-fit" ref={clueFitRef}>
            <p className="cs-clue-text" ref={clueTextRef}>
              {clue}
            </p>
          </div>
          {!showResponse && !hintUsed && (
            <span className="cs-judge-hint" aria-hidden="true">
              Click or press <kbd>Space</kbd> to {!dd && rules.allowSteal ? 'judge' : 'show the answer'}
            </span>
          )}
          </button>
        </section>

        {/* Answer: a card that flips from timer-back to answer-front */}
        <section className="cs-answer" data-revealed={showResponse} aria-label="Answer"
          hidden={!showResponse && timerSecs === 0 && !showHints}>
          <div className="cs-flip">
            <div className="cs-face cs-face--back" aria-hidden={showResponse}>
              {timerSecs > 0 && !hasSnakeResult && (
                <ThinkTimer key={`${timerSecs}:${clue}:${missedIds.length}`} seconds={timerSecs} running={timerRunning} hold={timerHeld} stageRef={stageRef}
                  onTimerChange={chooseTimer} />
              )}
              <button type="button" className="cs-reveal cs-hint-only" onClick={advanceClue} tabIndex={showResponse ? -1 : 0}>
                <Eye className="w-7 h-7" />
                <span>{advanceLabel}</span>
                <kbd>Space</kbd>
              </button>
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
        <section className="cs-dock" data-open={canJudge} aria-label="Scoring" inert={!canJudge}>
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

            {!dd && !attempts.finished && teams.length > 0 && inPlayId && (
              <AnswerActions
                value={value}
                penalty={rules.wrongAnswerPenalty}
                locked={settling}
                won={wonId !== null}
                onCorrect={() => awardTeam(inPlayId)}
                onWrong={() => deductTeam(inPlayId)}
              />
            )}

            {!dd && attempts.finished && (
              <div className="cs-result">
                <p role="status">{wonId ? `${teams.find((t) => t.id === wonId)?.name ?? 'Team'} got it right` : 'No correct answer'}</p>
                <button type="button" className="cs-reveal" onClick={finishClue} disabled={settling}>
                  Continue <kbd className="cs-hint-only">Enter</kbd>
                </button>
              </div>
            )}

            {!dd && teams.length === 0 && (
              <p className="cs-no-teams">No teams yet. Close the clue and add a team to keep score.</p>
            )}

            {!dd && onSkipClue && teams.length > 0 && !attempts.finished && !settling && (
              <button type="button" className="cs-skip" onClick={skipClue}>
                {showResponse ? 'Nobody got it' : 'Nobody got it — reveal'}
                <kbd className="cs-hint-only">0</kbd>
              </button>
            )}
          </div>
        </section>
      </main>
      )}

      <footer className="cs-hints" data-always={ddPre} aria-hidden="true">
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
        ) : !dd && attempts.finished ? (
          <>
            <span><kbd>Enter</kbd> continue</span>
            <span><kbd>Esc</kbd> cancel without scoring</span>
          </>
        ) : !showResponse ? (
          <>
            <span><kbd>Space</kbd> {advanceLabel.toLowerCase()}</span>
            {!dd && canJudge && teams.length > 0 && <span><kbd>Enter</kbd> correct · <kbd>W</kbd> wrong · <kbd>0</kbd> nobody got it</span>}
            {teams.length > 1 && <span><kbd>1</kbd>–<kbd>{Math.min(teams.length, 9)}</kbd> who&rsquo;s answering</span>}
            <span><kbd>Esc</kbd> close</span>
            <span><kbd>?</kbd> hide tips</span>
          </>
        ) : (
          <>
            {teams.length > 0 && <span><kbd>Enter</kbd> correct</span>}
            {teams.length > 0 && <span><kbd>W</kbd> wrong</span>}
            {onSkipClue && teams.length > 0 && <span><kbd>0</kbd> nobody got it</span>}
            <span><kbd>Esc</kbd> close without scoring</span>
            <span><kbd>?</kbd> hide tips</span>
          </>
        )}
      </footer>

      {!ddPre && teams.length > 0 && (
        <TeamDock
          teams={teams}
          inPlayId={dd ? (lockedTeamId ?? wagerTeam?.id ?? null) : inPlayId}
          steal={!dd && !showResponse && missedIds.length > 0}
          missedIds={missedIds}
          interactive={!dd}
          locked={settling || attempts.finished}
          onSelect={selectTeam}
          onUndoMiss={deductTeam}
          deltas={deltas}
        />
      )}
    </div>
  );
}
