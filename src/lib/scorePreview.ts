// The clue screen shows a verdict's score change the moment it is given (a floating "+$800" and a
// count-up). The real score only changes after Continue, when the board's own cards would count up
// again. The clue screen records the score it already showed here so the board can snap to it.

const TTL_MS = 4000;
const shown = new Map<string, { score: number; at: number }>();

/** Replace the set of scores the clue screen has already counted up to. */
export function setScorePreviews(scores: Record<string, number>): void {
  const keep = new Set(Object.keys(scores));
  for (const id of [...shown.keys()]) if (!keep.has(id)) shown.delete(id);
  const at = Date.now();
  for (const [id, score] of Object.entries(scores)) shown.set(id, { score, at });
}

/** True (once) when this team's new score is the one the clue screen already showed. */
export function consumeScorePreview(teamId: string, score: number): boolean {
  const hit = shown.get(teamId);
  if (!hit) return false;
  if (Date.now() - hit.at > TTL_MS) {
    shown.delete(teamId);
    return false;
  }
  if (hit.score !== score) return false;
  shown.delete(teamId);
  return true;
}
