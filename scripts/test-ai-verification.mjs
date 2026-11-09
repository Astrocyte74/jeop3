import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import contract from '../server/verification.cjs';
const dir = await mkdtemp(join(tmpdir(), 'jeop3-check-'));
const modules = {};
for (const name of ['board', 'verification', 'service', 'prompts']) {
  const out = join(dir, `${name}.mjs`);
  await build({ entryPoints: [`src/lib/ai/${name}.ts`], bundle: true, format: 'esm', outfile: out, logLevel: 'silent', define: { 'import.meta.env.VITE_AI_API_URL': '"http://test/api"' } });
  modules[name] = await import(pathToFileURL(out));
}
after(() => rm(dir, { recursive: true, force: true }));
const { verifyCategories, currentVerification } = modules.verification;
const good = (items, overrides = {}) => ({ model: 'reviewer', verdicts: items.map(i => ({ id: i.id, verdict: 'true', onTopic: true, reason: 'Known fact', ...(i.requireEvidence ? { evidence: [{ sourceId: i.sources[0]?.id, quote: i.sources[0]?.text }] } : {}), ...overrides[i.id] })) });
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
    await assert.rejects(verifyCategories(cats, 'Lighthouses', async (_, items) => { const r = good(items); mutate(r); return r; }), error => error.details.code === 'VERIFICATION_UNAVAILABLE');
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
  const opts = { retryLimit: 0, referenceMaterial: 'A supplied source passage with enough detail for the verification contract.', titles: ['Keepers'], count: 1, difficulty: 'normal', theme: 'Lighthouses' };
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
    assert.equal(calls[0].query, 'Lighthouses');
  } finally { globalThis.fetch = original; }
});
test('empty grounding cannot turn a single retrieved article into six categories', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => Response.json({ sources: [], policy: 'general', warnings: [] });
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
  const result = await modules.board.generateContentSpan(generate, { referenceMaterial: 'A supplied source passage with enough detail for the verification contract.', titles: ['Keepers'], theme: 'Lighthouses', count: 1, difficulty: 'normal', verify: async (_, items) => good(items, { '0:0': { verdict: 'false' } }) });
  assert.deepEqual(result.categories[0].clues.map(c => c.value), [200, 400, 600, 800, 1000]);
  assert.ok(!result.categories[0].clues.some(c => c.response === 'Grace Darling'));
  assert.ok(result.categories[0].clues.every(c => c.verification));
  assert.equal(result.alternatives[0].clues.length, 1);
  assert.ok(result.alternatives[0].clues[0].verification);
});

// The exact wrong sense from the Space exploration incident. The old 1200-char
// scan matched "exploration" in the Topics section and accepted a maths book.
const mathsBook = 'Beyond Infinity is a popular mathematics book by Eugenia Cheng centered on concepts of infinity. It was published by Basic Books in 2017.\n\nTopics\nAfter an exploration of number systems, it discusses set theory, the dimensions of spaces, and infinite sizes of sets. '.repeat(2);
test('playful title cannot override the requested topic during retrieval', async () => {
  const original = globalThis.fetch;
  const queries = [];
  globalThis.fetch = async (url, options) => {
    const body = JSON.parse(options.body);
    if (url.endsWith('search-wikipedia')) {
      queries.push(body.query);
      return Response.json({ results: [
        { title: 'Beyond Infinity (mathematics book)', url: 'maths' },
        { title: 'Space exploration', url: 'space' },
      ] });
    }
    return Response.json({ text: body.url === 'maths' ? mathsBook : 'Space exploration uses astronomy and space technology to explore outer space. '.repeat(10) });
  };
  try {
    assert.equal(modules.service.sourceMatchesTopic('Space exploration', 'Beyond Infinity (mathematics book)', mathsBook), false);
    const result = await modules.service.searchAndFetchCategorySource('To Infinity And Beyond', null, 'Space exploration');
    assert.equal(queries[0], 'Space exploration');
    assert.equal(result.url, 'space');
  } finally { globalThis.fetch = original; }
});

