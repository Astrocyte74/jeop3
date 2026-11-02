/** Shared, scoped keyframes for wizard step transitions. Disabled under prefers-reduced-motion. */
export function WizardMotion() {
  return (
    <style>{`
      @keyframes wiz-enter { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
      @keyframes wiz-pop { 0% { opacity: 0; transform: scale(.9); } 100% { opacity: 1; transform: none; } }
      .wiz-enter { animation: wiz-enter 260ms cubic-bezier(.2,.7,.2,1) both; }
      .wiz-pop { animation: wiz-pop 300ms cubic-bezier(.2,.8,.3,1.2) both; }
      @media (prefers-reduced-motion: reduce) { .wiz-enter, .wiz-pop { animation: none; } }
    `}</style>
  );
}
