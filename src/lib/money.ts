/** The one way money is shown anywhere in the app: thousands separators and a real minus sign. */
export function formatMoney(n: number): string {
  const whole = Math.round(n);
  return `${whole < 0 ? '−' : ''}$${Math.abs(whole).toLocaleString('en-US')}`;
}

/** A signed change, e.g. "+$800" or "−$1,200". */
export function formatDelta(n: number): string {
  const whole = Math.round(n);
  return `${whole < 0 ? '−' : '+'}$${Math.abs(whole).toLocaleString('en-US')}`;
}
