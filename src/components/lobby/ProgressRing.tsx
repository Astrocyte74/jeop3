interface ProgressRingProps {
  percent: number;
  size?: number;
  stroke?: number;
  /** Show the number in the middle */
  label?: boolean;
  className?: string;
}

/** Circular progress using the lobby accent colour. */
export function ProgressRing({ percent, size = 40, stroke = 4, label = true, className }: ProgressRingProps) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, percent));
  return (
    <div
      className={`relative shrink-0 ${className ?? ''}`}
      style={{ width: size, height: size }}
      role="img"
      aria-label={`${pct}% complete`}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={pct >= 100 ? 'var(--lb-success)' : 'var(--lb-accent)'}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - pct / 100)}
          style={{ transition: 'stroke-dashoffset 600ms cubic-bezier(.2,.8,.2,1)' }}
        />
      </svg>
      {label && (
        <span
          className="absolute inset-0 flex items-center justify-center font-semibold tabular-nums text-white/90"
          style={{ fontSize: Math.max(9, size * 0.28) }}
        >
          {pct}
        </span>
      )}
    </div>
  );
}
