import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

// gameState.ts is TypeScript; bundle it to a temp .mjs the same way test-ai-verification.mjs does.
const dir = await mkdtemp(join(tmpdir(), 'jeop3-gamestate-'));
const out = join(dir, 'gameState.mjs');
await build({
  entryPoints: ['src/lib/gameState.ts'],
  outfile: out,
  bundle: true,
  format: 'esm',
  platform: 'node',
  logLevel: 'silent',
});
after(() => rm(dir, { recursive: true, force: true }));
const gs = await import(pathToFileURL(out).href);

const draftOut = join(dir, 'finalDraft.mjs');
await build({
  entryPoints: ['src/components/editor/finalDraft.ts'],
  outfile: draftOut,
  bundle: true,
  format: 'esm',
  platform: 'node',
  logLevel: 'silent',
});
const fd = await import(pathToFileURL(draftOut).href);

const rulesOut = join(dir, 'gameRules.mjs');
await build({
  entryPoints: ['src/lib/gameRules.ts'],
  outfile: rulesOut,
  bundle: true,
  format: 'esm',
  platform: 'node',
  logLevel: 'silent',
});
const gr = await import(pathToFileURL(rulesOut).href);

const clue = (value, extra = {}) => ({ value, clue: `clue ${value}`, response: `answer ${value}`, ...extra });
const column = (title, extra = {}) => ({ title, clues: [200, 400, 600, 800, 1000].map((v) => clue(v, extra[v] ?? {})) });
const board = (cats = 5, extra = {}) => ({
  title: 'Test',
  categories: Array.from({ length: cats }, (_, i) => column(`Cat ${i}`, extra[i] ?? {})),
});
const teams = () => [
  { id: 'a', name: 'A', score: 0 },
  { id: 'b', name: 'B', score: 0 },
];
const fresh = () => gs.createInitialState(board(), teams(), () => 0);

// Deterministic rand: cycles through the supplied values.
const seq = (...vals) => {
  let i = 0;
  return () => vals[i++ % vals.length];
};

test('clueKey and boardMaxValue', () => {
  assert.equal(gs.clueKey(2, 3), '2:3');
  assert.equal(gs.boardMaxValue(board()), 1000);
  assert.equal(gs.boardMaxValue({ title: 'x', categories: [] }), 0);
});

test('maxDailyDoubleWager is the larger of score, top clue value and the minimum', () => {
  const g = board();
  assert.equal(gs.maxDailyDoubleWager(300, g), 1000); // low score: top clue value
  assert.equal(gs.maxDailyDoubleWager(2500, g), 2500); // high score: own score
  assert.equal(gs.maxDailyDoubleWager(-700, g), 1000); // negative score still gets the top clue value
  assert.equal(gs.maxDailyDoubleWager(0, { title: 'x', categories: [] }), gs.MIN_WAGER);
});

test('pickDailyDoubles: author-pinned clues win over random placement', () => {
  const g = board(5, { 2: { 400: { dailyDouble: true } } });
  assert.deepEqual(gs.pickDailyDoubles(g, () => 0), ['2:1']);
});

test('pickDailyDoubles: never the top row and never an empty clue', () => {
  const g = board(3);
  g.categories[0].clues[1] = { value: 400, clue: '', response: 'x' }; // empty clue text
  g.categories[1].clues[2] = { value: 600, clue: 'c', response: '  ' }; // blank response
  for (let n = 0; n < 200; n++) {
    const [key] = gs.pickDailyDoubles(g, Math.random);
    const [ci, ri] = key.split(':').map(Number);
    assert.ok(ri >= 1, `top row picked: ${key}`);
    assert.ok(g.categories[ci].clues[ri].clue.trim() && g.categories[ci].clues[ri].response.trim(), `empty clue picked: ${key}`);
  }
});

test('pickDailyDoubles: 1 on a standard board, 2 on a large board, all distinct', () => {
  assert.equal(gs.pickDailyDoubles(board(5), seq(0.1, 0.5)).length, 1); // 25 clues
  const big = gs.pickDailyDoubles(board(8), seq(0.1, 0.1)); // 40 clues
  assert.equal(big.length, 2);
  assert.notEqual(big[0], big[1]);
});

test('pickDailyDoubles: is deterministic for an injected rand and handles tiny boards', () => {
  const g = board(5);
  assert.deepEqual(gs.pickDailyDoubles(g, () => 0), gs.pickDailyDoubles(g, () => 0));
  assert.deepEqual(gs.pickDailyDoubles(g, () => 0), ['0:1']); // first candidate
  assert.deepEqual(gs.pickDailyDoubles({ title: 'x', categories: [] }), []);
  const oneRow = { title: 'x', categories: [{ title: 'c', clues: [clue(200)] }] }; // only a top row
  assert.deepEqual(gs.pickDailyDoubles(oneRow), []);
});

