import { useState } from 'react';
import { Check, X, Eye, Pause, Play, Plus, ArrowRight, Ban } from 'lucide-react';
import type { HostClue as HostClueState, HostCommand, HostSnapshot } from '@/lib/hostLink/protocol';
import { ClueSources } from '@/components/ai/SourceChips';
import { MIN_WAGER } from '@/lib/gameState';
import { halfWager, isLegalWager, parseWager } from '@/components/clue/wager';
import { formatDelta, formatMoney } from '@/lib/money';
import { teamColor } from '@/lib/teamColors';

type Game = NonNullable<HostSnapshot['game']>;

interface Props {
  clue: HostClueState;
  game: Game;
  send: (command: HostCommand) => void;
}

function WagerForm({ clue, game, send }: Props) {
  const team = game.teams.find((t) => t.id === (clue.wagerTeamId ?? game.activeTeamId));
  const [text, setText] = useState('');
  const cap = clue.wagerCap;
  const amount = parseWager(text);
  const legal = isLegalWager(amount, cap);
  const quick = [
    { label: 'Minimum', amount: MIN_WAGER },
    { label: 'Half', amount: halfWager(cap) },
    { label: 'All in', amount: cap },
  ];
  return (
    <form
      className="host-wager"
      onSubmit={(e) => {
        e.preventDefault();
        if (legal) send({ type: 'ddWager', amount });
      }}
    >
      <h3>{team ? `${team.name}, how much?` : 'Place a wager'}</h3>
      <p className="host-muted">
        {team ? `${team.name} has ${formatMoney(team.score)}. ` : ''}
        Up to {formatMoney(cap)}, minimum {formatMoney(MIN_WAGER)}.
      </p>
      <div className="host-wager-row">
        <input
          className="host-input"
          inputMode="numeric"
          autoFocus
          autoComplete="off"
          value={text}
          onChange={(e) => setText(e.target.value.replace(/[^\d]/g, ''))}
          placeholder="Wager"
          aria-label="Wager amount"
        />
        <button type="submit" className="host-btn host-btn--gold" disabled={!legal}>
          {legal ? `Lock in ${formatMoney(amount)}` : 'Lock in wager'} <kbd>Enter</kbd>
        </button>
      </div>
      <div className="host-wager-quick">
        {quick.map((q) => (
          <button key={q.label} type="button" className="host-btn" onClick={() => setText(String(q.amount))}>
            {q.label} {formatMoney(q.amount)}
          </button>
        ))}
      </div>
    </form>
  );
}

function TimerRow({ clue, send }: { clue: HostClueState; send: Props['send'] }) {
  const t = clue.timer;
  if (!t) return null;
  const state = t.expired ? "Time's up" : t.held ? 'Held while you judge' : t.paused ? 'Paused' : 'Running';
  return (
    <div className="host-timer" data-urgent={!t.expired && t.secondsLeft <= 5 && !t.held && !t.paused} data-expired={t.expired}>
      <span className="host-timer-num" aria-label={`${t.secondsLeft} seconds left`}>{t.secondsLeft}</span>
      <span className="host-timer-state">{state}</span>
      <button
        type="button"
        className="host-btn"
        onClick={() => send({ type: 'timer', action: t.paused ? 'resume' : 'pause' })}
        disabled={t.expired || t.held}
      >
        {t.paused ? <Play aria-hidden="true" /> : <Pause aria-hidden="true" />} {t.paused ? 'Resume' : 'Pause'} <kbd>P</kbd>
      </button>
      <button type="button" className="host-btn" onClick={() => send({ type: 'timer', action: 'add', seconds: 10 })}>
        <Plus aria-hidden="true" /> 10s <kbd>+</kbd>
      </button>
    </div>
  );
}

