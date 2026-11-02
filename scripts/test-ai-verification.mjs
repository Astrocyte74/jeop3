import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import contract from '../server/verification.cjs';
const dir = await mkdtemp(join(tmpdir(), 'jeop3-check-'));
const modules = {};
for (const name of ['board', 'verification', 'service']) {
  const out = join(dir, `${name}.mjs`);
  await build({ entryPoints: [`src/lib/ai/${name}.ts`], bundle: true, format: 'esm', outfile: out, logLevel: 'silent', define: { 'import.meta.env.VITE_AI_API_URL': '"http://test/api"' } });
  modules[name] = await import(pathToFileURL(out));
}
after(() => rm(dir, { recursive: true, force: true }));
const { verifyCategories, currentVerification } = modules.verification;
const good = (items, overrides = {}) => ({ model: 'reviewer', verdicts: items.map(i => ({ id: i.id, verdict: 'true', onTopic: true, reason: 'Known fact', ...overrides[i.id] })) });
const clue = (n) => ({ value: n * 200, clue: `Statement number ${n}`, response: `Person ${n}` });
const cats = [{ title: 'Lighthouse keepers', clues: [clue(1), clue(2), clue(3)] }];

test('verdicts map by ID, false/unsure/off-topic are removed', async () => {
  const r = await verifyCategories(cats, 'Lighthouses', async (_, items) => {
    const r = good(items, { '0:0': { verdict: 'false' }, '0:1': { verdict: 'unsure' } });
    r.verdicts.reverse(); return r;
  });
  assert.deepEqual(r.categories[0].clues.map(c => c.response), ['Person 3']);
  const off = await verifyCategories(cats, 'Lighthouses', async (_, i) => good(i, { '0:0': { onTopic: false } }));
  assert.equal(off.categories[0].clues.length, 2);
});
test('missing, duplicated, extra and malformed verdicts fail closed', async () => {
  for (const mutate of [r => r.verdicts.pop(), r => r.verdicts[1].id = '0:0', r => r.verdicts[0].id = 'other', r => r.verdicts[0].onTopic = 'true', r => r.verdicts[0].verdict = 'TRUE']) {
    await assert.rejects(verifyCategories(cats, 'Lighthouses', async (_, items) => { const r = good(items); mutate(r); return r; }));
  }
  await assert.rejects(verifyCategories(cats, 'Lighthouses', async () => { throw new Error('offline'); }), /offline/);
});
test('AI fact sheet is excluded; edited clue, answer or category loses badge', async () => {
  const r = await verifyCategories([{ ...cats[0], sourceType: 'ai_synthesized', sourceMaterial: 'Invented evidence' }], 'Lighthouses', async (_, items) => {
    assert.ok(items.every(i => i.source === undefined)); return good(items);
  });
  const c = r.categories[0].clues[0];
  assert.ok(currentVerification(c, cats[0].title));
  assert.equal(currentVerification({ ...c, clue: 'Edited' }, cats[0].title), undefined);
  assert.equal(currentVerification({ ...c, response: 'Edited' }, cats[0].title), undefined);
  assert.equal(currentVerification(c, 'Other'), undefined);
});
test('provider aliases cannot make the generator its own verifier', () => {
  const available = [{ id: 'openai:gpt-6-luna' }, { id: 'or:google/reviewer' }];
  assert.equal(contract.chooseVerifier('openai:gpt-6-luna', undefined, available), 'or:google/reviewer');
  assert.throws(() => contract.chooseVerifier('openai:gpt-6-luna', 'or:openai/gpt-6-luna', available), /different model/);
  assert.throws(() => contract.chooseVerifier('openai:gpt-6-luna', undefined, available.slice(0, 1)), /No enabled/);
  assert.throws(() => contract.chooseVerifier('openai:gpt-6-luna', 'or:unknown', available), /No enabled/);
});
test('server validates exact verifier response schema', () => {
  const items = [{ id: 'x', category: 'Keepers', clue: 'Statement', response: 'Name' }];
  assert.ok(contract.verificationPrompt('Lighthouses', items).user.includes('no extra ids'));
  assert.equal(contract.parseVerdicts(JSON.stringify(good(items)), items).length, 1);
  assert.throws(() => contract.parseVerdicts('{"verdicts":[]}', items), /Incomplete/);
  assert.throws(() => contract.verificationPrompt('Lighthouses', [...items, ...items]), /Invalid/);
});
test('fallback clues pass the gate; insufficient survivors never return a partial board', async () => {
  const generate = async type => type === 'categories-generate-from-content'
    ? { categories: [{ title: 'Keepers', clues: Array.from({ length: 5 }, (_, i) => clue(i + 1)) }] }
    : null;
  const opts = { referenceMaterial: 'source', titles: ['Keepers'], count: 1, difficulty: 'normal', theme: 'Lighthouses' };
  await assert.rejects(modules.board.generateContentSpan(generate, { ...opts, verify: async (_, items) => good(items, { '0:0': { verdict: 'false' } }) }), /Keepers \(4\/5\)/);
  const result = await modules.board.generateContentSpan(generate, { ...opts, verify: async (_, items) => good(items) });
  assert.equal(result.categories[0].clues.length, 5);
  assert.ok(result.categories[0].clues.every(c => c.provenance === 'fallback' && c.verification));
});
test('retrieval guard rejects multiword wrong senses, accepts singulars and Roman/Rome', () => {
  const match = modules.service.sourceMatchesTopic;
  assert.equal(match('Famous lighthouses of the world', 'Island Heights', 'A borough famous around the world for its history.'), false);
  assert.equal(match('Lighthouses', 'Boston Light', 'A lighthouse in Boston Harbor.'), true);
  assert.equal(match('Ancient Rome', 'Julio-Claudian dynasty', 'The first Roman emperors.'), true);
  assert.equal(match('Fruit and Orchards', 'Apple Inc.', 'A technology company.'), false);
});
test('retrieval tries later hits and searches the actual topic', async () => {
  const original = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, opts) => {
    const body = JSON.parse(opts.body); calls.push(body);
    if (url.endsWith('search-wikipedia')) return Response.json({ results: [{ title: 'Island Heights', url: 'wrong' }, { title: 'Boston Light', url: 'right' }] });
    return Response.json({ text: body.url === 'wrong' ? 'A borough in New Jersey. '.repeat(30) : 'Boston Light is a lighthouse. '.repeat(30) });
  };
  try {
    const result = await modules.service.searchAndFetchCategorySource('Island Lights', null, 'Lighthouses');
    assert.equal(result.url, 'right');
    assert.equal(calls[0].query, 'Lighthouses Island Lights');
  } finally { globalThis.fetch = original; }
});
test('empty grounding cannot turn a single retrieved article into six categories', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => Response.json({ results: [] });
  try {
    await assert.rejects(modules.board.generateTopicSpan(async () => ({ sections: [] }), { topic: 'Lighthouses', titles: ['Keepers', 'Towers'], count: 2, difficulty: 'normal' }), /No usable source/);
  } finally { globalThis.fetch = original; }
});

