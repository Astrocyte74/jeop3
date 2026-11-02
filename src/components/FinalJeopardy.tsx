import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Check, Lock, Pause, Play, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { FinalJeopardyClue, Team } from '@/lib/storage';
import type { FinalOutcome } from '@/lib/gameState';
import { teamColor, teamInitials } from '@/lib/teamColors';
import { playSfx } from '@/lib/sfx';
import { formatScore } from '@/components/board/AnimatedScore';
import { useReducedMotion } from '@/components/board/useReducedMotion';

export interface FinalJeopardyProps {
  open: boolean;
  final: FinalJeopardyClue;
  teams: Team[];
  /** Called once with every playing team's wager and result, then the screen closes. */
  onComplete: (outcomes: FinalOutcome[]) => void;
  onClose: () => void;
}

const THINK_SECONDS = 30;
const URGENT_SECONDS = 5;

type Phase = 'category' | 'wager' | 'clue' | 'judge';

interface Player {
  team: Team;
  colorIndex: number;
}

function teamStyle(colorIndex: number): React.CSSProperties {
  const c = teamColor(colorIndex);
  return { ['--tc' as string]: c.main, ['--tc-on' as string]: c.onMain, ['--tc-soft' as string]: c.soft };
}

/** Parse a typed wager ("1,200", "$500"); null when it is not a whole number in 0..max. */
function parseWager(text: string, max: number): number | null {
  const cleaned = text.replace(/[$,\s]/g, '');
  if (!/^\d+$/.test(cleaned)) return null;
  const n = Number(cleaned);
  return n <= max ? n : null;
}

export function FinalJeopardy(props: FinalJeopardyProps) {
  // Mounting the run only while open resets every phase when the screen is closed and reopened
  if (!props.open) return null;
  return <FinalRun {...props} />;
}

