// Live production-pipeline capture. Writes raw HTTP requests/responses locally.
// node scripts/diagnose-ai-verification.mjs <new-output-directory> [api-base]
import { mkdir, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
if (!process.argv[2]) throw new Error('Usage: node scripts/diagnose-ai-verification.mjs <new-output-directory> [api-base]');
const out = resolve(process.argv[2]);
const api = process.argv[3] || 'http://localhost:7476/api';
await mkdir(out, { mode: 0o700 });
const temp = await mkdtemp(join(tmpdir(), 'jeop-diagnose-'));
const model = 'or:google/gemini-2.5-flash';
const originalFetch = globalThis.fetch;
let run;
globalThis.fetch = async (url, options = {}) => {
  const call = { url: String(url), request: JSON.parse(options.body || '{}') };
  run.calls.push(call);
  try {
    const res = await originalFetch(url, options);
    call.status = res.status;
    call.rawResponse = await res.clone().text();
    return res;
  } catch (e) { call.error = e.message; throw e; }
};
try {
  for (const name of ['board', 'prompts', 'wholeBoard']) await build({ entryPoints: [`src/lib/ai/${name}.ts`], bundle: true, format: 'esm', outfile: join(temp, `${name}.mjs`), logLevel: 'silent', define: { 'import.meta.env.VITE_AI_API_URL': JSON.stringify(api) } });
  const { generateTopicSpan, generateContentSpan } = await import(pathToFileURL(join(temp, 'board.mjs')));
  const { buildPrompt } = await import(pathToFileURL(join(temp, 'prompts.mjs')));
  const { generateFinalJeopardy } = await import(pathToFileURL(join(temp, 'wholeBoard.mjs')));
  const generate = async (promptType, context, difficulty) => {
    const res = await fetch(`${api}/ai/generate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model, promptType, prompt: buildPrompt(promptType, context, difficulty) }) });
    const data = await res.json();
    if (!res.ok) throw new Error(JSON.stringify(data));
    return JSON.parse(data.result.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, ''));
  };
  const paste = 'Apollo 11 was the first mission to land humans on the Moon. Neil Armstrong and Buzz Aldrin landed on July 20, 1969. Michael Collins remained in lunar orbit aboard the command module Columbia. The lunar module was named Eagle. The landing site was the Sea of Tranquility. A Saturn V rocket launched the mission from Kennedy Space Center in Florida on July 16, 1969. The crew returned to Earth on July 24, 1969, splashing down in the Pacific Ocean. The USS Hornet recovered the astronauts. Armstrong was the mission commander; Aldrin was the lunar module pilot; Collins was the command module pilot.';
  for (const [key, topic, fixedTitles, source] of [
    ['space', 'Space exploration', ['To Infinity And Beyond']],
    ['apollo', 'Apollo 11'], ['capitals', 'World capitals'],
    ['paste', 'Apollo 11', ['Moon Landing'], paste],
    ['gospel', 'Word of Wisdom', ['The Word of Wisdom']],
    ['multi', 'Space exploration', ['First Steps', 'Robotic Explorers']],
  ]) {
    if (process.env.AI_DIAGNOSTIC_CASES && !process.env.AI_DIAGNOSTIC_CASES.split(',').includes(key)) continue;
    run = { key, topic, model, calls: [], events: [] };
    console.log(`${key}: starting`);
    try {
      const titles = fixedTitles || (await generate('category-names-draft', { count: 1, gameTopic: topic }, 'normal')).names.slice(0, 1);
      run.titles = titles;
      const opts = { titles, count: titles.length, difficulty: 'normal', model, onProgress: e => run.events.push(e) };
      run.result = source
        ? await generateContentSpan(generate, { ...opts, referenceMaterial: source, sourceMaterial: source, theme: topic })
        : await generateTopicSpan(generate, { ...opts, topic });
      run.final = await generateFinalJeopardy(generate, run.result.categories, topic, { model });
    } catch (e) { run.error = { message: e.message, ...e }; }
    await writeFile(join(out, `${key}.json`), JSON.stringify(run, null, 2), { mode: 0o600 });
    console.log(`${key}: ${run.error?.message || `${run.result.categories.reduce((n, c) => n + c.clues.length, 0)} clues verified`}; capture ${join(out, `${key}.json`)}`);
  }
} finally { globalThis.fetch = originalFetch; await rm(temp, { recursive: true, force: true }); }