test('createInitialState sets the first team active, no used clues, an empty log and daily doubles', () => {
  const s = gs.createInitialState(board(), teams(), () => 0);
  assert.equal(s.activeTeamId, 'a');
  assert.deepEqual(s.used, {});
  assert.deepEqual(s.log, []);
  assert.deepEqual(s.dailyDoubles, ['0:1']);
  assert.equal(s.currentRound, 1);
  assert.equal(gs.createInitialState(board(), []).activeTeamId, '1'); // no teams: falls back
});

test('applyClueResult: correct adds the clue value, marks used and logs the outcome', () => {
  const s = gs.applyClueResult(fresh(), { clueId: '0:2', teamId: 'a', correct: true, amount: 600 });
  assert.equal(s.teams.find((t) => t.id === 'a').score, 600);
  assert.equal(s.teams.find((t) => t.id === 'b').score, 0);
  assert.equal(s.used['0:2'], true);
  assert.deepEqual(s.log, [{ clueId: '0:2', teamId: 'a', correct: true, delta: 600 }]);
});

test('applyClueResult: incorrect subtracts and can go negative', () => {
  const s = gs.applyClueResult(fresh(), { clueId: '1:0', teamId: 'b', correct: false, amount: 200 });
  assert.equal(s.teams.find((t) => t.id === 'b').score, -200);
  assert.equal(s.log[0].delta, -200);
  assert.equal(s.log[0].correct, false);
});

test('applyClueResult: Daily Double wager overrides the value and is flagged in the log', () => {
  const s = gs.applyClueResult(fresh(), { clueId: '0:1', teamId: 'a', correct: true, amount: 1000, dailyDouble: true });
  assert.equal(s.teams[0].score, 1000);
  assert.deepEqual(s.log[0], { clueId: '0:1', teamId: 'a', correct: true, delta: 1000, dailyDouble: true });
  const plain = gs.applyClueResult(fresh(), { clueId: '0:1', teamId: 'a', correct: true, amount: 5 });
  assert.ok(!('dailyDouble' in plain.log[0]), 'non-DD entries carry no dailyDouble key');
});

test('applyClueResult: steal sequence (miss then hit) logs both and leaves the clue used once', () => {
  let s = gs.applyClueResult(fresh(), { clueId: '2:3', teamId: 'a', correct: false, amount: 800 });
  s = gs.applyClueResult(s, { clueId: '2:3', teamId: 'b', correct: true, amount: 800 });
  assert.deepEqual(s.teams.map((t) => t.score), [-800, 800]);
  assert.equal(s.log.length, 2);
  assert.deepEqual(Object.keys(s.used), ['2:3']);
});

test('applyClueResult does not mutate its input and tolerates an old save without a log', () => {
  const before = fresh();
  const snapshot = JSON.stringify(before);
  gs.applyClueResult(before, { clueId: '0:0', teamId: 'a', correct: true, amount: 200 });
  assert.equal(JSON.stringify(before), snapshot);
  const { log: _log, ...oldSave } = before;
  const s = gs.applyClueResult(oldSave, { clueId: '0:0', teamId: 'a', correct: true, amount: 200 });
  assert.equal(s.log.length, 1);
});

test('applyClueResult with an unknown team id changes no score but still marks the clue used', () => {
  const s = gs.applyClueResult(fresh(), { clueId: '0:0', teamId: 'ghost', correct: true, amount: 200 });
  assert.deepEqual(s.teams.map((t) => t.score), [0, 0]);
  assert.equal(s.used['0:0'], true);
});

test('applyFinalResults: applies wagers, records results, logs under "final" and marks done', () => {
  const start = { ...fresh(), teams: [{ id: 'a', name: 'A', score: 1000 }, { id: 'b', name: 'B', score: 600 }] };
  const s = gs.applyFinalResults(start, [
    { teamId: 'a', wager: 400, correct: false },
    { teamId: 'b', wager: 600, correct: true },
  ]);
  assert.deepEqual(s.teams.map((t) => t.score), [600, 1200]);
  assert.deepEqual(s.final, { done: true, wagers: { a: 400, b: 600 }, results: { a: false, b: true } });
  assert.deepEqual(s.log.map((r) => [r.clueId, r.teamId, r.correct, r.delta]), [
    ['final', 'a', false, -400],
    ['final', 'b', true, 600],
  ]);
});

test('applyFinalResults with no eligible teams still completes the round without touching scores', () => {
  const s = gs.applyFinalResults(fresh(), []);
  assert.deepEqual(s.final, { done: true, wagers: {}, results: {} });
  assert.deepEqual(s.teams.map((t) => t.score), [0, 0]);
});

test('computeTeamStats: an old save with no log yields zero rows and null accuracy', () => {
  const { log: _log, ...oldSave } = fresh();
  const rows = gs.computeTeamStats(oldSave);
  assert.equal(rows.length, 2);
  for (const r of rows) {
    assert.equal(r.correct, 0);
    assert.equal(r.incorrect, 0);
    assert.equal(r.accuracy, null);
    assert.equal(r.pointsGained, 0);
    assert.equal(r.pointsLost, 0);
    assert.equal(r.dailyDoubleHit, undefined);
  }
});

