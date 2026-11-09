import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const dir = await mkdtemp(join(tmpdir(), 'jeop3-attempts-'));
const out = join(dir, 'attempts.mjs');
await build({ entryPoints: ['src/lib/clueAttempts.ts'], outfile: out, bundle: true, format: 'esm', platform: 'node', logLevel: 'silent' });
after(() => rm(dir, { recursive: true, force: true }));
const { clueAttemptsReducer: reduce, emptyClueAttempts: initial } = await import(pathToFileURL(out).href);
const ready = reduce(initial, { type: 'advance', allowSteal: true });
const wrong = (teamId, overrides = {}) => ({ type: 'wrong', teamId, penalty: true, allowSteal: true, teamCount: 3, ...overrides });

test('a miss allows a steal while keeping the answer hidden', () => {
  const state = reduce(ready, wrong('a'));
  assert.equal(state.revealed, false);
  assert.equal(state.finished, false);
  const won = reduce(state, { type: 'correct', teamId: 'b' });
  assert.deepEqual(won, { misses: [{ teamId: 'a', penalty: true }], winnerId: 'b', judging: true, revealed: true, finished: true });
});

test('no-steal mode ends the attempt and reveals, with either penalty rule', () => {
  for (const penalty of [false, true]) {
    const state = reduce(ready, wrong('a', { allowSteal: false, penalty }));
    assert.equal(state.finished, true);
    assert.equal(state.revealed, true);
    assert.equal(state.misses[0].penalty, penalty);
    assert.equal(reduce(state, { type: 'correct', teamId: 'b' }), state);
  }
});

test('revealing after a miss ends steals; revealing first permits only the final judgement', () => {
  const afterMiss = reduce(reduce(ready, wrong('a')), { type: 'reveal' });
  assert.equal(afterMiss.finished, true);
  assert.equal(reduce(afterMiss, { type: 'correct', teamId: 'b' }), afterMiss);
  const revealed = reduce(initial, { type: 'reveal' });
  const finalWrong = reduce(revealed, wrong('a'));
  assert.equal(finalWrong.finished, true);
  assert.equal(reduce(finalWrong, wrong('b')), finalWrong);
});

test('each miss retains its penalty when the host changes the rule mid-clue', () => {
  let state = reduce(ready, wrong('a', { penalty: false }));
  state = reduce(state, wrong('b', { penalty: true }));
  assert.deepEqual(state.misses, [{ teamId: 'a', penalty: false }, { teamId: 'b', penalty: true }]);
});

test('all teams missing ends the clue; duplicate misses cannot consume another attempt', () => {
  let state = reduce(ready, wrong('a', { teamCount: 2 }));
  assert.equal(reduce(state, wrong('a', { teamCount: 2 })), state);
  state = reduce(state, wrong('b', { teamCount: 2 }));
  assert.equal(state.finished, true);
  assert.equal(state.revealed, true);
});

test('a missed team cannot win unless its attempt is undone before reveal', () => {
  const state = reduce(ready, wrong('a'));
  assert.equal(reduce(state, { type: 'correct', teamId: 'a' }), state);
  const undone = reduce(state, { type: 'undoMiss', teamId: 'a' });
  assert.equal(reduce(undone, { type: 'correct', teamId: 'a' }).winnerId, 'a');
});

test('nobody got it preserves misses and reveals, while a fresh pass adds no penalty', () => {
  assert.deepEqual(reduce(initial, { type: 'nobody' }), { ...initial, revealed: true, finished: true });
  const state = reduce(reduce(ready, wrong('a')), { type: 'nobody' });
  assert.deepEqual(state.misses, [{ teamId: 'a', penalty: true }]);
  assert.equal(state.finished, true);
});

test('terminal outcomes resist duplicate input, and reset clears the next clue', () => {
  const won = reduce(ready, { type: 'correct', teamId: 'a' });
  for (const action of [wrong('b'), { type: 'correct', teamId: 'b' }, { type: 'undoMiss', teamId: 'a' }, { type: 'nobody' }]) {
    assert.equal(reduce(won, action), won);
  }
  assert.deepEqual(reduce(won, { type: 'reset' }), initial);
});


test('steal mode advances to judging first; no-steal mode advances directly to the answer', () => {
  const first = reduce(initial, { type: 'advance', allowSteal: true });
  assert.equal(first.judging, true);
  assert.equal(first.revealed, false);
  assert.equal(first.finished, false);
  const noSteal = reduce(initial, { type: 'advance', allowSteal: false });
  assert.equal(noSteal.revealed, true);
  assert.equal(noSteal.finished, false);
  assert.equal(reduce(noSteal, wrong('a', { allowSteal: false })).finished, true);
});

test('hidden scoring controls cannot be bypassed with early correct/wrong shortcuts', () => {
  assert.equal(reduce(initial, wrong('a')), initial);
  assert.equal(reduce(initial, { type: 'correct', teamId: 'a' }), initial);
});

test('advancing again explicitly reveals and ends outstanding steals', () => {
  const missed = reduce(ready, wrong('a'));
  const revealed = reduce(missed, { type: 'advance', allowSteal: true });
  assert.equal(revealed.finished, true);
  assert.equal(revealed.revealed, true);
  assert.equal(reduce(revealed, { type: 'correct', teamId: 'b' }), revealed);
});
