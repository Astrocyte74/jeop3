import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Crown, Eye, Home, RotateCcw, Star, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { teamColor, teamInitials } from '@/lib/teamColors';
import type { GameState } from '@/lib/storage';
import { computeTeamStats, type TeamStats } from '@/lib/gameState';
import { playSfx } from '@/lib/sfx';
import { AnimatedScore, formatScore } from '@/components/board/AnimatedScore';
import { Confetti } from '@/components/board/Confetti';
import { useReducedMotion } from '@/components/board/useReducedMotion';

export interface EndGameTeam {
  id: string;
  name: string;
  score: number;
}

interface EndGameProps {
  gameTitle: string;
  teams: EndGameTeam[];
  /** Clues that were played (all of them, when the finale shows). */
  cluesPlayed: number;
  /** Sum of the dollar values of every played clue. */
  pointsInPlay: number;
  onPlayAgain?: () => void;
  onBackToMenu: () => void;
  onViewBoard: () => void;
  /** Full game state. When it carries a result log, per-team stats are shown; older saves without one hide them. */
  state?: GameState;
}

interface Ranked extends EndGameTeam {
  colorIndex: number;
  rank: number;
}

function joinNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

const BUILD_STEP_MS = 420;
const REVEAL_PAD_MS = 650;

export function EndGame({ gameTitle, teams, cluesPlayed, pointsInPlay, onPlayAgain, onBackToMenu, onViewBoard, state }: EndGameProps) {
  const reduced = useReducedMotion();

  // Rank with ties sharing a place (1, 1, 3 ...)
  const ranked: Ranked[] = useMemo(() => {
    const withIdx = teams.map((t, colorIndex) => ({ ...t, colorIndex }));
    const sorted = [...withIdx].sort((a, b) => b.score - a.score || a.colorIndex - b.colorIndex);
    return sorted.map((t) => {
      const firstSame = sorted.findIndex((s) => s.score === t.score);
      return { ...t, rank: firstSame + 1 };
    });
  }, [teams]);

  const n = ranked.length;
  const winners = ranked.filter((t) => t.rank === 1);
  const isTie = n > 1 && winners.length > 1;
  const solo = n === 1;
  const topScore = ranked[0]?.score ?? 0;
  const runnerUp = ranked.find((t) => t.rank > 1);
  const margin = !isTie && runnerUp ? topScore - runnerUp.score : null;
  const maxRank = Math.max(...ranked.map((t) => t.rank), 1);

  // Podium order: 2nd, 1st, 3rd, 4th so the leader stands in the middle
  const podium: Ranked[] = useMemo(() => {
    if (n >= 3) {
      const [a, b, ...rest] = ranked;
      return [b, a, ...rest];
    }
    if (n === 2) return [ranked[1], ranked[0]];
    return ranked;
  }, [ranked, n]);

  const ceremony = n >= 2 && !reduced;
  const buildMs = ceremony ? maxRank * BUILD_STEP_MS + REVEAL_PAD_MS : 0;

  const [grown, setGrown] = useState(!ceremony);
  const [revealed, setRevealed] = useState(!ceremony);
  const fanfared = useRef(false);

  useEffect(() => {
    if (!ceremony) return;
    const raf = requestAnimationFrame(() => setGrown(true));
    const t = window.setTimeout(() => setRevealed(true), buildMs);
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(t);
    };
  }, [ceremony, buildMs]);

  useEffect(() => {
    if (!revealed || fanfared.current) return;
    fanfared.current = true;
    playSfx('fanfare');
  }, [revealed]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onViewBoard();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onViewBoard]);

  const confettiColors = useMemo(
    () => [...winners.map((w) => teamColor(w.colorIndex).main), ...ranked.map((t) => teamColor(t.colorIndex).main)],
    [winners, ranked],
  );

  const positive = ranked.filter((t) => t.score > 0).map((t) => t.score);
  const maxScore = positive.length ? Math.max(...positive) : 0;
  const proportion = (score: number) => (score > 0 && maxScore > 0 ? Math.max(0.2, score / maxScore) : 0.14);

  const headline = solo ? ranked[0].name : isTie ? "It's a tie" : winners[0].name;
  const subline = solo
    ? `finished with ${formatScore(topScore)}`
    : isTie
      ? `${joinNames(winners.map((w) => w.name))} share the lead at ${formatScore(topScore)}`
      : `wins with ${formatScore(topScore)}`;
  const accent = teamColor(winners[0]?.colorIndex ?? 0).main;

  // Per-team stats come from the result log; saves that predate it simply show none
  const teamStats = useMemo(() => {
    if (!state || !state.log || state.log.length === 0) return null;
    const byTeam = new Map<string, TeamStats>(computeTeamStats(state).map((x) => [x.teamId, x]));
    return byTeam;
  }, [state]);
  const dailyDoubles = useMemo(
    () => (state?.log ?? []).filter((r) => r.dailyDouble),
    [state],
  );
  const nameOf = (id: string) => teams.find((t) => t.id === id)?.name ?? 'A team';

  const stats: Array<{ value: string; label: string }> = [
    { value: String(cluesPlayed), label: cluesPlayed === 1 ? 'clue played' : 'clues played' },
    { value: formatScore(pointsInPlay), label: 'on the board' },
  ];
  if (margin !== null && margin > 0) stats.push({ value: formatScore(margin), label: 'winning margin' });
  for (const dd of dailyDoubles) {
    stats.push({
      value: formatScore(Math.abs(dd.delta)),
      label: dd.correct ? `${nameOf(dd.teamId)} won the Daily Double` : `${nameOf(dd.teamId)} lost the Daily Double`,
    });
  }

  return (
    <div
      className={`finale ${revealed ? 'is-revealed' : ''} ${reduced ? 'is-still' : ''} ${teamStats ? 'has-teamstats' : ''}`}
      role="dialog"
      aria-modal="true"
      aria-label="Final results"
      style={{ ['--finale-accent' as string]: accent }}
    >
      <div className="finale-beams" aria-hidden="true" />
      <Confetti fire={revealed && !reduced} colors={confettiColors} />

      <div className="finale-inner">
        <p className="finale-game-title">{gameTitle}</p>

        {/* Headline: suspense line first, then the winner stamps in */}
        <div className="finale-headline-slot">
          <div className="finale-stack">
            {ceremony && (
              <h2 className="finale-suspense" aria-hidden="true">
                And the winner is&hellip;
              </h2>
            )}
            <h2 className="finale-headline" aria-live="polite">
              {headline}
            </h2>
          </div>
          <p className="finale-subline">{subline}</p>
        </div>

        {/* Podium: block height is proportional to the final score */}
        <div className={`finale-podium count-${n}`} role="list" aria-label="Final standings">
          {podium.map((t) => {
            const c = teamColor(t.colorIndex);
            const isWinner = t.rank === 1 && n > 1;
            const negative = t.score < 0;
            const delay = ceremony ? (maxRank - t.rank) * BUILD_STEP_MS : 0;
            return (
              <div
                key={t.id}
                role="listitem"
                className={`podium-col ${isWinner ? 'is-winner' : ''}`}
                style={{
                  ['--tc' as string]: c.main,
                  ['--tc-on' as string]: c.onMain,
                  ['--tc-soft' as string]: c.soft,
                  ['--p' as string]: grown ? proportion(t.score) : 0,
                  ['--delay' as string]: `${delay}ms`,
                }}
              >
                <div className="podium-label">
                  {isWinner && (
                    <Crown className="podium-crown" aria-label="Winner" strokeWidth={2.4} />
                  )}
                  <span className="podium-avatar" aria-hidden="true">
                    {teamInitials(t.name)}
                  </span>
                  <span className="podium-name">{t.name}</span>
                  <AnimatedScore
                    value={t.score}
                    initial={0}
                    duration={ceremony ? buildMs - REVEAL_PAD_MS + 500 : 0}
                    flash={false}
                    className={`podium-score ${negative ? 'is-negative' : ''}`}
                  />
                </div>
                <div className={`podium-block ${negative ? 'is-negative' : ''}`}>
                  {proportion(t.score) >= 0.3 && (
                    <span className="podium-rank" aria-hidden="true">
                      {t.rank}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {teamStats && (
          <ul className="finale-teamstats" aria-label="Team stats">
            {podium.map((t) => {
              const st = teamStats.get(t.id);
              if (!st) return null;
              const c = teamColor(t.colorIndex);
              const wager = state?.final?.wagers[t.id];
              const finalRight = state?.final?.results[t.id];
              const answered = st.correct + st.incorrect;
              return (
                <li
                  key={t.id}
                  className="team-stat"
                  style={{ ['--tc' as string]: c.main, ['--tc-soft' as string]: c.soft }}
                  aria-label={`${t.name} stats`}
                >
                  <span className="team-stat-name">{t.name}</span>
                  <div className="team-stat-record">
                    <span className="team-stat-right" aria-label={`${st.correct} correct`}>
                      <Check className="w-5 h-5" strokeWidth={3.2} aria-hidden="true" />
                      {st.correct}
                    </span>
                    <span className="team-stat-wrong" aria-label={`${st.incorrect} incorrect`}>
                      <X className="w-5 h-5" strokeWidth={3.2} aria-hidden="true" />
                      {st.incorrect}
                    </span>
                    {st.accuracy !== null && answered > 0 && (
                      <span className="team-stat-acc">{Math.round(st.accuracy * 100)}% accuracy</span>
                    )}
                  </div>
                  {(st.dailyDoubleHit || (wager !== undefined && finalRight !== undefined)) && (
                    <div className="team-stat-badges">
                      {st.dailyDoubleHit && (
                        <span className="team-stat-badge is-dd">
                          <Star className="w-4 h-4" aria-hidden="true" /> Daily Double hit
                        </span>
                      )}
                      {wager !== undefined && finalRight !== undefined && (
                        <span className={`team-stat-badge ${finalRight ? 'is-win' : 'is-loss'}`}>
                          {wager === 0 ? 'Final Jeopardy: wagered $0' : `Final Jeopardy ${finalRight ? 'won' : 'lost'} ${formatScore(wager)}`}
                        </span>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        <ul className="finale-stats" aria-label="Game stats">
          {stats.map((s) => (
            <li key={s.label}>
              <span className="finale-stat-value">{s.value}</span>
              <span className="finale-stat-label">{s.label}</span>
            </li>
          ))}
        </ul>

        <div className="finale-actions">
          {onPlayAgain && (
            <Button
              size="lg"
              className="finale-btn finale-btn-primary"
              onClick={onPlayAgain}
              autoFocus
            >
              <RotateCcw className="w-5 h-5" />
              Play again
            </Button>
          )}
          <Button size="lg" variant="outline" className="finale-btn" onClick={onViewBoard}>
            <Eye className="w-5 h-5" />
            View board
          </Button>
          <Button size="lg" variant="ghost" className="finale-btn" onClick={onBackToMenu}>
            <Home className="w-5 h-5" />
            Back to menu
          </Button>
        </div>
      </div>
    </div>
  );
}