test('computeTeamStats: per-team correct/incorrect, accuracy, points and Daily Double hit', () => {
  let s = fresh();
  s = gs.applyClueResult(s, { clueId: '0:0', teamId: 'a', correct: true, amount: 200 });
  s = gs.applyClueResult(s, { clueId: '0:1', teamId: 'a', correct: true, amount: 700, dailyDouble: true });
  s = gs.applyClueResult(s, { clueId: '1:0', teamId: 'a', correct: false, amount: 200 });
  s = gs.applyClueResult(s, { clueId: '1:1', teamId: 'b', correct: false, amount: 400 });
  s = gs.applyFinalResults(s, [{ teamId: 'b', wager: 100, correct: true }]);
  const [a, b] = gs.computeTeamStats(s);
  assert.deepEqual(
    { c: a.correct, i: a.incorrect, g: a.pointsGained, l: a.pointsLost, dd: a.dailyDoubleHit },
    { c: 2, i: 1, g: 900, l: 200, dd: true },
  );
  assert.equal(a.accuracy, 2 / 3);
  // Final Jeopardy counts as an answered clue for accuracy
  assert.deepEqual({ c: b.correct, i: b.incorrect, g: b.pointsGained, l: b.pointsLost }, { c: 1, i: 1, g: 100, l: 400 });
  assert.equal(b.accuracy, 0.5);
  assert.equal(b.dailyDoubleHit, undefined);
});

test('computeTeamStats: a missed Daily Double is not a "hit"', () => {
  const s = gs.applyClueResult(fresh(), { clueId: '0:1', teamId: 'a', correct: false, amount: 500, dailyDouble: true });
  assert.equal(gs.computeTeamStats(s)[0].dailyDoubleHit, undefined);
});

test('classifyFinal: no draft, an all-empty draft and a whitespace-only draft are "none"', () => {
  assert.deepEqual(fd.classifyFinal(undefined), { kind: 'none' });
  assert.deepEqual(fd.classifyFinal({ category: '', clue: '', response: '' }), { kind: 'none' });
  assert.deepEqual(fd.classifyFinal({ category: '  ', clue: '\n', response: ' ' }), { kind: 'none' });
});

test('classifyFinal: a half-filled draft reports exactly the missing fields', () => {
  assert.deepEqual(fd.classifyFinal({ category: 'Rivers', clue: '', response: '  ' }), {
    kind: 'partial',
    missing: ['clue', 'response'],
  });
});

test('classifyFinal: a complete draft is trimmed and keeps AI provenance/verification/source metadata', () => {
  const verification = {
    model: 'm',
    checkedAt: '2026-11-01T00:00:00Z',
    reason: 'ok',
    clue: 'The longest river',
    response: 'What is the Nile?',
    category: 'Rivers',
  };
  const result = fd.classifyFinal({
    category: '  Rivers ',
    clue: ' The longest river ',
    response: ' What is the Nile? ',
    provenance: 'answer_first',
    verification,
    sourceMaterial: 'Wikipedia: Nile',
    sourceUrl: 'https://example.com/nile',
  });
  assert.equal(result.kind, 'complete');
  assert.deepEqual(result.value, {
    category: 'Rivers',
    clue: 'The longest river',
    response: 'What is the Nile?',
    provenance: 'answer_first',
    verification,
    sourceMaterial: 'Wikipedia: Nile',
    sourceUrl: 'https://example.com/nile',
  });
});

test('classifyFinal: a manual draft stays free of metadata keys', () => {
  const result = fd.classifyFinal({ category: 'A', clue: 'B', response: 'C' });
  assert.deepEqual(result, { kind: 'complete', value: { category: 'A', clue: 'B', response: 'C' } });
});

test('markClueUsed closes a clue without touching scores or the log', () => {
  const s = gs.markClueUsed(fresh(), '1:2');
  assert.equal(s.used['1:2'], true);
  assert.deepEqual(s.teams.map((t) => t.score), [0, 0]);
  assert.deepEqual(s.log, []);
});

test('nextTeamId rotates in board order, wraps, and handles unknown ids and no teams', () => {
  const t = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
  assert.equal(gr.nextTeamId(t, 'a'), 'b');
  assert.equal(gr.nextTeamId(t, 'c'), 'a');
  assert.equal(gr.nextTeamId(t, 'zzz'), 'a');
  assert.equal(gr.nextTeamId([{ id: 'solo' }], 'solo'), 'solo');
  assert.equal(gr.nextTeamId([], 'a'), null);
});

test('default rules take turns, keep penalties and allow steals', () => {
  assert.deepEqual(gr.DEFAULT_RULES, { turnMode: 'rotate', wrongAnswerPenalty: true, allowSteal: true });
});
