# Jeop3: host view (second window) + board, clue and lobby polish

You are working in `/Users/markdarby/projects/jeop3/jeop3`, a React + Vite + TypeScript Jeopardy-style party game played on a TV. A host runs it from a laptop. Work on the current branch `feature/wizard-redesign`. Commit each numbered item separately with a clear message. **Do not push.**

The dev server is configured in `.claude/launch.json` as `jeop3-web` (port 8345). Check every visible change in the browser at about 1600×900 (the TV case) and at a laptop size.

Before you finish, all of these must pass:
- `npm run build`
- `npm run lint`
- `npm run test:state`
- `node --test scripts/test-clue-attempts.mjs`

## Ground rules
- Keep the current visual language: dark navy board, gold values, Bebas-style display type, and the existing `cs-*` (clue screen) and `lobby-*` classes. Extend what is there instead of adding a new design system.
- Respect reduced motion (`src/components/board/useReducedMotion.ts`) for every new animation.
- Do not remove or shrink `sources[].text` on saved categories, because regeneration uses it.
- Do not delete or migrate anything in the user's localStorage (`jeop3:*` keys).
- Text-to-speech was removed on purpose. Do not re-add it.
- Phone/remote-device control is **out of scope** (planned later). Structure the host link so that a network transport can be added later without rewriting the UI.

## Key code map
- `src/App.tsx` owns the app mode (`menu` / board / editor…), `currentGame`, `gameState` (scores, used tiles, active team), undo, and renders `MainMenu`, `GameBoard` and `ClueDialog`.
- `src/components/ClueDialog.tsx` is the full-screen clue/answer screen. Its internal state includes:
  - `attempts` (reducer in `src/lib/clueAttempts.ts`: misses, winner, judging, revealed, finished)
  - `showResponse`
  - the Daily Double phases (`splash` → `wager` → `play`) and the wager
  - `inPlayId` (the team answering)
  - `settle()`, which calls `onMarkCorrect` / `onMarkIncorrect` after `SETTLE_MS`, when the host presses Continue (`finishClue`)
- `src/components/clue/ThinkTimer.tsx` is the countdown. ClueDialog passes `running = isOpen && !showResponse && !hasSnakeResult`.
- `src/components/clue/TeamDock.tsx` is the team/score strip on the clue screen. It uses `formatMoney` from `src/components/clue/format.ts`.
- `src/components/board/AnimatedScore.tsx` has `formatScore` (with thousands separators) and the count-up/flash used on the board.
- `src/components/GameBoard.tsx` is the board: tiles, keyboard navigation, team strip, finale and the Final Jeopardy call to action.
- `src/components/MainMenu.tsx` plus `src/components/lobby/*` make up the lobby: `GameHero`, `GameCard`, `MiniBoard`, `GameCardMenu`, `LibraryToolbar` and `NewGameCard`.
- `src/lib/storage.ts` holds the game and state types and localStorage helpers.
- `src/lib/sfx.ts` handles sound effects.

---

## 1. Host view in a second window (main feature)

**Goal:** the TV must never show the answer before the verdict, but the host needs to see it in order to judge. Add a host view that runs in a second browser window on the same computer. The typical setup is a laptop plugged into a TV with the display extended: the game window goes on the TV and the host window stays on the laptop.

### Transport
Create `src/lib/hostLink/`:
- **`protocol.ts`:** typed messages with a version field.
- **`broadcastTransport.ts`:** uses `BroadcastChannel('jeop3-host')`.
- **A small transport interface** (`send`, `subscribe`, `close`), so a WebSocket transport can be added later for phones.

### Authority
The TV window (the existing app) stays the single source of truth. The host window is a remote control: it renders snapshots and sends commands.

**TV → host: `snapshot`**, sent on every relevant change and in reply to `hello`. It contains:
- the game title
- the board: categories, values, which tiles are used, and which tiles are Daily Doubles (marked **only** in the host snapshot)
- the teams, their scores and the active team
- the rules

When a clue is open, it also contains:
- the category, value, clue text, **response** and sources/evidence for that clue (reuse whatever `SourceChips` and the editor read)
- whether it is a Daily Double, the DD phase and the wager
- the attempts state and `inPlayId`
- the timer's seconds left, paused, and expired

**Host → TV: commands.**
- `openClue {c, r}`
- `judge` (the same as clicking the clue / "Judge answer")
- `correct {teamId}`, `wrong {teamId}`, `nobody`
- `continue`
- `setAnswering {teamId}`
- `timer {pause|resume|add}`
- `ddWager {amount}`, `ddContinue`
- `closeClue`, `undo`

Route the commands through the **same callbacks** the TV's own buttons use, so rules, steal logic, sounds and undo behave the same. This probably means:
- lifting a small command handler out of ClueDialog (for example an imperative handle or a `useHostCommands` hook it registers)
- adding the board-level commands in App/GameBoard

**Presence:**
- The host sends `hello`, followed by a `heartbeat` every 2 seconds.
- The TV treats the host as connected while heartbeats arrive (with a timeout of about 5 seconds).
- The TV only accepts commands while a host is connected.
- Only one host window controls at a time; the newest `hello` wins.

### Opening the host window
- Add an "Open host view" action. Put one entry in the lobby (near Resume/Play or in Table settings) and one in the board's top-right controls.
- It calls `window.open('/?view=host', 'jeop3-host', 'popup,width=…,height=…')`.
- `App.tsx` (or `main.tsx`) checks `?view=host` and renders a new `HostView` component instead of the normal app.
- When the host connects, the TV shows a small, unobtrusive "Host connected" indicator.

