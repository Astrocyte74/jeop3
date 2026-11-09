import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

// UI helpers for per-clue sources, source labels and retry progress (Claude's UI layer; additive).
const dir = await mkdtemp(join(tmpdir(), 'jeop3-sourceui-'));
after(() => rm(dir, { recursive: true, force: true }));
async function load(entry, name) {
  const outfile = join(dir, `${name}.mjs`);
  await build({
    entryPoints: [entry], outfile, bundle: true, format: 'esm', platform: 'node', logLevel: 'silent',
    alias: { '@': resolve('src') },
  });
  return import(pathToFileURL(outfile).href);
}
const info = await load('src/components/ai/sourceInfo.ts', 'sourceInfo');
const prog = await load('src/components/wizard/researchProgress.ts', 'researchProgress');

const ev = (over = {}) => ({
  sourceId: 's1', title: 'Apollo 11', url: 'https://en.wikipedia.org/wiki/Apollo_11',
  quote: 'Apollo 11 landed on the Moon on July 20, 1969.', retrievedAt: '2026-11-08T10:00:00.000Z', kind: 'wikipedia', ...over,
});
const checked = (clue, response, category, evidence) => ({
  clue, response,
  verification: { model: 'm', checkedAt: '2026-11-08T10:00:00.000Z', reason: 'ok', clue, response, category, ...(evidence ? { evidence } : {}) },
});
const cat = (over = {}) => ({ title: 'Moon', clues: [checked('Landed July 20, 1969', 'Apollo 11', 'Moon', [ev()])], ...over });

test('safeHref only allows http(s)', () => {
  assert.equal(info.safeHref('javascript:alert(1)'), undefined);
  assert.equal(info.safeHref('data:text/html,hi'), undefined);
  assert.equal(info.safeHref('not a url'), undefined);
  assert.equal(info.safeHref('https://example.org/a'), 'https://example.org/a');
});

test('source labels: Church pages are named as such, not "Web" or "Wikipedia"', () => {
  assert.equal(info.sourceLabelOf({ kind: 'web', url: 'https://www.churchofjesuschrist.org/study/manual' }), 'Church sources');
  assert.equal(info.sourceLabelOf({ kind: 'web', url: 'https://example.org/x' }), 'Web');
  assert.equal(info.sourceLabelOf({ kind: 'wikipedia', url: 'https://en.wikipedia.org/wiki/X' }), 'Wikipedia');
  assert.equal(info.sourceLabelOf({ kind: 'user' }), 'Your material');
  // A look-alike host must not pass as official.
  assert.equal(info.isChurchUrl('https://churchofjesuschrist.org.evil.example/x'), false);
});

test('category badge reflects the real mix of sources', () => {
  assert.equal(info.categorySourceBadge(cat({ sourceType: 'retrieved' })).label, 'Wikipedia');
  const mixed = cat({ sourceType: 'retrieved', clues: [checked('c1', 'a1', 'Moon', [ev(), ev({ sourceId: 's2', kind: 'web', title: 'NASA', url: 'https://www.nasa.gov/apollo' })])] });
  assert.equal(info.categorySourceBadge(mixed).label, 'Wikipedia + Web');
  const church = cat({ sourceType: 'retrieved', clues: [checked('c', 'a', 'Moon', [ev({ kind: 'web', title: 'Word of Wisdom', url: 'https://www.churchofjesuschrist.org/study/x' })])] });
  const b = info.categorySourceBadge(church);
  assert.equal(b.label, 'Church sources');
  assert.equal(b.tone, 'official');
  const pasted = cat({ clues: [checked('c', 'a', 'Moon', [ev({ kind: 'user', url: undefined, title: 'Pasted material' })])] });
  assert.equal(info.categorySourceBadge(pasted).label, 'Your material');
  assert.equal(info.categorySourceBadge(pasted).href, undefined);
});

test('official policy labels the category even when no sources were stored', () => {
  const c = { title: 'WoW', clues: [], sourceType: 'retrieved', sourcePolicy: 'lds-official' };
  assert.equal(info.categorySourceBadge(c).label, 'Church sources');
});

test('older saves: neutral label unless the saved URL says otherwise; never claims Wikipedia', () => {
  const noUrl = { title: 'Old', clues: [{ clue: 'c', response: 'a' }], sourceType: 'retrieved' };
  assert.equal(info.categorySourceBadge(noUrl).label, 'Retrieved sources');
  const wiki = { ...noUrl, sourceUrl: 'https://en.wikipedia.org/wiki/Moon' };
  const b = info.categorySourceBadge(wiki);
  assert.equal(b.label, 'Wikipedia');
  assert.equal(b.href, 'https://en.wikipedia.org/wiki/Moon');
  const bad = { ...noUrl, sourceUrl: 'javascript:alert(1)' };
  assert.equal(info.categorySourceBadge(bad).href, undefined);
});

test('content categories and synthesized fact sheets keep their own labels', () => {
  assert.equal(info.categorySourceBadge({ title: 'P', clues: [], sourceMaterial: 'my notes' }).label, 'Your material');
  assert.equal(info.categorySourceBadge({ title: 'U', clues: [], sourceMaterial: 'x', sourceUrl: 'https://example.org/page' }).label, 'Web');
  const synth = info.categorySourceBadge({ title: 'S', clues: [], sourceType: 'ai_synthesized' });
  assert.equal(synth.label, 'AI fact-sheet');
  assert.equal(synth.tone, 'warning');
  assert.equal(info.categorySourceBadge({ title: 'Blank', clues: [] }), null);
});

