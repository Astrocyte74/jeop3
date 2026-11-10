import { useEffect, useMemo } from 'react';
import { Undo2, MonitorUp } from 'lucide-react';
import { useHostClient } from '@/lib/hostLink/useHostLinks';
import type { HostCommand, HostSnapshot } from '@/lib/hostLink/protocol';
import { formatMoney } from '@/lib/money';
import { teamColor } from '@/lib/teamColors';
import { HostBoard } from './HostBoard';
import { HostClue } from './HostClue';
import { HostFinal } from './HostFinal';
import './host.css';

type Game = NonNullable<HostSnapshot['game']>;

function isTextField(t: EventTarget | null): boolean {
  const el = t as HTMLElement | null;
  if (!el || !el.tagName) return false;
  return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable;
}

/** Keys that mirror the TV's: Space judge, 1-4 who is answering, C/W verdict, 0 nobody, Enter continue, Z undo. */
function useHostKeys(game: Game | null, send: (c: HostCommand) => void, enabled: boolean) {
  useEffect(() => {
    if (!enabled || !game) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey || isTextField(e.target)) return;
      const clue = game.clue;
      const key = e.key.toLowerCase();
      const onButton = !!(e.target as HTMLElement | null)?.closest?.('button, a, summary');

      if (key === 'z') {
        e.preventDefault();
        if (!clue && game.canUndo) send({ type: 'undo' });
        return;
      }
      if (!clue) return;
      const ddPre = clue.dailyDouble && clue.ddPhase !== 'play';
      if (clue.dailyDouble && clue.ddPhase === 'splash') {
        if (e.key === ' ' || e.key === 'Enter') {
          e.preventDefault();
          send({ type: 'ddContinue' });
        }
        return;
      }
      if (ddPre) return; // the wager form handles its own Enter

      if (e.repeat) return;
      if (e.key === ' ') {
        if (onButton) return;
        e.preventDefault();
        if (!clue.revealed) send({ type: 'judge' });
        return;
      }
      if (clue.finished && !clue.dailyDouble) {
        if (e.key === 'Enter' && !onButton) {
          e.preventDefault();
          send({ type: 'continue' });
        }
        return;
      }
      if (key === 'p' && clue.timer) {
        e.preventDefault();
        send({ type: 'timer', action: clue.timer.paused ? 'resume' : 'pause' });
        return;
      }
      if (e.key === '+' || e.key === '=') {
        e.preventDefault();
        send({ type: 'timer', action: 'add', seconds: 10 });
        return;
      }
      if (clue.settling) return;
      const who = clue.dailyDouble ? clue.wagerTeamId : clue.inPlayId;
      if (e.key === '0' && !clue.dailyDouble) {
        e.preventDefault();
        send({ type: 'nobody' });
        return;
      }
      if (who && (key === 'c' || (e.key === 'Enter' && !onButton))) {
        e.preventDefault();
        send({ type: 'correct', teamId: who });
        return;
      }
      if (who && (key === 'w' || key === 'backspace')) {
        e.preventDefault();
        send({ type: 'wrong', teamId: who });
        return;
      }
      const digit = /^[1-9]$/.exec(e.key);
      if (digit && !clue.dailyDouble) {
        const team = game.teams[Number(digit[0]) - 1];
        if (team && !clue.misses.some((m) => m.teamId === team.id)) {
          e.preventDefault();
          send({ type: 'setAnswering', teamId: team.id });
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [enabled, game, send]);
}

function Waiting({ title, body, children }: { title: string; body: string; children?: React.ReactNode }) {
  return (
    <div className="host-empty" role="status">
      <MonitorUp className="host-empty-icon" aria-hidden="true" />
      <h1>{title}</h1>
      <p>{body}</p>
      {children}
    </div>
  );
}

/** The second-window remote: shows the answer, and drives the game in the main (TV) window. */
export default function HostView() {
  const { status, snapshot, send, takeOver, supported } = useHostClient();
  const game = snapshot?.game ?? null;
  const live = status === 'connected' && !!game;
  useHostKeys(game, send, live);

  useEffect(() => {
    document.title = game ? `Host · ${game.title}` : 'Host view';
  }, [game]);

  const leader = useMemo(() => (game ? Math.max(...game.teams.map((t) => t.score)) : 0), [game]);

  if (!supported) {
    return <Waiting title="This browser can't link windows" body="The host view needs BroadcastChannel, which is missing here. Try a current Chrome, Edge, Firefox or Safari." />;
  }
  if (status === 'superseded') {
    return (
      <Waiting title="Another host window took over" body="Only one host window controls the game at a time.">
        <button type="button" className="host-btn host-btn--gold" onClick={takeOver}>Take control here</button>
      </Waiting>
    );
  }
  if (status === 'lost') {
    return <Waiting title="Lost the game window" body="Keep the main window open. This screen reconnects by itself, or reload it." />;
  }
  if (!snapshot) {
    return <Waiting title="Looking for the game window…" body="Open Jeop3 in the main window, then start or resume a game there." />;
  }
  if (!game) {
    return <Waiting title="No game running" body="Start or resume a game in the main window." />;
  }

  const final = game.final;
  const finalActive = !!final && (final.open || (game.cluesLeft === 0 && !final.done));

  return (
    <div className="host-shell">
      <header className="host-top">
        <div className="host-title">
          <span className="host-eyebrow">Host view</span>
          <h1>{game.title}</h1>
        </div>
        <div className="host-top-right">
          <span className="host-live" title="Connected to the game window"><i aria-hidden="true" /> Connected</span>
          <button
            type="button"
            className="host-btn"
            onClick={() => send({ type: 'undo' })}
            disabled={!game.canUndo || !!game.clue || game.snakeOpen || !!final?.open}
            title="Undo the last clue (Z)"
          >
            <Undo2 aria-hidden="true" /> Undo <kbd>Z</kbd>
          </button>
        </div>
      </header>

      <main className="host-main">
        {game.clue ? (
          <HostClue clue={game.clue} game={game} send={send} />
        ) : game.snakeOpen ? (
          <div className="host-note">A Trivia Snake round is on the TV. Scores update when it finishes.</div>
        ) : finalActive && final ? (
          <HostFinal final={final} />
        ) : (
          <HostBoard game={game} send={send} />
        )}
      </main>

      <footer className="host-scores" aria-label="Scores">
        {game.teams.map((team, i) => {
          const c = teamColor(i);
          const picks = !game.clue && game.activeTeamId === team.id;
          return (
            <div
              key={team.id}
              className="host-team"
              data-picks={picks}
              data-leader={team.score > 0 && team.score === leader}
              style={{ ['--tc' as string]: c.main, ['--tc-on' as string]: c.onMain }}
            >
              {picks && <span className="host-team-tag">Picks</span>}
              <span className="host-team-name">{team.name}</span>
              <span className="host-team-score" data-negative={team.score < 0}>{formatMoney(team.score)}</span>
            </div>
          );
        })}
      </footer>
    </div>
  );
}