### Host view UI (`src/components/host/HostView.tsx` + `host.css`)
Design it for a laptop screen beside the TV. It must be legible at a glance, with large hit targets and keyboard shortcuts that match the TV's (Space to judge or show, 1–4 to pick a team, C/W for correct/wrong, Enter to continue, Z to undo).

- **Idle (board showing):**
  - a compact board for picking the next clue (Daily Double tiles get a subtle marker that only the host sees)
  - the scores, with whose pick it is
  - an Undo button
- **Clue open:**
  - the clue text
  - the **answer**, large and prominent, with its sources/evidence collapsed underneath
  - the team answering, with a team switcher
  - Correct / Wrong / Nobody got it
  - the timer, with pause/resume and +10s
  - Continue once the clue is finished
- **Daily Double:** a wager entry for the wagering team (reuse the cap logic in `src/components/clue/wager.ts`), then the same judging controls.
- **Final Jeopardy:** at minimum, show the Final clue and its answer to the host. Full remote control of Final Jeopardy wagers and judging can come later; note that in your summary.
- **Disconnected or no game running:** a clear state that says "Start or resume a game in the main window."

### TV behaviour while a host is connected
- Hide the Correct / Wrong / Nobody got it controls on the clue screen and show a quiet "Host is judging…" line instead. Keep the reveal of the answer *after* the verdict exactly as it is today.
- The board stays clickable as well; either window can pick a clue.
- When no host is connected, everything works exactly as it does today.

### Tests
Add `scripts/test-host-link.mjs`, following the style of the existing `scripts/test-*.mjs` files. It should cover:
- the protocol encode/decode
- presence timeouts
- rejecting commands when no host is connected

Then verify end-to-end in the browser with two tabs or windows: open a clue from the host, judge it, continue, check that the scores match in both windows, then undo.

---

## 2. Clue screen fixes

**a. Pause the timer while judging.**
- Today the countdown keeps running after the host clicks the clue to judge. It went from 29 to 22 while the Correct/Wrong buttons were on screen.
- Stop it once `attempts.judging` is true. Resume it (or restart it for the stealing team, if the existing steal flow implies that) after a Wrong answer passes play to another team.

**b. Show the score change at the moment of the verdict.**
- Scores currently update only when the host presses Continue (`settle` → `onMarkCorrect`), after the clue screen has closed, so nobody sees the change.
- When Correct or Wrong is clicked, immediately show a provisional change on that team's card in `TeamDock`:
  - a "+$800" or "−$800" floating label
  - a count-up using `AnimatedScore`
- Keep the real state change where it is now, so undo and steal logic are untouched. The displayed value must equal the real value after Continue, with no double count-up on the board.

**c. Use one money formatter.**
- The clue screen shows `$1200` (`formatMoney`) while the board shows `$1,200` (`formatScore`).
- Make one shared formatter with thousands separators and a proper minus sign, and use it everywhere scores or values are shown: the clue screen, board, wager panel, Final Jeopardy and finale.

**d. Fix the timer-ring glitch.**
- After a verdict, the timer ring squashes into a flat ellipse while it animates out.
- Fade or scale it uniformly instead.

**e. Make the judge step discoverable.**
- The whole clue area is an invisible "Judge answer" button.
- Add a faint hint under the clue, "Click or press Space to judge", that disappears after the first use in a session.
- Make "Nobody got it — reveal" larger and readable on a TV. It is currently tiny grey text.

---

## 3. Gameboard

**a. Make the team strip readable on a TV.**
- The team cards are about 120px wide and centred at 1600px.
- Scale them up so the score and name read from a couch. Spread them across the width for 2–4 teams.
- Keep the existing turn ("PICKS") and leader-crown semantics and team colours.

**b. Show progress.**
- Add a quiet indicator of how many clues are left (for example "18 clues left").
- If the game has a Final Jeopardy clue, add a subtle "Final Jeopardy next" marker once few clues remain.

**c. Played tiles.**
- Played tiles currently show a faint ghost "$200".
- Make them plain empty tiles, keeping their accessible label "(played)", so the remaining values stand out.

**d. Header controls.**
- Undo, Home and Settings are tiny icons.
- Make them larger, with visible labels or tooltips, and add the "Open host view" control here.
- Reduce the empty space around the title.

**e. Steal moment.**
- After a Wrong answer with steal on, briefly highlight (pulse) the next team's card on both the clue screen and the board strip, so the room knows who is up.

**f. Optional, only if time allows: board-fill intro.**
- When a game starts from fresh, cascade the tiles in, with an optional sound from `sfx.ts`.
- Skip it entirely with reduced motion.

---

## 4. Lobby (landing page)

**a. Hide test games, without deleting anything.**
- The library is mostly the user's own "ZZ-… test" games.
- Add "Hide from library" / "Unhide" to `GameCardMenu`, stored as a flag (in `GameMeta` or a separate localStorage key).
- Hidden games appear only under a "Hidden" filter in `LibraryToolbar`.

**b. Make covers recognisable.**
- Covers are generic coloured stripes, except the built-in sample.
- Make `MiniBoard`'s `cover` variant show the first few category names, or a topic icon from `src/lib/iconMatcher.ts` if that works offline, so games can be told apart at a glance.

**c. First-run help.**
- When the library has only the built-in sample game (or nothing beyond it), show a short three-step "how it works" strip next to the New game card: pick a topic → AI writes the board → play on the TV and judge from the host view.

---

## Not in this task
- Phone/remote-device host control. It is later; just keep the transport pluggable.
- Renaming the "JEOPARDY" branding.
- A `sourcePolicy` picker.

## When you finish
Reply with a short summary:
- what was built, per numbered item, with its commit hash
- what you verified in the browser, and how
- anything skipped or only partly done, and why
- any follow-ups (for example, remote control of Final Jeopardy from the host view)
