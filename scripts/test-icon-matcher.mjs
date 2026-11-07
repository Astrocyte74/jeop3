import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const dir = await mkdtemp(join(tmpdir(), 'jeop3-icons-'));
const output = join(dir, 'matcher.mjs');
await build({
  entryPoints: ['src/lib/iconMatcher.ts'], bundle: true, format: 'esm', outfile: output,
  define: { 'import.meta.env.VITE_ICON_BASE_URL': '""' }, logLevel: 'silent',
});
const { iconMatcher } = await import(pathToFileURL(output));
after(() => rm(dir, { recursive: true, force: true }));
const storageDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
let preferredSize = '512';
Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: () => preferredSize } });
after(() => {
  if (storageDescriptor) Object.defineProperty(globalThis, 'localStorage', storageDescriptor);
  else delete globalThis.localStorage;
});

const icon = { slug: 'vampire-bat', file_name: 'vampire-bat.png', title: 'Vampire Bat', category: 'Nature', tags: ['mammal', 'flight'] };
const catalog = () => Response.json({ items: [icon] });

test('missing smaller catalogs fall back to 1024 for search AND image URLs', async t => {
  for (const size of ['128', '256', '512']) {
    for (const missing of [() => new Response('', { status: 404 }), () => new Response('<!doctype html>'), () => Response.json({ items: [] })]) {
      const requested = [];
      t.mock.method(globalThis, 'fetch', async url => {
        requested.push(url);
        return url.includes('size-1024') ? catalog() : missing();
      });
      preferredSize = size;
      assert.equal(await iconMatcher.reload(), true);
      assert.equal(iconMatcher.search('mammal')[0].slug, 'vampire-bat');
      const match = iconMatcher.findMatch('', 'bat');
      assert.equal(iconMatcher.buildIconUrl(match), '/icons/size-1024/images/vampire-bat.png');
      assert.deepEqual(requested, [`/icons/size-${size}/meta.json`, '/icons/size-1024/meta.json']);
      t.mock.restoreAll();
    }
  }
});

test('available preferred resolution is used without a fallback request', async t => {
  const requested = [];
  preferredSize = '256';
  t.mock.method(globalThis, 'fetch', async url => { requested.push(url); return catalog(); });
  assert.equal(await iconMatcher.reload(), true);
  assert.equal(iconMatcher.buildIconUrl(iconMatcher.findMatch('', 'bat')), '/icons/size-256/images/vampire-bat.png');
  assert.deepEqual(requested, ['/icons/size-256/meta.json']);
});

test('failure clears stale matches and a later load can recover', async t => {
  preferredSize = '1024';
  const requests = t.mock.method(globalThis, 'fetch', async () => new Response('', { status: 404 }));
  assert.equal(await iconMatcher.reload(), false);
  assert.equal(iconMatcher.isLoaded(), false);
  assert.deepEqual(iconMatcher.search('bat'), []);
  assert.equal(iconMatcher.buildIconUrl({ icon }), null);
  assert.equal(requests.mock.callCount(), 1);
  requests.mock.mockImplementation(async () => catalog());
  assert.equal(await iconMatcher.load(), true);
  assert.equal(iconMatcher.search('bat')[0].slug, 'vampire-bat');
});

test('answer names outrank context and ambiguous words use clue context', async t => {
  const entry = (title, tags = [], category = 'Objects') => ({ title, slug: title.toLowerCase().replaceAll(' ', '-'), file_name: `${title}.png`, tags, category });
  const items = [
    entry('Baseball Bat', ['baseball', 'sport']),
    entry('Vampire Bat', ['mammal', 'fly'], 'Animals'),
    entry('Tusk of a Mammal', ['mammal'], 'Animals'),
    entry('Microscope', ['science']),
    entry('Joseph', ['person']),
    entry('Smith', ['person']),
    entry('Temple', ['religion']),
    entry('Salt Lake Temple', ['religion']),
  ];
  t.mock.method(globalThis, 'fetch', async () => Response.json({ items }));
  await iconMatcher.reload();
  assert.equal(iconMatcher.findMatch('This mammal can fly', 'What is a bat?', 'Animals').icon.title, 'Vampire Bat');
  assert.equal(iconMatcher.findMatch('Hit a baseball with this', 'What is a bat?', 'Sport').icon.title, 'Baseball Bat');
  assert.equal(iconMatcher.findMatch('A temple in Utah', 'What is the Salt Lake Temple?', 'Religion').icon.title, 'Salt Lake Temple');
  assert.equal(iconMatcher.findMatch('This scientist used a microscope', 'Who is Joseph Smith?', 'Science'), null);
  assert.deepEqual(iconMatcher.findMatches('This mammal can fly', 'Unknown Answer', 'Animals'), []);
  assert.equal(iconMatcher.search('Salt Lake Temple')[0].title, 'Salt Lake Temple');
});
