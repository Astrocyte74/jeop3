import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const dir = await mkdtemp(join(tmpdir(), 'jeop3-hostlink-'));
await build({
  entryPoints: ['protocol', 'presence', 'tvLink', 'hostLink'].map((n) => `src/lib/hostLink/${n}.ts`),
  outdir: dir,
  bundle: true,
  format: 'esm',
  platform: 'node',
  logLevel: 'silent',
  outExtension: { '.js': '.mjs' },
});
after(() => rm(dir, { recursive: true, force: true }));
const load = (n) => import(pathToFileURL(join(dir, `${n}.mjs`)).href);
const { encode, decode, PROTOCOL_VERSION, PRESENCE_TIMEOUT_MS, HEARTBEAT_MS } = await load('protocol');
const { createPresence } = await load('presence');
const { createTvLink } = await load('tvLink');
const { createHostLink } = await load('hostLink');

/** In-memory stand-in for BroadcastChannel: a send reaches every other endpoint, never the sender. */
function createBus() {
  const endpoints = new Set();
  return {
    endpoint() {
      const listeners = new Set();
      const ep = {
        listeners,
        sent: [],
        send(data) {
          ep.sent.push(data);
          for (const other of endpoints) if (other !== ep) other.listeners.forEach((l) => l(data));
        },
        subscribe(l) {
          listeners.add(l);
          return () => listeners.delete(l);
        },
        close() {
          listeners.clear();
          endpoints.delete(ep);
        },
      };
      endpoints.add(ep);
      return ep;
    },
  };
}

function clock(start = 1000) {
  let t = start;
  const now = () => t;
  now.advance = (ms) => { t += ms; };
  return now;
}

const SNAPSHOT = { game: null };

// ------------------------------------------------------------------ protocol

test('protocol: every message type survives encode and decode', () => {
  const messages = [
    { from: 'host', kind: 'hello', hostId: 'h1' },
    { from: 'host', kind: 'heartbeat', hostId: 'h1' },
    { from: 'host', kind: 'bye', hostId: 'h1' },
    { from: 'host', kind: 'command', hostId: 'h1', seq: 3, command: { type: 'openClue', c: 2, r: 4 } },
    { from: 'host', kind: 'command', hostId: 'h1', seq: 4, command: { type: 'timer', action: 'add', seconds: 10 } },
    { from: 'host', kind: 'command', hostId: 'h1', seq: 5, command: { type: 'correct', teamId: 'a' } },
    { from: 'tv', kind: 'snapshot', snapshot: SNAPSHOT },
    { from: 'tv', kind: 'beat' },
    { from: 'tv', kind: 'rejected', hostId: 'h2', reason: 'not-active' },
  ];
  for (const message of messages) {
    const raw = encode(message);
    assert.equal(typeof raw, 'string');
    assert.deepEqual(decode(raw), { v: PROTOCOL_VERSION, ...message });
  }
});

test('protocol: unknown versions, garbage and malformed messages are dropped', () => {
  const ok = { from: 'host', kind: 'hello', hostId: 'h1' };
  assert.equal(decode(JSON.stringify({ v: PROTOCOL_VERSION + 1, ...ok })), null);
  assert.equal(decode(JSON.stringify(ok)), null, 'no version');
  assert.equal(decode('not json'), null);
  assert.equal(decode(null), null);
  assert.equal(decode(42), null);
  assert.equal(decode(JSON.stringify({ v: PROTOCOL_VERSION, from: 'nobody', kind: 'hello' })), null);
  assert.equal(decode(JSON.stringify({ v: PROTOCOL_VERSION, from: 'host', kind: 'explode', hostId: 'h' })), null);
  assert.equal(decode(JSON.stringify({ v: PROTOCOL_VERSION, from: 'host', kind: 'hello' })), null, 'missing hostId');
  const command = (c) => JSON.stringify({ v: PROTOCOL_VERSION, from: 'host', kind: 'command', hostId: 'h', seq: 1, command: c });
  assert.ok(decode(command({ type: 'judge' })));
  assert.equal(decode(command({ type: 'selfDestruct' })), null, 'unknown command');
  assert.equal(decode(command({ type: 'openClue', c: 'x', r: 1 })), null, 'bad coordinates');
  assert.equal(decode(command({ type: 'correct' })), null, 'missing team');
  assert.equal(decode(command({ type: 'timer', action: 'rewind' })), null, 'bad timer action');
  assert.equal(decode(command({ type: 'ddWager', amount: Infinity })), null);
  assert.equal(decode(JSON.stringify({ v: PROTOCOL_VERSION, from: 'tv', kind: 'snapshot' })), null, 'snapshot needs a body');
});