test('checked runner-ups fill rejected slots and preserve dollar values', async () => {
  const answers = ['Grace Darling', 'Ida Lewis', 'William Darling', 'Abbie Burgess', 'Henry Hall', 'Thomas Walker', 'Marcus Hanna'];
  const generate = async type => {
    if (type === 'extract-board-answers') return { categories: [{ title: 'Keepers', answers: answers.map(answer => ({ answer, fact: `${answer} is a keeper.` })) }] };
    if (type === 'clues-from-answers') return { categories: [{ title: 'Keepers', clues: answers.map(response => ({ clue: `A fact about ${response}`, response })) }] };
    if (type === 'judge-clues') return { categories: [{ title: 'Keepers', scored: answers.map((answer, i) => ({ answer, specificity: 5, sourceSupport: 5, clarity: 5, jeopardyStyle: 5, duplicateRisk: 1, difficulty: i + 1 })) }] };
    throw new Error(`Unexpected fallback: ${type}`);
  };
  const result = await modules.board.generateContentSpan(generate, { referenceMaterial: 'source', titles: ['Keepers'], theme: 'Lighthouses', count: 1, difficulty: 'normal', verify: async (_, items) => good(items, { '0:0': { verdict: 'false' } }) });
  assert.deepEqual(result.categories[0].clues.map(c => c.value), [200, 400, 600, 800, 1000]);
  assert.ok(!result.categories[0].clues.some(c => c.response === 'Grace Darling'));
  assert.ok(result.categories[0].clues.every(c => c.verification));
  assert.equal(result.alternatives[0].clues.length, 1);
  assert.ok(result.alternatives[0].clues[0].verification);
});
