/** Logotype: each letter is a lit board tile that flickers on at load. */
export function LobbyLogo() {
  const word = 'JEOPARDY';
  return (
    <div className="flex flex-col gap-2">
      <h1 aria-label="Jeopardy" className="lobby-logo m-0 flex gap-[5px]">
        {word.split('').map((ch, i) => (
          <span
            key={i}
            aria-hidden="true"
            className="lobby-logo-tile"
            style={{ animationDelay: `${120 + i * 90}ms` }}
          >
            {ch}
          </span>
        ))}
      </h1>
      <p className="m-0 text-sm text-white/60">Pick a board, name your teams, play.</p>
    </div>
  );
}