// ------------------------------------------------------------------ presence

test('presence: a host is connected while heartbeats arrive and gone after the timeout', () => {
  const now = clock();
  const p = createPresence({ now });
  assert.equal(p.isConnected(), false);
  p.hello('a');
  assert.equal(p.isConnected(), true);
  for (let i = 0; i < 5; i++) {
    now.advance(HEARTBEAT_MS);
    assert.equal(p.heartbeat('a'), 'ok');
  }
  assert.equal(p.isConnected(), true, 'regular heartbeats keep it alive');
  now.advance(PRESENCE_TIMEOUT_MS - 1);
  assert.equal(p.isConnected(), true);
  now.advance(2);
  assert.equal(p.isConnected(), false, 'silent past the timeout');
  assert.equal(p.accepts('a'), false);
});

test('presence: the newest hello wins and the old host loses control', () => {
  const now = clock();
  const p = createPresence({ now });
  p.hello('a');
  now.advance(1000);
  p.hello('b');
  assert.equal(p.accepts('b'), true);
  assert.equal(p.accepts('a'), false);
  assert.equal(p.heartbeat('a'), 'ignored');
  assert.equal(p.activeHostId(), 'b');
});

test('presence: a lone heartbeat after the game window reloaded is adopted, a goodbye ends control', () => {
  const now = clock();
  const p = createPresence({ now });
  assert.equal(p.heartbeat('a'), 'adopted');
  assert.equal(p.accepts('a'), true);
  p.bye('b');
  assert.equal(p.isConnected(), true, 'a stranger leaving changes nothing');
  p.bye('a');
  assert.equal(p.isConnected(), false);
});

// ------------------------------------------------------------------ the game window

function setupTv() {
  const bus = createBus();
  const now = clock();
  const commands = [];
  const changes = [];
  const tv = createTvLink({
    transport: bus.endpoint(),
    getSnapshot: () => SNAPSHOT,
    onCommand: (c) => commands.push(c),
    onConnectedChange: (v) => changes.push(v),
    now,
    intervalMs: 0,
  });
  return { bus, now, tv, commands, changes };
}

const sendFromHost = (ep, message) => ep.send(encode(message));
const decodeAll = (ep) => ep.sent.map(decode).filter(Boolean);

test('tv link: commands are rejected, and answered with a rejection, while no host is connected', () => {
  const { bus, commands } = setupTv();
  const host = bus.endpoint();
  const heard = [];
  host.subscribe((raw) => heard.push(decode(raw)));
  sendFromHost(host, { from: 'host', kind: 'command', hostId: 'ghost', seq: 1, command: { type: 'undo' } });
  assert.deepEqual(commands, []);
  assert.deepEqual(heard.map((m) => [m.kind, m.reason]), [['rejected', 'no-host']]);
});

test('tv link: hello connects, gets a snapshot, and commands run once in order', () => {
  const { bus, tv, commands, changes } = setupTv();
  const host = bus.endpoint();
  const heard = [];
  host.subscribe((raw) => heard.push(decode(raw)));
  sendFromHost(host, { from: 'host', kind: 'hello', hostId: 'a' });
  assert.deepEqual(changes, [true]);
  assert.equal(heard[0].kind, 'snapshot');
  sendFromHost(host, { from: 'host', kind: 'command', hostId: 'a', seq: 1, command: { type: 'judge' } });
  sendFromHost(host, { from: 'host', kind: 'command', hostId: 'a', seq: 2, command: { type: 'correct', teamId: 't1' } });
  sendFromHost(host, { from: 'host', kind: 'command', hostId: 'a', seq: 2, command: { type: 'correct', teamId: 't1' } });
  assert.deepEqual(commands, [{ type: 'judge' }, { type: 'correct', teamId: 't1' }]);
  tv.dispose();
});

test('tv link: a host that goes silent is dropped and its commands are refused', () => {
  const { bus, now, tv, commands, changes } = setupTv();
  const host = bus.endpoint();
  sendFromHost(host, { from: 'host', kind: 'hello', hostId: 'a' });
  now.advance(HEARTBEAT_MS);
  sendFromHost(host, { from: 'host', kind: 'heartbeat', hostId: 'a' });
  now.advance(PRESENCE_TIMEOUT_MS + 1);
  tv.check();
  assert.deepEqual(changes, [true, false]);
  sendFromHost(host, { from: 'host', kind: 'command', hostId: 'a', seq: 1, command: { type: 'undo' } });
  assert.deepEqual(commands, []);
  tv.dispose();
});