function FinalRun({ final, teams, onComplete, onClose }: FinalJeopardyProps) {
  const reduced = useReducedMotion();
  const players: Player[] = useMemo(
    () => teams.map((team, colorIndex) => ({ team, colorIndex })).filter((p) => p.team.score > 0),
    [teams],
  );
  const sittingOut: Player[] = useMemo(
    () => teams.map((team, colorIndex) => ({ team, colorIndex })).filter((p) => p.team.score <= 0),
    [teams],
  );

  const [phase, setPhase] = useState<Phase>('category');
  const [wagers, setWagers] = useState<Record<string, number>>({});
  const [judged, setJudged] = useState<Record<string, boolean>>({});

  // Nobody has points to risk: finish straight away with no outcomes
  const skipped = useRef(false);
  useEffect(() => {
    if (players.length > 0 || skipped.current) return;
    skipped.current = true;
    onComplete([]);
  }, [players.length, onComplete]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Category reveal: whoosh as the wordmark lands, sting when the category stamps in
  useEffect(() => {
    if (phase !== 'category') return;
    playSfx('whoosh');
    if (reduced) return;
    const t = window.setTimeout(() => playSfx('reveal'), 1000);
    return () => window.clearTimeout(t);
  }, [phase, reduced]);

  const lockWagers = useCallback((parsed: Record<string, number>) => {
    setWagers(parsed);
    setPhase('clue');
    playSfx('whoosh');
  }, []);

  const finish = () => {
    const outcomes: FinalOutcome[] = players.map((p) => ({
      teamId: p.team.id,
      wager: wagers[p.team.id] ?? 0,
      correct: !!judged[p.team.id],
    }));
    playSfx('fanfare');
    onComplete(outcomes);
  };

  if (players.length === 0) return null;

  const showPlate = phase !== 'category';

  return (
    <div className={`fj ${reduced ? 'is-still' : ''}`} role="dialog" aria-modal="true" aria-label="Final Jeopardy" data-phase={phase}>
      <div className="fj-beams" aria-hidden="true" />
      <header className="fj-top">
        <span className="fj-wordmark">Final Jeopardy</span>
        <Button
          variant="outline"
          size="sm"
          className="fj-close"
          onClick={onClose}
          aria-label="Close Final Jeopardy"
        >
          <X className="w-5 h-5" />
        </Button>
      </header>

      <main className="fj-stage">
        {showPlate && (
          <h2 className="fj-plate fj-plate-small" aria-label={`Category: ${final.category}`}>
            {final.category}
          </h2>
        )}

        {phase === 'category' && (
          <CategoryReveal final={final} players={players} sittingOut={sittingOut} onNext={() => setPhase('wager')} />
        )}

        {phase === 'wager' && (
          <WagerStep players={players} sittingOut={sittingOut} onLock={lockWagers} />
        )}

        {(phase === 'clue' || phase === 'judge') && (
          <ClueStep
            final={final}
            players={players}
            wagers={wagers}
            judged={judged}
            flipped={phase === 'judge'}
            onReveal={() => {
              playSfx('reveal');
              setPhase('judge');
            }}
            onJudge={(teamId, correct) => {
              playSfx(correct ? 'correct' : 'incorrect');
              setJudged((j) => ({ ...j, [teamId]: correct }));
            }}
            onFinish={finish}
          />
        )}
      </main>
    </div>
  );
}

/* ---------- Step 1: category ---------- */

function CategoryReveal({
  final,
  players,
  sittingOut,
  onNext,
}: {
  final: FinalJeopardyClue;
  players: Player[];
  sittingOut: Player[];
  onNext: () => void;
}) {
  return (
    <section className="fj-intro">
      <p className="fj-intro-lead">The category is</p>
      <h2 className="fj-plate" aria-label={`Category: ${final.category}`}>
        {final.category}
      </h2>
      <p className="fj-intro-note">
        {players.length === 1
          ? `${players[0].team.name} can wager up to ${formatScore(players[0].team.score)}.`
          : 'Each team can wager up to its own score.'}
        {sittingOut.length > 0 && ` ${sittingOut.map((s) => s.team.name).join(', ')} sit${sittingOut.length === 1 ? 's' : ''} out with no points to risk.`}
      </p>
      <Button size="lg" className="fj-btn fj-btn-primary fj-intro-btn" onClick={onNext} autoFocus>
        Place wagers
      </Button>
    </section>
  );
}

/* ---------- Step 2: wagers ---------- */

function WagerStep({
  players,
  sittingOut,
  onLock,
}: {
  players: Player[];
  sittingOut: Player[];
  onLock: (wagers: Record<string, number>) => void;
}) {
  const [text, setText] = useState<Record<string, string>>({});
  const set = (id: string, value: string) => setText((t) => ({ ...t, [id]: value }));

  const parsed = players.map((p) => ({ p, value: text[p.team.id] === undefined ? null : parseWager(text[p.team.id], p.team.score) }));
  const ready = parsed.filter((x) => x.value !== null).length;
  const allReady = ready === players.length;

  const submit = () => {
    if (!allReady) return;
    const out: Record<string, number> = {};
    parsed.forEach((x) => (out[x.p.team.id] = x.value as number));
    onLock(out);
  };

  const inputsRef = useRef<Array<HTMLInputElement | null>>([]);

  return (
    <section className="fj-wagers" aria-label="Wagers">
      <div className="fj-wagers-head">
        <h3 className="fj-heading">Place your wagers</h3>
        <p className="fj-sub">One person can type them all in. A wager stays hidden once you leave its field.</p>
      </div>

      <ul className="fj-wager-list">
        {parsed.map(({ p, value }, i) => {
          const raw = text[p.team.id] ?? '';
          const invalid = raw.trim() !== '' && value === null;
          const id = `fj-wager-${p.team.id}`;
          return (
            <li key={p.team.id} className="fj-wager-row" style={teamStyle(p.colorIndex)} data-valid={value !== null}>
              <span className="fj-chip" aria-hidden="true">
                {teamInitials(p.team.name)}
              </span>
              <div className="fj-wager-who">
                <label htmlFor={id} className="fj-team-name">
                  {p.team.name}
                </label>
                <span className="fj-team-score">Can wager up to {formatScore(p.team.score)}</span>
              </div>
              <div className="fj-wager-field">
                <span className="fj-dollar" aria-hidden="true">
                  $
                </span>
                <input
                  id={id}
                  ref={(el) => {
                    inputsRef.current[i] = el;
                  }}
                  className="fj-wager-input"
                  inputMode="numeric"
                  autoComplete="off"
                  spellCheck={false}
                  autoFocus={i === 0}
                  placeholder={`0 to ${p.team.score.toLocaleString()}`}
                  value={raw}
                  aria-invalid={invalid}
                  aria-describedby={invalid ? `${id}-err` : undefined}
                  onChange={(e) => set(p.team.id, e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key !== 'Enter') return;
                    e.preventDefault();
                    const next = inputsRef.current[i + 1];
                    if (next) next.focus();
                    else if (allReady) submit();
                  }}
                />
                {value !== null && (
                  <span className="fj-wager-ok" aria-label="Wager entered">
                    <Check className="w-6 h-6" strokeWidth={3} />
                  </span>
                )}
              </div>
              <div className="fj-quick" role="group" aria-label={`Quick wager for ${p.team.name}`}>
                <button type="button" onClick={() => set(p.team.id, '0')}>
                  Pass
                </button>
                <button type="button" onClick={() => set(p.team.id, String(Math.floor(p.team.score / 2)))}>
                  Half
                </button>
                <button type="button" onClick={() => set(p.team.id, String(p.team.score))}>
                  All in
                </button>
              </div>
              {invalid && (
                <p id={`${id}-err`} className="fj-wager-error" role="alert">
                  Enter a whole number from $0 to {formatScore(p.team.score)}.
                </p>
              )}
            </li>
          );
        })}
        {sittingOut.map((s) => (
          <li key={s.team.id} className="fj-wager-row is-out" style={teamStyle(s.colorIndex)}>
            <span className="fj-chip" aria-hidden="true">
              {teamInitials(s.team.name)}
            </span>
            <div className="fj-wager-who">
              <span className="fj-team-name">{s.team.name}</span>
              <span className="fj-team-score">Sitting out at {formatScore(s.team.score)}</span>
            </div>
            <span className="fj-out-note">No points to wager</span>
          </li>
        ))}
      </ul>

      <div className="fj-actions">
        <Button size="lg" className="fj-btn fj-btn-primary" disabled={!allReady} onClick={submit}>
          <Lock className="w-5 h-5" />
          Lock all wagers
        </Button>
        <span className="fj-progress" aria-live="polite">
          {allReady ? 'All wagers entered' : `${ready} of ${players.length} entered`}
        </span>
      </div>
    </section>
  );
}

