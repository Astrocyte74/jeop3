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

// Red and green are deliberately absent: on the clue screen they mean "wrong" and "right", so a team
// can never look like a verdict.
export const TEAM_COLORS: TeamColor[] = [
  { name: 'Sky', main: '#4da3ff', soft: 'rgba(77,163,255,0.16)', onMain: '#041a33' },
  { name: 'Amber', main: '#ffb300', soft: 'rgba(255,179,0,0.16)', onMain: '#2b1d00' },
  { name: 'Violet', main: '#ab7df5', soft: 'rgba(171,125,245,0.16)', onMain: '#ffffff' },
  { name: 'Cyan', main: '#22d3ee', soft: 'rgba(34,211,238,0.16)', onMain: '#052a33' },
  { name: 'Pink', main: '#ff6fae', soft: 'rgba(255,111,174,0.16)', onMain: '#35081c' },
  { name: 'Indigo', main: '#7c8cff', soft: 'rgba(124,140,255,0.16)', onMain: '#0b1033' },
  { name: 'Sand', main: '#d6b98c', soft: 'rgba(214,185,140,0.16)', onMain: '#2a1f0e' },
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
