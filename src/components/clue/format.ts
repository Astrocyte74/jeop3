export function formatMoney(n: number): string {
  return n < 0 ? `−$${Math.abs(n)}` : `$${n}`;
}