test('HTTP, network, timeout, empty and invalid verifier replies are retryable outages', async () => {
  const original = globalThis.fetch;
  for (const response of [
    () => { throw new TypeError('Network unavailable'); },
    () => { throw new DOMException('Timed out', 'TimeoutError'); },
    () => Response.json(contract.verificationUnavailable(new Error('Model not enabled')), { status: 502 }),
    () => Response.json(contract.verificationUnavailable(new Error('Rate limit exceeded')), { status: 429 }),
    () => new Response(''),
    () => new Response('<html>Bad gateway</html>', { status: 502 }),
    () => Response.json({}),
    () => Response.json({ model: 'reviewer', verdicts: [] }),
    () => Response.json({ ...good(cats[0].clues.map((_, i) => ({ id: `0:${i}` }))), model: '' }),
  ]) {
    const events = [];
    globalThis.fetch = async () => response();
    try {
      await assert.rejects(verifyCategories(cats, 'Lighthouses', undefined, { model: 'generator', onProgress: e => events.push(e) }), error => {
        assert.equal(error.details.code, 'VERIFICATION_UNAVAILABLE');
        assert.equal(error.details.retryable, true);
        assert.deepEqual(error.details.clues, []); // never fabricate rejections
        assert.doesNotMatch(error.message, /richer source|0\/5/);
        assert.deepEqual(events.at(-1).verificationFailure, error.details);
        return true;
      });
    } finally { globalThis.fetch = original; }
  }
});

test('incomplete board error and progress preserve each rejected clue and its reason', async () => {
  const events = [];
  const generate = async type => type === 'categories-generate-from-content'
    ? { categories: [{ title: 'Keepers', clues: Array.from({ length: 5 }, (_, i) => clue(i + 1)) }] } : null;
  const reasons = {
    '0:0': { verdict: 'true', onTopic: false, reason: 'Mathematics, not space exploration.' },
    '0:1': { verdict: 'false', reason: 'Wrong mission.' },
    '0:2': { verdict: 'unsure', reason: 'Cannot substantiate this date.' },
  };
  await assert.rejects(modules.board.generateContentSpan(generate, {
    referenceMaterial: 'A supplied source passage with enough detail for the verification contract.', titles: ['Keepers'], count: 1, difficulty: 'normal', theme: 'Space exploration',
    retryLimit: 0, onProgress: e => events.push(e), verify: async (_, items) => { const r = good(items, reasons); r.verdicts.reverse(); return r; },
  }), error => {
    assert.equal(error.details.code, 'VERIFICATION_INCOMPLETE');
    assert.deepEqual(error.details.categories, [{ title: 'Keepers', accepted: 2, required: 5 }]);
    assert.equal(error.details.clues.length, 3);
    assert.deepEqual(error.details.clues[0], {
      id: '0:0', categoryIndex: 0, clueIndex: 0, category: 'Keepers', clue: 'Statement number 1', response: 'Person 1',
      ...reasons['0:0'],
    });
    assert.equal(error.details.clues[2].reason, reasons['0:2'].reason);
    assert.deepEqual(events.at(-1).verificationFailure, error.details);
    assert.equal(events.at(-1).stage, 'verifying');
    assert.equal(events.at(-1).status, 'failed');
    return true;
  });
});

test('no generated candidates is an incomplete board, without calling the verifier', async () => {
  await assert.rejects(modules.board.generateContentSpan(async () => null, {
    referenceMaterial: 'A supplied source passage with enough detail for the verification contract.', titles: ['Keepers'], count: 1, difficulty: 'normal',
    verify: async () => { assert.fail('No batch to verify'); },
  }), error => error.details.code === 'VERIFICATION_INCOMPLETE' && error.details.clues.length === 0);
});

test('answer extraction receives the actual topic as well as the playful title', () => {
  const prompt = modules.prompts.buildPrompt('extract-board-answers', {
    theme: 'Space exploration', topicList: ['To Infinity And Beyond'], count: 1, referenceMaterial: mathsBook,
  }, 'normal');
  assert.match(prompt.user, /Requested game topic: "Space exploration"/);
  assert.match(prompt.user, /Only extract facts relevant to this topic/);
});

