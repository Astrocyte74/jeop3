// Paired evaluation: one candidate board, with/without the factual gate.
// Calls the production pipeline and saves every clue, verdict and provider usage.
import { readFile, writeFile, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { modelIdentity } from '../server/verification.cjs';
const args = process.argv.slice(2);
const arg = (name, fallback) => { const i = args.indexOf(name); return i < 0 ? fallback : args[i + 1]; };
if (args.includes('--help')) {
  console.log('node scripts/eval-ai.mjs --config scripts/eval-ai.example.json [--api http://localhost:7476/api] [--out eval-results/run.json] [--replay prior-report.json]\nConfig: models [{id, reasoningEffort?}], cases [{topic,titles,difficulty?}], verifierModel?, evaluatorModel?, reviewMode?: "manual", repeats?\nEvaluator must differ from generator and verifier. No evaluator means no accuracy score. Uses configured paid APIs.');
  process.exit(0);
}
const config = JSON.parse(await readFile(arg('--config', 'scripts/eval-ai.example.json'), 'utf8'));
const api = arg('--api', 'http://localhost:7476/api');
const out = resolve(arg('--out', `eval-results/${new Date().toISOString().replace(/[:.]/g, '-')}.json`));
const replayPath = arg('--replay');
const replay = replayPath ? JSON.parse(await readFile(replayPath, 'utf8')) : undefined;
const temp = await mkdtemp(join(tmpdir(), 'jeop3-eval-'));
const report = { replayOf: replayPath, createdAt: new Date().toISOString(), config, note: 'Reviewer/evaluator judgments are model assessments, not ground truth. Human review fields are intentionally blank.', runs: [] };
await mkdir(resolve(out, '..'), { recursive: true });
async function save() { await writeFile(out, JSON.stringify(report, null, 2) + '\n'); }
const metrics = cats => {
  const clues = cats.flatMap(c => c.clues);
  const norm = s => s.toLowerCase().replace(/^(the|a|an)\s+/, '').replace(/[^a-z0-9]/g, '');
  return { categories: cats.length, completeCategories: cats.filter(c => c.clues.length === 5).length, clues: clues.length, duplicateAnswers: clues.length - new Set(clues.map(c => norm(c.response))).size };
};
try {
  const health = await (await fetch(`${api}/health`)).json();
  const enabled = health.models.map(m => modelIdentity(m.id));
  for (const m of config.models) if (!enabled.includes(modelIdentity(m.id))) throw new Error(`Model not enabled: ${m.id}`);
  for (const id of [config.verifierModel, config.evaluatorModel].filter(Boolean)) if (!enabled.includes(modelIdentity(id))) throw new Error(`Model not enabled: ${id}`);
  for (const name of ['board', 'prompts', 'verification']) {
    await build({ entryPoints: [`src/lib/ai/${name}.ts`], bundle: true, format: 'esm', outfile: join(temp, `${name}.mjs`), logLevel: 'silent', define: { 'import.meta.env.VITE_AI_API_URL': JSON.stringify(api) } });
  }
  const { generateTopicSpan } = await import(pathToFileURL(join(temp, 'board.mjs')));
  const { buildPrompt } = await import(pathToFileURL(join(temp, 'prompts.mjs')));
  const { verifyCategories } = await import(pathToFileURL(join(temp, 'verification.mjs')));
  for (const model of config.models) for (const scenario of config.cases) for (let trial = 1; trial <= (config.repeats || 1); trial++) {
    const run = { model, topic: scenario.topic, titles: scenario.titles, trial, calls: [], humanReview: [] };
    report.runs.push(run);
    const started = Date.now();
    async function request(path, body, stage) {
      const begin = Date.now();
      const response = await fetch(`${api}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(180000) });
      const result = await response.json();
      run.calls.push({ stage, model: result.model, elapsedMs: Date.now() - begin, usage: result.usage, error: response.ok ? undefined : result.error });
      if (!response.ok) throw new Error(result.error || response.statusText);
      return result;
    }
    try {
      console.log(`${model.id} (${model.reasoningEffort || 'default'}) · ${scenario.topic} · trial ${trial}`);
      const generate = async (promptType, context, difficulty) => {
        const result = await request('/ai/generate', { promptType, prompt: buildPrompt(promptType, context, difficulty), model: model.id, reasoningEffort: model.reasoningEffort }, promptType);
        return JSON.parse(result.result.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, ''));
      };
      const savedRun = replay?.runs.find(r => r.model.id === model.id && r.model.reasoningEffort === model.reasoningEffort && r.topic === scenario.topic && JSON.stringify(r.titles) === JSON.stringify(scenario.titles) && r.trial === trial);
      if (replay && !savedRun?.baseline) throw new Error('No matching baseline in replay report');
      const baseline = savedRun?.baseline || await generateTopicSpan(generate, { topic: scenario.topic, titles: scenario.titles, count: scenario.titles.length, difficulty: scenario.difficulty || 'normal', verify: false, onStage: stage => console.log(`  ${stage}`) });
      run.baseline = { ...baseline, metrics: metrics(baseline.categories), elapsedMs: Date.now() - started };
      await save();
      if (config.reviewMode === 'manual') {
        run.reviewStatus = 'awaiting_source_review';
        run.humanReview = baseline.categories.flatMap((cat, ci) => cat.clues.map((clue, qi) => ({
          id: `${ci}:${qi}`, category: cat.title, clue: clue.clue, response: clue.response,
          factual: null, onTopic: null, sourceUrlChecked: null, notes: '',
        })));
        run.elapsedMs = Date.now() - started;
        await save();
        console.log(`  ${run.baseline.metrics.clues} clues saved for source-based review; no model verifier called`);
        continue;
      }
      // Identical candidate board for both arms: no regenerating easier facts in the verified arm.
      const checked = await verifyCategories(baseline.categories, scenario.topic, (topic, items) => request('/ai/verify', { topic, items, generatorModel: model.id, verifierModel: config.verifierModel }, 'verification'));
      run.filtered = { ...checked, metrics: metrics(checked.categories), rejected: checked.audit.verdicts.filter(v => v.verdict !== 'true' || !v.onTopic).length };
      if (config.evaluatorModel) {
        if ([model.id, checked.audit.model].some(id => modelIdentity(id) === modelIdentity(config.evaluatorModel))) throw new Error('Evaluator must differ from generator and verifier');
        // Blind to the verifier's decisions: review original pairs, then split scores by retained IDs.
        const evaluation = await request('/ai/verify', { topic: scenario.topic, items: checked.audit.items, generatorModel: model.id, verifierModel: config.evaluatorModel }, 'blind-evaluation');
        const retained = new Set(checked.audit.verdicts.filter(v => v.verdict === 'true' && v.onTopic).map(v => v.id));
        const score = rows => ({ assessed: rows.length, trueOnTopic: rows.filter(v => v.verdict === 'true' && v.onTopic).length, false: rows.filter(v => v.verdict === 'false').length, unsure: rows.filter(v => v.verdict === 'unsure').length, offTopic: rows.filter(v => !v.onTopic).length });
        run.evaluation = { model: evaluation.model, verdicts: evaluation.verdicts, baseline: score(evaluation.verdicts), filtered: score(evaluation.verdicts.filter(v => retained.has(v.id))) };
      }
      run.humanReview = checked.audit.items.map(i => ({ ...i, factual: null, onTopic: null, sourceUrlChecked: null, notes: '' }));
      console.log(`  ${run.baseline.metrics.clues} baseline clues → ${run.filtered.metrics.clues} accepted; ${run.filtered.metrics.completeCategories}/${scenario.titles.length} complete categories`);
    } catch (error) {
      run.error = error.message; console.error(`  Failed: ${error.message}`);
    }
    run.elapsedMs = Date.now() - started;
    await save();
  }
  console.log(`Saved ${out}`);
  if (report.runs.some(r => r.error)) process.exitCode = 1;
} finally { await rm(temp, { recursive: true, force: true }); }
