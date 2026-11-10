import { Sparkles, MonitorPlay, MonitorUp } from 'lucide-react';

const STEPS = [
  { icon: Sparkles, title: 'Pick a topic', body: 'Choose anything: a book, a decade, your family.' },
  { icon: Sparkles, title: 'AI writes the board', body: 'Categories and clues, checked against sources.' },
  { icon: MonitorPlay, title: 'Play on the TV', body: 'Open the host view on your laptop to see answers and judge.' },
];

/** First-run help, shown next to "New game" until the library holds a game of your own. */
export function HowItWorks() {
  return (
    <section className="lobby-howto col-span-full sm:col-span-2" aria-label="How it works">
      <h3 className="lobby-howto-title">
        <MonitorUp className="size-4" aria-hidden="true" /> How it works
      </h3>
      <ol className="lobby-howto-steps">
        {STEPS.map((step, i) => (
          <li key={step.title}>
            <span className="lobby-howto-num" aria-hidden="true">{i + 1}</span>
            <span>
              <strong>{step.title}</strong>
              <span>{step.body}</span>
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}
