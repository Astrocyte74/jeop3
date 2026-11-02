// One shared team palette so scoreboard, clue dialog, finale and lobby all agree.
// Index-based: team N always gets the same colour. Hex values so they work in inline styles.

export interface TeamColor {
  /** Saturated accent (bars, rings, avatar fill) */
  main: string;
  /** Soft tint for backgrounds */
  soft: string;
  /** Readable text colour on `main` */
  onMain: string;
  name: string;
}

export const TEAM_COLORS: TeamColor[] = [
  { name: 'Coral', main: '#ef5350', soft: 'rgba(239,83,80,0.16)', onMain: '#ffffff' },
  { name: 'Sky', main: '#29b6f6', soft: 'rgba(41,182,246,0.16)', onMain: '#06202e' },
  { name: 'Lime', main: '#9ccc3c', soft: 'rgba(156,204,60,0.16)', onMain: '#1a2406' },
  { name: 'Amber', main: '#ffb300', soft: 'rgba(255,179,0,0.16)', onMain: '#2b1d00' },
  { name: 'Violet', main: '#ab7df5', soft: 'rgba(171,125,245,0.16)', onMain: '#ffffff' },
  { name: 'Teal', main: '#26c6a6', soft: 'rgba(38,198,166,0.16)', onMain: '#032620' },
  { name: 'Pink', main: '#ff6fae', soft: 'rgba(255,111,174,0.16)', onMain: '#35081c' },
  { name: 'Slate', main: '#90a4ae', soft: 'rgba(144,164,174,0.16)', onMain: '#10181c' },
];

export function teamColor(index: number): TeamColor {
  const n = TEAM_COLORS.length;
  return TEAM_COLORS[((index % n) + n) % n];
}

/** Up to two initials for an avatar chip. */
export function teamInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}