/* ---------- Step 3 + 4: clue, timer, reveal, judging ---------- */

function ClueStep({
  final,
  players,
  wagers,
  judged,
  flipped,
  onReveal,
  onJudge,
  onFinish,
}: {
  final: FinalJeopardyClue;
  players: Player[];
  wagers: Record<string, number>;
  judged: Record<string, boolean>;
  flipped: boolean;
  onReveal: () => void;
  onJudge: (teamId: string, correct: boolean) => void;
  onFinish: () => void;
}) {
  const allJudged = players.every((p) => judged[p.team.id] !== undefined);

  return (
    <section className="fj-play" aria-label="Final Jeopardy clue">
      <div className={`fj-card ${flipped ? 'is-flipped' : ''}`}>
        <div className="fj-card-inner">
          <div className="fj-face fj-front" aria-hidden={flipped}>
            <p className="fj-clue">{final.clue}</p>
          </div>
          <div className="fj-face fj-back" aria-hidden={!flipped}>
            <p className="fj-resp-clue">{final.clue}</p>
            <p className="fj-response" aria-live="polite">
              {flipped ? final.response : ''}
            </p>
          </div>
        </div>
      </div>

      {!flipped ? (
        <>
          <Countdown running={!flipped} />
          <div className="fj-actions">
            <Button size="lg" className="fj-btn fj-btn-primary" onClick={onReveal} autoFocus>
              Reveal response
            </Button>
          </div>
        </>
      ) : (
        <div className="fj-judge">
          <ul className="fj-judge-list" aria-label="Judge each team">
            {players.map((p) => {
              const wager = wagers[p.team.id] ?? 0;
              const verdict = judged[p.team.id];
              const after = verdict === undefined ? null : p.team.score + (verdict ? wager : -wager);
              return (
                <li key={p.team.id} className="fj-judge-row" style={teamStyle(p.colorIndex)} data-verdict={verdict === undefined ? 'none' : verdict ? 'right' : 'wrong'}>
                  <span className="fj-chip" aria-hidden="true">
                    {teamInitials(p.team.name)}
                  </span>
                  <div className="fj-wager-who">
                    <span className="fj-team-name">{p.team.name}</span>
                    <span className="fj-team-score">
                      Wagered {formatScore(wager)}
                      {after !== null && <> and finishes with {formatScore(after)}</>}
                    </span>
                  </div>
                  <div className="fj-verdict" role="group" aria-label={`Judge ${p.team.name}`}>
                    <button
                      type="button"
                      className="fj-verdict-btn is-right"
                      aria-pressed={verdict === true}
                      aria-label={`${p.team.name} correct`}
                      onClick={() => onJudge(p.team.id, true)}
                    >
                      <Check className="w-6 h-6" strokeWidth={3.2} />
                      Correct
                    </button>
                    <button
                      type="button"
                      className="fj-verdict-btn is-wrong"
                      aria-pressed={verdict === false}
                      aria-label={`${p.team.name} incorrect`}
                      onClick={() => onJudge(p.team.id, false)}
                    >
                      <X className="w-6 h-6" strokeWidth={3.2} />
                      Incorrect
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
          <div className="fj-actions">
            <Button size="lg" className="fj-btn fj-btn-primary" disabled={!allJudged} onClick={onFinish}>
              Final scores
            </Button>
            {!allJudged && <span className="fj-progress">Judge every team to continue</span>}
          </div>
        </div>
      )}
    </section>
  );
}

/** 30 LED segments that go dark one per second, ticking over the last five. Click to pause. */
function Countdown({ running }: { running: boolean }) {
  const [remainingMs, setRemainingMs] = useState(THINK_SECONDS * 1000);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (!running || paused) return;
    let last = performance.now();
    const id = window.setInterval(() => {
      const now = performance.now();
      const dt = now - last;
      last = now;
      setRemainingMs((r) => Math.max(0, r - dt));
    }, 100);
    return () => window.clearInterval(id);
  }, [running, paused]);

  const secs = Math.ceil(remainingMs / 1000);
  useEffect(() => {
    if (!running) return;
    if (secs > 0 && secs <= URGENT_SECONDS) playSfx('tick');
    else if (secs === 0) playSfx('incorrect');
  }, [secs, running]);

  const urgent = secs <= URGENT_SECONDS;
  const expired = secs === 0;

  return (
    <div className="fj-timer" data-urgent={urgent} data-expired={expired} data-paused={paused}>
      <div className="fj-segments" aria-hidden="true">
        {Array.from({ length: THINK_SECONDS }, (_, i) => (
          <span key={i} className="fj-seg" data-on={i < secs} />
        ))}
      </div>
      <button
        type="button"
        className="fj-timer-btn"
        onClick={() => !expired && setPaused((p) => !p)}
        aria-label={expired ? "Time's up" : `${secs} seconds left. ${paused ? 'Resume' : 'Pause'} timer`}
      >
        <span className="fj-timer-num">{secs}</span>
        <span className="fj-timer-state">
          {expired ? (
            "Time's up"
          ) : paused ? (
            <>
              <Play className="w-4 h-4" /> Resume
            </>
          ) : (
            <>
              <Pause className="w-4 h-4" /> Pause
            </>
          )}
        </span>
      </button>
    </div>
  );
}