test('tv link: only the newest host controls; the older one is told it was replaced', () => {
  const { bus, tv, commands } = setupTv();
  const a = bus.endpoint();
  const b = bus.endpoint();
  const toA = [];
  a.subscribe((raw) => toA.push(decode(raw)));
  sendFromHost(a, { from: 'host', kind: 'hello', hostId: 'a' });
  sendFromHost(b, { from: 'host', kind: 'hello', hostId: 'b' });
  sendFromHost(a, { from: 'host', kind: 'command', hostId: 'a', seq: 1, command: { type: 'nobody' } });
  sendFromHost(b, { from: 'host', kind: 'command', hostId: 'b', seq: 1, command: { type: 'continue' } });
  assert.deepEqual(commands, [{ type: 'continue' }]);
  assert.ok(toA.some((m) => m.kind === 'rejected' && m.hostId === 'a' && m.reason === 'not-active'));
  tv.dispose();
});

test('tv link: snapshots are only sent while a host is connected', () => {
  const { bus, tv } = setupTv();
  const host = bus.endpoint();
  const heard = [];
  host.subscribe((raw) => heard.push(decode(raw)));
  tv.publish();
  assert.equal(heard.length, 0);
  sendFromHost(host, { from: 'host', kind: 'hello', hostId: 'a' });
  const afterHello = heard.length;
  tv.publish();
  assert.equal(heard.length, afterHello + 1);
  sendFromHost(host, { from: 'host', kind: 'bye', hostId: 'a' });
  tv.publish();
  assert.equal(heard.length, afterHello + 1, 'nothing is sent after the host says goodbye');
  tv.dispose();
});

// ------------------------------------------------------------------ the host window

test('host link: connects on the first reply, is lost on silence, and can be superseded', () => {
  const bus = createBus();
  const now = clock();
  const tvEp = bus.endpoint();
  const states = [];
  const host = createHostLink({ transport: bus.endpoint(), hostId: 'h', onChange: (s) => states.push(s.status), now, intervalMs: 0 });
  assert.equal(host.getState().status, 'connecting');
  tvEp.send(encode({ from: 'tv', kind: 'snapshot', snapshot: SNAPSHOT }));
  assert.equal(host.getState().status, 'connected');
  assert.deepEqual(host.getState().snapshot, SNAPSHOT);
  now.advance(PRESENCE_TIMEOUT_MS + 1);
  host.check();
  assert.equal(host.getState().status, 'lost');
  tvEp.send(encode({ from: 'tv', kind: 'beat' }));
  assert.equal(host.getState().status, 'connected', 'it recovers when the game window answers again');
  tvEp.send(encode({ from: 'tv', kind: 'rejected', hostId: 'someone-else', reason: 'not-active' }));
  assert.equal(host.getState().status, 'connected');
  tvEp.send(encode({ from: 'tv', kind: 'rejected', hostId: 'h', reason: 'not-active' }));
  assert.equal(host.getState().status, 'superseded');
  host.dispose();
  assert.deepEqual(states.filter((s, i) => states.indexOf(s) === i), ['connected', 'lost', 'superseded']);
});

test('host link and tv link together: a verdict reaches the game and the score snapshot comes back', () => {
  const bus = createBus();
  const now = clock();
  const received = [];
  let score = 0;
  const tv = createTvLink({
    transport: bus.endpoint(),
    getSnapshot: () => ({ game: { score } }),
    onCommand: (c) => {
      received.push(c);
      if (c.type === 'correct') score += 400;
    },
    now,
    intervalMs: 0,
  });
  const host = createHostLink({ transport: bus.endpoint(), hostId: 'h', onChange: () => {}, now, intervalMs: 0 });
  assert.equal(host.getState().status, 'connected');
  host.send({ type: 'correct', teamId: 't1' });
  tv.publish();
  assert.deepEqual(received, [{ type: 'correct', teamId: 't1' }]);
  assert.deepEqual(host.getState().snapshot, { game: { score: 400 } });
  host.dispose();
  tv.check();
  assert.equal(tv.isConnected(), false, 'a goodbye drops the host at once');
  tv.dispose();
});