test('opt-in audit retains raw malformed output and the actual failure', async () => {
  const old = process.env.AI_VERIFICATION_LOG;
  const path = join(dir, 'audit.jsonl');
  process.env.AI_VERIFICATION_LOG = path;
  try {
    const record = { request: { topic: 'Space exploration' }, rawResponse: '{"verdicts":', error: 'Invalid JSON' };
    await contract.logVerification(record);
    assert.deepEqual(JSON.parse(await readFile(path, 'utf8')), record);
  } finally {
    if (old === undefined) delete process.env.AI_VERIFICATION_LOG;
    else process.env.AI_VERIFICATION_LOG = old;
  }
});

const evidenceSource = { id: 'primary', title: 'Mission archive', url: 'https://example.org/archive', text: 'The Eagle lunar module landed on the Moon during the Apollo 11 mission.', kind: 'web', retrievedAt: '2026-11-08T00:00:00Z' };
const evidenceCats = [{ title: 'Moon Missions', sources: [evidenceSource], clues: [{ value: 200, clue: 'This lunar module landed during Apollo 11.', response: 'Eagle' }] }];
test('accepted clues retain only exact evidence and trusted source metadata through serialization', async () => {
  const result = await verifyCategories(evidenceCats, 'Apollo 11', async (_, items) => good(items));
  const saved = JSON.parse(JSON.stringify(result.categories));
  assert.deepEqual(saved[0].clues[0].verification.evidence, [{ sourceId: 'primary', title: evidenceSource.title, url: evidenceSource.url, quote: evidenceSource.text, kind: 'web', retrievedAt: evidenceSource.retrievedAt }]);
  assert.equal(currentVerification({ ...saved[0].clues[0], clue: 'Changed factual assertion' }, 'Moon Missions'), undefined);
});
test('missing, fabricated and wrong-document citations cannot earn verification badges', async () => {
  for (const evidence of [undefined, [], [{ sourceId: 'made-up', quote: evidenceSource.text }], [{ sourceId: 'primary', quote: 'The fictional spacecraft landed on Mars and returned.' }]]) {
    await assert.rejects(verifyCategories(evidenceCats, 'Apollo 11', async (_, items) => good(items, { '0:0': { evidence } })), e => e.details.code === 'VERIFICATION_UNAVAILABLE');
  }
  const r = await verifyCategories(evidenceCats, 'Apollo 11', async (_, items) => good(items, { '0:0': { verdict: 'unsure', reason: 'The source does not support the year in this clue.', evidence: [] } }));
  assert.equal(r.categories[0].clues.length, 0);
  assert.match(r.rejected[0].reason, /does not support/);
});
test('source documents are transmitted once and the server hydrates exact IDs', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async (_, options) => {
    const body = JSON.parse(options.body);
    assert.equal(body.sources.length, 1);
    assert.equal(body.items.length, 2);
    assert.ok(body.items.every(i => !i.sources && i.sourceIds[0] === 'primary'));
    const hydrated = contract.hydrateItems(body.items, body.sources);
    const response = good(hydrated);
    assert.equal(contract.parseVerdicts(JSON.stringify(response), hydrated).length, 2);
    return Response.json(response);
  };
  try {
    const cats = [{ ...evidenceCats[0], clues: [...evidenceCats[0].clues, { value: 400, clue: 'The mission that landed Eagle.', response: 'Apollo 11' }] }];
    assert.equal((await verifyCategories(cats, 'Moon missions', undefined, { model: 'generator' })).categories[0].clues.length, 2);
  } finally { globalThis.fetch = original; }
});
test('server rejects unofficial gospel citations and made-up source references', () => {
  const item = { id: '0:0', category: 'Gospel', clue: 'A statement', response: 'Answer', requireEvidence: true, sourcePolicy: 'lds-official', sourceIds: ['primary'] };
  assert.throws(() => contract.hydrateItems([item], [evidenceSource]), /Non-official/);
  assert.throws(() => contract.hydrateItems([{ ...item, sourceIds: ['missing'] }], [evidenceSource]), /Missing evidence/);
  const official = { ...evidenceSource, url: 'https://www.churchofjesuschrist.org/study/scriptures/dc-testament/dc/89?lang=eng' };
  const hydrated = contract.hydrateItems([item], [official]);
  assert.equal(hydrated[0].sources[0].url, official.url);
  assert.throws(() => contract.parseVerdicts(JSON.stringify(good(hydrated, { '0:0': { evidence: [] } })), hydrated), /Missing verifier evidence/);
});
