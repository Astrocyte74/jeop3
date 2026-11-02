// One OpenRouter model through the production pipeline with a fixed source pack.
// node scripts/compare-openrouter-cached.mjs fixture.json NEW-output-directory provider/model
import { readFile, writeFile, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { build } from 'esbuild';

const [fixturePath, outputPath, model] = process.argv.slice(2);
if (!fixturePath || !outputPath || !model) throw new Error('Pass fixture.json, NEW-output-directory, and provider/model');
const fixtureBytes = await readFile(fixturePath);
const fixture = JSON.parse(fixtureBytes);
if (fixture.sections?.length !== 6 || fixture.sections.some(s => !s.title || typeof s.body !== 'string' || !s.urls?.length)) throw new Error('Six sourced categories required');
const envText = await readFile(new URL('../server/.env', import.meta.url), 'utf8').catch(() => '');
const key = process.env.OPENROUTER_API_KEY || envText.match(/^OPENROUTER_API_KEY\s*=\s*(.+)$/m)?.[1]?.trim().replace(/^(['"])(.*)\1$/, '$2');
if (!key) throw new Error('OPENROUTER_API_KEY unavailable');
const originalFetch = globalThis.fetch;
const catalogResponse = await originalFetch('https://openrouter.ai/api/v1/models', { signal: AbortSignal.timeout(30000) });
if (!catalogResponse.ok) throw new Error('Cannot verify OpenRouter model catalog');
const entry = (await catalogResponse.json()).data.find(m => m.id === model);
if (!entry) throw new Error('Model not in current OpenRouter catalog');
const effort = process.env.EVAL_REASONING_EFFORT || 'low';
if (!entry.supported_parameters.includes('reasoning')) throw new Error('Selected model does not advertise reasoning control');
const maxTokens = 16384;
const out = resolve(outputPath);
await mkdir(out);
await writeFile(join(out, 'source-fixture.json'), fixtureBytes);
const manifest = {
  createdAt: new Date().toISOString(), model, reasoningEffort: effort, maxTokens,
  catalogEntry: entry, fixtureSha256: createHash('sha256').update(fixtureBytes).digest('hex'),
  method: 'Same fixed-source generateContentSpan and buildPrompt as the subscription CLI comparison. OpenRouter system/user API messages, no tools, no forced JSON mode, provider-default temperature, no transport retry or model substitution. Production fallback retained. Final independent verifier disabled for assistant review. Reviewer knows the single candidate model.',
  sourceHashes: {},
};
for (const file of ['src/lib/ai/board.ts', 'src/lib/ai/prompts.ts', 'src/lib/ai/service.ts', 'src/lib/ai/answers.ts', 'src/lib/ai/exemplars.ts']) manifest.sourceHashes[file] = createHash('sha256').update(await readFile(file)).digest('hex');
await writeFile(join(out, 'manifest.json'), JSON.stringify(manifest, null, 2));
const temp = await mkdtemp(join(tmpdir(), 'jeop-openrouter-cached-'));
const run = { model, topic: fixture.topic, calls: [], stages: [], sourceMode: 'cached_editorial_pack' };
const save = async () => writeFile(join(out, 'run.json'), JSON.stringify(run, null, 2));
async function generate(type, context, difficulty, buildPrompt) {
  const prompt = buildPrompt(type, context, difficulty);
  const prefix = `${String(run.calls.length + 1).padStart(2, '0')}-${type}`;
  const body = { model, messages: [{role: 'system', content: prompt.system}, {role: 'user', content: prompt.user}], reasoning: {effort}, max_tokens: maxTokens, provider: {require_parameters: true} };
  await writeFile(join(out, `${prefix}.prompt.json`), JSON.stringify(prompt, null, 2));
  await writeFile(join(out, `${prefix}.request.json`), JSON.stringify(body, null, 2));
  const call = {stage: type, startedAt: new Date().toISOString()};
  run.calls.push(call);
  const started = Date.now();
  console.log(type);
  try {
    const response = await originalFetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST', signal: AbortSignal.timeout(180000),
      headers: {Authorization: `Bearer ${key}`, 'Content-Type': 'application/json'},
      body: JSON.stringify(body),
    });
    const data = await response.json();
    await writeFile(join(out, `${prefix}.provider.json`), JSON.stringify(data, null, 2));
    call.status = response.status; call.returnedModel = data.model; call.provider = data.provider; call.usage = data.usage;
    if (!response.ok || data.error) throw new Error(`OpenRouter failed (${response.status}); see saved provider response`);
    const choice = data.choices?.[0];
    call.finishReason = choice?.finish_reason;
    call.toolCalls = choice?.message?.tool_calls?.length || 0;
    if (call.toolCalls) throw new Error('Unexpected tool use');
    const raw = choice?.message?.content;
    if (typeof raw !== 'string' || !raw.trim()) throw new Error('Empty model output');
    await writeFile(join(out, `${prefix}.response.txt`), raw);
    if (choice.finish_reason !== 'stop') throw new Error(`Unfinished output: ${choice.finish_reason}`);
    const parsed = JSON.parse(raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, ''));
    await writeFile(join(out, `${prefix}.response.json`), JSON.stringify(parsed, null, 2));
    return parsed;
  } catch (e) { call.error = e.message; throw e; }
  finally { call.elapsedMs = Date.now() - started; await save(); }
}
try {
  for (const name of ['board', 'prompts']) await build({entryPoints:[`src/lib/ai/${name}.ts`],bundle:true,format:'esm',outfile:join(temp,`${name}.mjs`),logLevel:'silent',define:{'import.meta.env.VITE_AI_API_URL':JSON.stringify('http://disabled.invalid/api')}});
  const {generateContentSpan} = await import(pathToFileURL(join(temp, 'board.mjs')));
  const {buildPrompt} = await import(pathToFileURL(join(temp, 'prompts.mjs')));
  globalThis.fetch = async () => {throw new Error('Live application retrieval disabled in cached-source evaluation');};
  const started = Date.now();
  try {
    run.baseline = await generateContentSpan((type,context,difficulty)=>generate(type,context,difficulty,buildPrompt), {
      referenceMaterial:fixture.sections.map(s=>`${s.title}\n${s.body}`).join('\n\n'),theme:fixture.topic,
      titles:fixture.sections.map(s=>s.title),count:6,difficulty:'normal',verify:false,
      categoryGrounding:fixture.sections.map(s=>({title:s.title,contentTopic:fixture.topic,clues:[],sourceMaterial:s.body,sourceUrl:s.urls[0],sourceType:'retrieved'})),
      onStage:stage=>run.stages.push({stage,elapsedMs:Date.now()-started}),
    });
    const clues = run.baseline.categories.flatMap(c=>c.clues);
    run.metrics = {clues:clues.length,completeCategories:run.baseline.categories.filter(c=>c.clues.length===5).length,fallbackClues:clues.filter(c=>c.provenance==='fallback').length};
    await writeFile(join(out,'board.json'),JSON.stringify(run.baseline.categories,null,2));
  } catch(e) {run.error=e.message; process.exitCode=1;}
  run.elapsedMs=Date.now()-started;
  const costs=run.calls.map(c=>c.usage?.cost);
  run.reportedCostUsd=costs.every(c=>typeof c==='number')?costs.reduce((a,b)=>a+b,0):null;
  if (run.calls.some(c=>c.error) || run.metrics?.clues!==30 || run.metrics?.completeCategories!==6) process.exitCode=1;
  await save();
  console.log(JSON.stringify({metrics:run.metrics,elapsedMs:run.elapsedMs,reportedCostUsd:run.reportedCostUsd,errors:run.calls.filter(c=>c.error).map(c=>({stage:c.stage,error:c.error})),error:run.error}));
} finally {globalThis.fetch=originalFetch;await rm(temp,{recursive:true,force:true});}