test('evidence is invalidated by clue, answer or category edits', () => {
  const clue = checked('Landed July 20, 1969', 'Apollo 11', 'Moon', [ev()]);
  assert.equal(info.evidenceState(clue, 'Moon'), 'has-evidence');
  assert.equal(info.currentEvidence(clue, 'Moon').length, 1);
  for (const edited of [{ ...clue, clue: 'Landed July 21, 1969' }, { ...clue, response: 'Apollo 12' }]) {
    assert.equal(info.evidenceState(edited, 'Moon'), 'edited-since-check');
    assert.deepEqual(info.currentEvidence(edited, 'Moon'), []);
  }
  assert.equal(info.evidenceState(clue, 'Space'), 'edited-since-check');
  // Stale evidence must not leak into the category label either.
  const stale = { title: 'Moon', clues: [{ ...clue, response: 'Apollo 12' }], sourceType: 'retrieved' };
  assert.equal(info.categorySourceBadge(stale).label, 'Retrieved sources');
});

test('older saves without evidence, and unchecked clues, are explained rather than blank', () => {
  const old = checked('c', 'a', 'Moon', undefined);
  assert.equal(info.evidenceState(old, 'Moon'), 'no-evidence-recorded');
  const empty = checked('c', 'a', 'Moon', []);
  assert.equal(info.evidenceState(empty, 'Moon'), 'no-evidence-recorded');
  assert.equal(info.evidenceState({ clue: 'c', response: 'a' }, 'Moon'), 'never-checked');
});

test('board summary counts checked clues and clues with quotes', () => {
  const board = [
    cat({ sourceType: 'retrieved' }),
    { title: 'Old', sourceType: 'retrieved', clues: [checked('c', 'a', 'Old', undefined), { clue: 'x', response: 'y' }] },
    { title: 'Mine', sourceMaterial: 'notes', clues: [checked('c', 'a', 'Mine', [ev({ kind: 'user', url: undefined })])] },
  ];
  const sum = info.summarizeBoardSources(board);
  assert.equal(sum.clueTotal, 4);
  assert.equal(sum.checkedClues, 3);
  assert.equal(sum.withQuotes, 2);
  assert.deepEqual(sum.groups.map(g => g.label).sort(), ['Retrieved sources', 'Wikipedia', 'Your material']);
});

test('progress folding keeps sources, warnings and policy across later events', () => {
  let acc = prog.EMPTY_RESEARCH;
  const e1 = { stage: 'retrieval', categoryTitle: 'A', status: 'complete', sourcePolicy: 'lds-official', warnings: ['An optional page was unavailable'],
    sources: [{ id: 's1', title: 'Word of Wisdom', url: 'https://www.churchofjesuschrist.org/x', kind: 'web', retrievedAt: 't' }] };
  const e2 = { stage: 'clues', categoryTitle: 'A', message: 'Writing' };
  const e3 = { stage: 'retrieval', categoryTitle: 'B', sources: [e1.sources[0], { id: 's2', title: 'Pasted', kind: 'user', retrievedAt: 't' }], warnings: ['An optional page was unavailable', 'Second'] };
  for (const e of [e1, e2, e3]) acc = prog.foldProgress(acc, e);
  assert.equal(acc.policy, 'lds-official');
  assert.deepEqual(acc.warnings, ['An optional page was unavailable', 'Second']);
  assert.deepEqual(acc.sources.map(s => s.id), ['s1', 's2']);
  assert.equal(prog.foldProgress(acc, e3), acc, 'same event folds once');
});

test('repairs track only deficient categories through research, writing and checking', () => {
  let acc = prog.EMPTY_RESEARCH;
  const steps = [
    [{ stage: 'retrieval', categoryTitle: 'Space', attempt: 1, missing: 2, status: 'started' }, 'researching'],
    [{ stage: 'clues', categoryTitle: 'Space', attempt: 1, missing: 2 }, 'writing'],
    [{ stage: 'verifying', categoryTitle: 'Space', attempt: 1, status: 'started' }, 'checking'],
    [{ stage: 'verifying', categoryTitle: 'Space', attempt: 1, status: 'complete' }, 'checked'],
  ];
  for (const [e, phase] of steps) {
    acc = prog.foldProgress(acc, e);
    assert.equal(acc.repairs.Space.phase, phase);
    assert.equal(acc.repairs.Space.missing, 2, 'missing count survives events that omit it');
  }
  // First-pass events (no attempt) never create a repair entry.
  const first = prog.foldProgress(prog.EMPTY_RESEARCH, { stage: 'verifying', categoryTitle: 'Other', status: 'complete' });
  assert.deepEqual(first.repairs, {});
  const failed = prog.foldProgress(acc, { stage: 'verifying', categoryTitle: 'Space', attempt: 1, status: 'failed' });
  assert.equal(failed.repairs.Space.phase, 'failed');
});

test('raw network warnings are translated, other warnings pass through', () => {
  assert.equal(prog.friendlyWarning('www.airandspace.si.edu: getaddrinfo ENOTFOUND www.airandspace.si.edu'),
    'A source page (www.airandspace.si.edu) couldn’t be reached and was skipped.');
  assert.equal(prog.friendlyWarning('fetch failed'), 'A source page couldn’t be reached and was skipped.');
  assert.equal(prog.friendlyWarning('An optional page was unavailable'), 'An optional page was unavailable');
  assert.equal(prog.friendlyWarning('Supplied material exceeds the evidence window; remaining text was not used.'),
    'Supplied material exceeds the evidence window; remaining text was not used.');
});
