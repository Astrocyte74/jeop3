You're picking up the AI-pipeline side of three features in jeop3 (React 19 + TS + Vite; Node/Express AI proxy in server/). Repo: /Users/markdarby/projects/jeop3/jeop3, branch feature/wizard-redesign. Do not push. Commit in small logical commits with clear messages.

PREREQUISITE (met): Claude's design commits are in. HEAD is `01396a9` ("editor: Daily Double pins and Final Jeopardy panel"), on top of `0bdde5c` ("play: Daily Double, Final Jeopardy, per-team stats; fix library editor save"). They added, in src/lib/storage.ts: `Clue.dailyDouble?`, `Game.finalJeopardy?: { category; clue; response }` (type `FinalJeopardyClue`), `GameState.log / dailyDoubles / final`; and a pure module src/lib/gameState.ts (pickDailyDoubles, applyClueResult, applyFinalResults, computeTeamStats, maxDailyDoubleWager, MIN_WAGER…).

TASK 1 — Typed generation-stage events (replaces string matching)
The wizard shows a live "board building" view (src/components/wizard/GenerationTheatre.tsx, generationStages.ts). It currently infers the stage by text-matching the `loadingStage` string that MainMenu.tsx sets via setWizardStage()/setWizardProgress(). Make it accurate:
- Define `GenerationStage` ('categories' | 'facts' | 'retrieval' | 'answers' | 'clues' | 'judging' | 'verifying' | 'final' | 'titles' | 'teams') and a `GenerationProgress` event { stage; categoryIndex?; categoryTitle?; completed?; total?; message? } in src/lib/ai/types.ts.
- Thread an optional `onProgress(event)` through the pipeline entry points in src/lib/ai/board.ts / service.ts / verification.ts, emitting at real boundaries (per category where applicable; a failed category should emit too).
- MainMenu.handleWizardComplete (src/components/MainMenu.tsx) passes onProgress and forwards events to the wizard; update generationStages.ts / GenerationTheatre.tsx to consume stage IDs and the real categoryTitle/completed counts. Keep the old string path as a fallback so nothing breaks. Frontend edits are limited to those three files plus the minimal MainMenu lines; no restyling.

TASK 2 — Real cancellation
Today "Cancel build" is UI-only: MainMenu bumps `wizardRunRef` and ignores the late result (see handleWizardCancel and the isStale()/setRunError guards in handleWizardComplete). Add an AbortSignal through generateAI → fetch calls (service.ts), the board pipeline and the verification pass, and have handleWizardCancel call controller.abort() (keep the stale-run guard as a backstop). Aborted runs must not surface as errors in the wizard, must not leave isWizardGenerating stuck, and should stop issuing further model calls. Add tests for abort behaviour where feasible.

TASK 3 — Generate a Final Jeopardy clue (and let the wizard opt in)
- Pipeline: after the main board is built, generate ONE Final Jeopardy item { category, clue, response } — thematically tied to the game topic, harder than the $1000 row, a single unambiguous answer. Run it through the same independent verification pass; if it fails verification, drop it rather than ship it (no Final is better than a wrong one). Record provenance/verification on it consistently with clues (extend the FinalJeopardyClue type additively if needed, keeping Claude's fields).
- Plumb it into the generated game data and MainMenu.handleAIPreviewConfirm so the saved Game gets `finalJeopardy`. Show it in the AI preview (src/components/ai/AIPreviewDialog.tsx — minimal, additive: a collapsed "Final Jeopardy" row with its verification badge; no restyling).
- Wizard: add an "Include Final Jeopardy" toggle, default ON, in src/components/NewGameWizard.tsx (minimal additive change next to existing options) and pass it through WizardCompleteData.
- Optional if cheap: let the pipeline suggest which clue should be the Daily Double (set `dailyDouble: true` on one clue from rows 3–5 that is more surprising than its value suggests). If you skip it, random placement in gameState.pickDailyDoubles already covers it.

TASK 4 — Tests for scoring + stats (per-team correct/incorrect)
Per-team tracking is implemented in src/lib/gameState.ts (applyClueResult appends to GameState.log; computeTeamStats derives per-team correct/incorrect/accuracy/points). Do NOT redesign it. Add unit tests covering: applyClueResult (correct/incorrect, custom amount for Daily Double wagers, `used` marking, log entries), applyFinalResults (wagers/results/log, team scores), pickDailyDoubles with an injected rand (pinned clues win; excludes the top row and empty clues; 1 vs 2 DDs by board size), computeTeamStats (old saves with no log → zero rows, accuracy null), maxDailyDoubleWager. The module is TypeScript and the existing tests are `node --test` .mjs files (`npm run test:ai`; there is no `npm test` script) — choose a way to import it (e.g. Node's TS stripping if the installed Node supports it, or a tiny esbuild/tsx step already available in node_modules; don't add heavy dependencies) and add an npm script for it. If you find a real bug in gameState.ts, fix it and tell me.

BOUNDARIES
- Claude owns design: don't restyle components; src/App.tsx, src/components/{ClueDialog,GameBoard,EndGame,FinalJeopardy,EditorBoard}.tsx and src/components/{clue,board,editor,lobby}/ are off-limits unless a compile error forces a one-line surgical change (tell me if so).
- Everything under server/, scripts/, src/lib/ai/ is yours.
- Don't touch .claude/ or game-files/.
- Keep storage changes additive/optional; older saved games must still load.

DONE WHEN
- `npx tsc --noEmit -p tsconfig.app.json`, the test scripts (`npm run test:ai` plus your new scoring-test script) and `npm run build` pass on a clean checkout of committed HEAD.
- One real wizard generation (small board, gpt-6-luna) shows accurate per-stage progress, produces a verified Final Jeopardy that appears in the preview and plays after Save, and Cancel mid-run actually stops model calls (confirm in server logs).
- Report: commits made, anything you left out, and any follow-ups.
