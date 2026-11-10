import type { HostFinal as HostFinalState } from '@/lib/hostLink/protocol';

/**
 * Final Jeopardy: the host can read the clue and the answer. Wagers and judging still run from the main
 * window; running them from here is a planned follow-up.
 */
export function HostFinal({ final }: { final: HostFinalState }) {
  return (
    <section className="host-clue" aria-label="Final Jeopardy">
      <div className="host-clue-head">
        <span className="host-dd-pill host-dd-pill--final">Final Jeopardy</span>
        <h2>{final.category}</h2>
      </div>
      <p className="host-clue-text">{final.clue}</p>
      <div className="host-answer">
        <span className="host-answer-label">Answer</span>
        <p>{final.response}</p>
      </div>
      <p className="host-note">
        {final.open
          ? 'Wagers, answers and judging are on the main window for now.'
          : 'Every clue is played. Start Final Jeopardy in the main window.'}
      </p>
    </section>
  );
}
