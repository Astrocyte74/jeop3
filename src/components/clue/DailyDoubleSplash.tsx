interface DailyDoubleSplashProps {
  categoryTitle: string;
  onSkip: () => void;
}

/**
 * The "DAILY DOUBLE!" moment. Each word is printed twice: a solid gold copy and
 * an outlined echo that slams apart and pulses back together. The clue stays hidden.
 */
export function DailyDoubleSplash({ categoryTitle, onSkip }: DailyDoubleSplashProps) {
  return (
    <div className="dd-splash" onClick={onSkip} role="status" aria-live="assertive">
      <div className="dd-rays" aria-hidden="true" />
      <div className="dd-flash" aria-hidden="true" />
      <h2 className="dd-word" aria-label="Daily Double!">
        <span className="dd-line" data-text="Daily" aria-hidden="true">
          Daily
        </span>
        <span className="dd-line" data-text="Double!" aria-hidden="true">
          Double!
        </span>
      </h2>
      <p className="dd-splash-cat">{categoryTitle}</p>
    </div>
  );
}
