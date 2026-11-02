// Production topic pipeline, with subscription CLI calls replacing /ai/generate.
// node scripts/compare-topic-pipeline.mjs <NEW-output-directory> [topic]
import { readFile, writeFile, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { spawn, spawnSync, execFileSync } from 'node:child_process';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';
import { randomInt, createHash } from 'node:crypto';
import { AsyncLocalStorage } from 'node:async_hooks';
import { build } from 'esbuild';

if (!process.argv[2]) throw new Error('Pass a NEW output directory');
const out = resolve(process.argv[2]);
const fixturePath = process.env.EVAL_SOURCE_FIXTURE;
const fixture = fixturePath ? JSON.parse(await readFile(fixturePath, 'utf8')) : null;
if (fixture && (fixture.sections?.length !== 6 || fixture.sections.some(s => !s.title || typeof s.body !== 'string' || s.body.length < 100 || !s.urls?.length))) {
  throw new Error('Cached source fixture needs six titled sections, source URLs and substantive bodies');
}
const topic = fixture?.topic || process.argv[3] || 'Ancient Rome';
const api = process.env.EVAL_RETRIEVAL_API || 'http://localhost:7476/api';
const effort = process.env.EVAL_REASONING_EFFORT || 'low';
const retrievalIntervalMs = Number(process.env.EVAL_RETRIEVAL_INTERVAL_MS || 1500);
const env = { ...process.env };
for (const key of ['OPENAI_API_KEY', 'CODEX_API_KEY', 'OPENAI_BASE_URL', 'OPENROUTER_API_KEY']) delete env[key];
const login = spawnSync('codex', ['login', 'status'], { env, encoding: 'utf8' });
if (login.status !== 0 || !(login.stdout + login.stderr).includes('Logged in using ChatGPT')) throw new Error('ChatGPT subscription login required');
await mkdir(out);
const temp = await mkdtemp(join(tmpdir(), 'jeop-topic-pipeline-'));
const models = ['gpt-6-luna', 'gpt-6.1-terra', 'gpt-6.1-sol'];
for (let i = models.length - 1; i > 0; i--) { const j = randomInt(i + 1); [models[i], models[j]] = [models[j], models[i]]; }
const manifest = { createdAt: new Date().toISOString(), topic, count: 6, difficulty: 'normal', reasoningEffort: effort,
  cliVersion: execFileSync('codex', ['--version'], { encoding: 'utf8' }).trim(), retrievalIntervalMs, modelScheduling: 'sequential',
  models: models.map((model, i) => ({ label: String.fromCharCode(65 + i), model })),
  method: 'Unmodified buildPrompt + generateTopicSpan, each model drafting category names. Live app retrieval. Same-model extraction/writing/quality scoring, production fallback retained. Final independent verification disabled for capture and replaced by assistant review. No game save, title/team generation or API model calls.',
  sourceHashes: {},
};
if (fixture) {
  manifest.method = 'Fixed categories and cached editorial source pack; unmodified generateContentSpan, the same extraction/writing/scoring/selection/fallback path called by topic mode after retrieval. Category drafting, live retrieval, memory fact sheets and independent verification are excluded. Subscription CLI only.';
  manifest.fixtureSha256 = createHash('sha256').update(await readFile(fixturePath)).digest('hex');
  await writeFile(join(out, 'source-fixture.json'), JSON.stringify(fixture, null, 2));
}
for (const file of ['src/lib/ai/board.ts', 'src/lib/ai/prompts.ts', 'src/lib/ai/service.ts', 'src/lib/ai/answers.ts', 'src/lib/ai/exemplars.ts', 'server/index.js']) {
  manifest.sourceHashes[file] = createHash('sha256').update(await readFile(file)).digest('hex');
}
await writeFile(join(out, 'identity-sealed.json'), JSON.stringify(manifest, null, 2));
const context = new AsyncLocalStorage();
const originalFetch = globalThis.fetch;
let retrievalQueue = Promise.resolve();
let nextRetrievalAt = 0;
globalThis.fetch = async (url, options = {}) => {
  const run = context.getStore();
  if (!run) return originalFetch(url, options);
  if (fixture) throw new Error('Cached-source evaluation forbids network calls from the application pipeline');
  if (![`${api}/search-wikipedia`, `${api}/fetch-article`].includes(String(url))) throw new Error('Evaluation permits retrieval endpoints only; model API calls are disabled');
  const started = Date.now();
  const record = { url: String(url), request: JSON.parse(options.body || '{}') };
  run.retrieval.push(record);
  try {
    // Pace benchmark traffic so one run cannot starve the next. Retain the
    // exact app requests/responses; no source substitutions or hidden retries.
    const job = retrievalQueue.then(async () => {
      const waitMs = Math.max(0, nextRetrievalAt - Date.now());
      if (waitMs) await new Promise(r => setTimeout(r, waitMs));
      nextRetrievalAt = Date.now() + retrievalIntervalMs;
      // The app's timeout began before the queue; start it when dispatched.
      return originalFetch(url, { ...options, signal: AbortSignal.timeout(20000) });
    });
    retrievalQueue = job.then(() => undefined, () => undefined);
    const response = await job;
    record.status = response.status;
    record.response = await response.clone().json();
    return response;
  } catch (e) { record.error = e.message; throw e; }
  finally { record.elapsedMs = Date.now() - started; }
};

async function cliGenerate(model, run, type, prompt) {
  const n = run.calls.length + 1;
  const prefix = `${run.label}-${String(n).padStart(2, '0')}-${type}`;
  const call = { stage: type, startedAt: new Date().toISOString() };
  run.calls.push(call);
  const started = Date.now();
  const text = `This is one inference step in an application. Do not use tools, browse, inspect files or run commands. Follow the application instructions and return its requested JSON only.\n\nAPPLICATION SYSTEM INSTRUCTIONS:\n${prompt.system}\n\nAPPLICATION USER INPUT:\n${prompt.user}`;
  await writeFile(join(out, `${prefix}.prompt.json`), JSON.stringify(prompt, null, 2));
  await writeFile(join(out, `${prefix}.cli-prompt.txt`), text);
  console.log(`Candidate ${run.label}: ${type}`);
  const args = ['exec', '--ignore-user-config', '--ephemeral', '--skip-git-repo-check', '-C', temp, '--sandbox', 'read-only', '-m', model,
    '-c', `model_reasoning_effort="${effort}"`, '-c', 'web_search="disabled"', '--json', '-o', join(out, `${prefix}.response.txt`), '-'];
  try {
    const events = await new Promise((resolveRun, reject) => {
      const child = spawn('codex', args, { env, stdio: ['pipe', 'pipe', 'pipe'] });
      let stdout = '', stderr = '', timeout = false;
      const timer = setTimeout(() => { timeout = true; child.kill('SIGTERM'); setTimeout(() => child.kill('SIGKILL'), 5000).unref(); }, 600000);
      child.stdout.on('data', b => { stdout += b; }); child.stderr.on('data', b => { stderr += b; });
      child.on('error', e => { clearTimeout(timer); reject(e); });
      child.on('close', async code => {
        clearTimeout(timer);
        try {
          await writeFile(join(out, `${prefix}.events.jsonl`), stdout);
          await writeFile(join(out, `${prefix}.stderr.txt`), stderr);
          if (timeout || code !== 0) throw new Error(timeout ? 'CLI step timed out' : `CLI exited ${code}`);
          resolveRun(stdout.split('\n').filter(Boolean).flatMap(line => { try { return [JSON.parse(line)]; } catch { return []; } }));
        } catch (e) { reject(e); }
      });
      child.stdin.end(text);
    });
    call.usage = events.findLast(e => e.type === 'turn.completed')?.usage;
    call.toolCalls = events.filter(e => e.type === 'item.completed' && ['command_execution', 'mcp_tool_call', 'web_search', 'file_change'].includes(e.item?.type)).length;
    if (call.toolCalls) throw new Error('CLI used tools; application-inference condition violated');
    const raw = await readFile(join(out, `${prefix}.response.txt`), 'utf8');
    const data = JSON.parse(raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, ''));
    await writeFile(join(out, `${prefix}.response.json`), JSON.stringify(data, null, 2));
    return data;
  } catch (e) { call.error = e.message; throw e; }
  finally { call.elapsedMs = Date.now() - started; await writeFile(join(out, `${run.label}.progress.json`), JSON.stringify(run, null, 2)); }
}

