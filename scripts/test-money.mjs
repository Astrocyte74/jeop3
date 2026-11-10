import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const dir = await mkdtemp(join(tmpdir(), 'jeop3-money-'));
const out = join(dir, 'money.mjs');
await build({ entryPoints: ['src/lib/money.ts', 'src/lib/scorePreview.ts'], outdir: dir, bundle: true, format: 'esm', platform: 'node', logLevel: 'silent', outExtension: { '.js': '.mjs' } });
after(() => rm(dir, { recursive: true, force: true }));
const { formatMoney, formatDelta } = await import(pathToFileURL(out).href);
const { setScorePreviews, consumeScorePreview } = await import(pathToFileURL(join(dir, 'scorePreview.mjs')).href);

test('money has thousands separators and a real minus sign', () => {
  assert.equal(formatMoney(0), '$0');
  assert.equal(formatMoney(200), '$200');
  assert.equal(formatMoney(1200), '$1,200');
  assert.equal(formatMoney(-1200), '−$1,200');
  assert.equal(formatMoney(1234567), '$1,234,567');
  assert.equal(formatMoney(799.6), '$800');
});

test('a delta always carries its sign', () => {
  assert.equal(formatDelta(800), '+$800');
  assert.equal(formatDelta(-1200), '−$1,200');
});

test('a previewed score is consumed once and only on an exact match', () => {
  setScorePreviews({ a: 1000, b: 400 });
  assert.equal(consumeScorePreview('a', 900), false);
  assert.equal(consumeScorePreview('a', 1000), true);
  assert.equal(consumeScorePreview('a', 1000), false);
  setScorePreviews({});
  assert.equal(consumeScorePreview('b', 400), false);
});