export function HostClue({ clue, game, send }: Props) {
  const dd = clue.dailyDouble;
  const ddPre = dd && clue.ddPhase !== 'play';
  const teams = game.teams;
  const missedIds = clue.misses.map((m) => m.teamId);
  const who = teams.find((t) => t.id === (dd ? clue.wagerTeamId : clue.inPlayId));
  const whoIndex = who ? teams.indexOf(who) : -1;
  const winner = teams.find((t) => t.id === clue.winnerId);
  const stealing = !dd && missedIds.length > 0 && !clue.revealed;
  const penalty = game.rules.wrongAnswerPenalty;
  const stake = dd ? (clue.wager ?? 0) : clue.value;
  const canVerdict = !ddPre && !!who && !clue.settling && !clue.finished;

  let status: string;
  if (clue.settling) status = 'Scoring…';
  else if (dd && clue.ddPhase === 'splash') status = 'The TV is showing the Daily Double splash.';
  else if (dd && clue.ddPhase === 'wager') status = 'Waiting for the wager.';
  else if (clue.finished) status = winner ? `${winner.name} got it right.` : 'No correct answer.';
  else if (clue.revealed) status = 'The answer is showing on the TV.';
  else if (clue.judging) status = who ? `Judging ${who.name}'s answer. The answer is still hidden on the TV.` : 'Judging.';
  else status = 'The TV shows the clue. The answer is hidden from the room.';

  const advanceLabel = !dd && game.rules.allowSteal && !clue.judging && !clue.revealed ? 'Judge answer' : 'Show answer on TV';

  return (
    <section className="host-clue" aria-label="Clue">
      <div className="host-clue-head">
        {dd && <span className="host-dd-pill">Daily Double</span>}
        {!ddPre && <span className="host-clue-value">{formatMoney(dd ? (clue.wager ?? 0) : clue.value)}</span>}
        <h2>{clue.category}</h2>
        <button
          type="button"
          className="host-btn host-btn--ghost"
          onClick={() => send({ type: 'closeClue' })}
          title="Close the clue without scoring anyone"
        >
          <X aria-hidden="true" /> Close without scoring
        </button>
      </div>

      {dd && clue.ddPhase === 'splash' && (
        <div className="host-ddsplash">
          <p>The TV is showing the Daily Double splash.</p>
          <button type="button" className="host-btn host-btn--gold" onClick={() => send({ type: 'ddContinue' })}>
            Skip to the wager <kbd>Space</kbd>
          </button>
        </div>
      )}

      {dd && clue.ddPhase === 'wager' && <WagerForm clue={clue} game={game} send={send} />}

      {!ddPre && (
        <>
          <p className="host-clue-text">{clue.clue}</p>

          <div className="host-answer" data-shown={clue.revealed}>
            <span className="host-answer-label">Answer · {clue.revealed ? 'showing on TV' : 'hidden from the room'}</span>
            <p>{clue.response}</p>
          </div>
          <div className="host-sources">
            <ClueSources clue={{ clue: clue.clue, response: clue.response, verification: clue.verification }} category={clue.category} />
          </div>

          <p className="host-status" role="status">{status}</p>

          {!dd && !clue.finished && teams.length > 1 && (
            <div className="host-who" role="group" aria-label="Who is answering">
              {teams.map((team, i) => {
                const c = teamColor(i);
                const missed = missedIds.includes(team.id);
                const on = team.id === clue.inPlayId;
                return (
                  <button
                    key={team.id}
                    type="button"
                    className="host-who-btn"
                    data-on={on}
                    data-missed={missed}
                    disabled={missed || clue.settling}
                    onClick={() => send({ type: 'setAnswering', teamId: team.id })}
                    style={{ ['--tc' as string]: c.main, ['--tc-on' as string]: c.onMain }}
                    aria-pressed={on}
                  >
                    <kbd>{i + 1}</kbd>
                    <span>{team.name}</span>
                    {missed && <em>missed</em>}
                    {on && stealing && <em>steal</em>}
                  </button>
                );
              })}
            </div>
          )}

          {clue.finished && !dd ? (
            <div className="host-continue">
              <button type="button" className="host-btn host-btn--gold host-btn--xl" onClick={() => send({ type: 'continue' })} disabled={clue.settling}>
                Continue <ArrowRight aria-hidden="true" /> <kbd>Enter</kbd>
              </button>
            </div>
          ) : (
            <div className="host-verdicts">
              <button
                type="button"
                className="host-verdict host-verdict--yes"
                disabled={!canVerdict}
                onClick={() => who && send({ type: 'correct', teamId: who.id })}
              >
                <Check aria-hidden="true" />
                <span>Correct{who ? ` · ${who.name}` : ''}</span>
                <small>{formatDelta(stake)} <kbd>C</kbd></small>
              </button>
              <button
                type="button"
                className="host-verdict host-verdict--no"
                disabled={!canVerdict}
                onClick={() => who && send({ type: 'wrong', teamId: who.id })}
              >
                <X aria-hidden="true" />
                <span>Wrong{who ? ` · ${who.name}` : ''}</span>
                <small>{dd || penalty ? formatDelta(-stake) : 'no penalty'} <kbd>W</kbd></small>
              </button>
            </div>
          )}

          {!clue.finished && (
            <div className="host-row">
              {!clue.revealed && (
                <button type="button" className="host-btn" onClick={() => send({ type: 'judge' })} disabled={clue.settling}>
                  <Eye aria-hidden="true" /> {advanceLabel} <kbd>Space</kbd>
                </button>
              )}
              {!dd && (
                <button type="button" className="host-btn" onClick={() => send({ type: 'nobody' })} disabled={clue.settling}>
                  <Ban aria-hidden="true" /> Nobody got it <kbd>0</kbd>
                </button>
              )}
              {dd && whoIndex >= 0 && <span className="host-muted">Only {who?.name} can score this clue.</span>}
              <TimerRow clue={clue} send={send} />
            </div>
          )}
        </>
      )}
    </section>
  );
}