try {
  for (const name of ['board', 'prompts']) await build({ entryPoints: [`src/lib/ai/${name}.ts`], bundle: true, format: 'esm', outfile: join(temp, `${name}.mjs`), logLevel: 'silent', define: { 'import.meta.env.VITE_AI_API_URL': JSON.stringify(api) } });
  const { generateTopicSpan, generateContentSpan } = await import(pathToFileURL(join(temp, 'board.mjs')));
  const { buildPrompt, validators } = await import(pathToFileURL(join(temp, 'prompts.mjs')));
  for (const m of manifest.models) await context.run({ label: m.label, topic, calls: [], retrieval: [], stages: [] }, async () => {
    const run = context.getStore();
    const started = Date.now();
    try {
      const generate = (type, ctx, difficulty) => cliGenerate(m.model, run, type, buildPrompt(type, ctx, difficulty));
      let titles = fixture?.sections.map(s => s.title);
      if (!fixture) try {
        const draft = await generate('category-names-draft', { count: 6, gameTopic: topic }, 'normal');
        if (!validators['category-names-draft'](draft)) throw new Error('Invalid category name response');
        titles = draft.names.slice(0, 6);
        if (titles.length !== 6) throw new Error('Fewer than six category names');
      } catch (e) {
        run.draftError = e.message;
        // Matches topic-span fallback when no curated titles are available.
        titles = undefined;
      }
      run.titles = titles;
      const onStage = stage => { run.stages.push({ stage, elapsedMs: Date.now() - started }); console.log(`Candidate ${m.label}: ${stage}`); };
      if (fixture) {
        run.baseline = await generateContentSpan(generate, {
          referenceMaterial: fixture.sections.map(s => `${s.title}\n${s.body}`).join('\n\n'),
          theme: topic, titles, count: 6, difficulty: 'normal', verify: false, onStage,
          categoryGrounding: fixture.sections.map(s => ({title: s.title, contentTopic: topic, clues: [], sourceMaterial: s.body, sourceUrl: s.urls[0], sourceType: 'retrieved'})),
        });
        run.baseline.categorySources = fixture.sections.map(s => ({title:s.title,sourceType:'retrieved',url:s.urls[0]}));
        run.sourceMode = 'cached_editorial_pack';
      } else run.baseline = await generateTopicSpan(generate, { topic, titles, count: 6, difficulty: 'normal', verify: false, onStage });
      const clues = run.baseline.categories.flatMap(c => c.clues);
      run.metrics = { clues: clues.length, completeCategories: run.baseline.categories.filter(c => c.clues.length === 5).length,
        fallbackClues: clues.filter(c => c.provenance === 'fallback').length,
        retrievedCategories: run.baseline.categorySources.filter(s => s.sourceType === 'retrieved').length,
        synthesizedCategories: run.baseline.categorySources.filter(s => s.sourceType === 'ai_synthesized').length };
      await writeFile(join(out, `${m.label}.board.json`), JSON.stringify(run.baseline.categories, null, 2));
      console.log(`Candidate ${m.label} complete: ${run.metrics.clues} clues; ${run.metrics.completeCategories}/6 full categories`);
    } catch (e) { run.error = e.message; process.exitCode = 1; console.log(`Candidate ${m.label} failed; details saved`); }
    run.elapsedMs = Date.now() - started;
    await writeFile(join(out, `${m.label}.run.json`), JSON.stringify(run, null, 2));
  });
} finally { globalThis.fetch = originalFetch; await rm(temp, { recursive: true, force: true }); }
console.log('Review candidate boards before opening identity-sealed.json.');
