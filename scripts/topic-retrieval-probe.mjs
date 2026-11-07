// Verify topic-mode parity with per-category Wikipedia retrieval + fact-sheet
// fallback. Prints, per category, whether the source was RETRIEVED or
// AI-SYNTHESIZED, plus the Wikipedia URL when retrieved.
import { build as esbuild } from 'esbuild';
const OUTP = '/tmp/p.mjs';
const OUTB = '/tmp/b.mjs';
await esbuild({
  entryPoints: ['src/lib/ai/prompts.ts'], bundle: true, format: 'esm', outfile: OUTP,
  logLevel: 'silent', loader: { '.json': 'json' },
});
await esbuild({
  entryPoints: ['src/lib/ai/board.ts'], bundle: true, format: 'esm', outfile: OUTB,
  logLevel: 'silent', loader: { '.json': 'json' },
  // service.ts references import.meta.env + window; shim them for Node.
  define: { 'import.meta.env.VITE_AI_API_URL': 'undefined' },
  banner: { js: 'globalThis.window = globalThis.window || { location: { hostname: "localhost" } };' },
});
const { buildPrompt } = await import(OUTP);
const { generateTopicSpan } = await import(OUTB);

const API = 'http://localhost:7476/api';
const MODEL = 'or:' + (process.env.MODEL || 'google/gemini-2.5-flash');
const clean = s => s.replace(/^```json\s*/i, '').replace(/["«»]/g, '"').replace(/['']/g, "'").replace(/…/g, '...').replace(/```$/, '').trim();
async function generate(promptType, context, difficulty) {
  const prompt = buildPrompt(promptType, context, difficulty);
  const r = await fetch(`${API}/ai/generate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ promptType, prompt, model: MODEL }) });
  const d = await r.json();
  if (d.error) throw new Error(d.error + ': ' + d.message);
  return JSON.parse(clean(d.result));
}

// Two scenarios:
// (a) concrete titles that SHOULD resolve on Wikipedia (retrieved path)
// (b) one title that almost certainly WON'T resolve (fact-sheet fallback path)
const titles = ['JULIO-CLAUDIANS', 'ROMAN GODS', 'A VERY OBSCURE MADE-UP TOPIC XYZQ'];
console.log(`# topic retrieval test  (model ${MODEL})`);
console.log(`# titles: ${titles.join(', ')}\n`);

const res = await generateTopicSpan(generate, { topic: 'Ancient Rome', titles, count: titles.length, difficulty: 'normal' });

console.log('# per-category grounding:');
for (const cs of (res.categorySources || [])) {
  const tag = cs.sourceType === 'retrieved' ? 'RETRIEVED' : 'AI-SYNTHESIZED';
  console.log(`  [${cs.title}]  ${tag}` + (cs.url ? `  ${cs.url}` : ''));
}

const total = res.categories.reduce((s, c) => s + c.clues.length, 0);
const af = res.categories.reduce((s, c) => s + c.clues.filter(cl => cl.provenance === 'answer_first').length, 0);
console.log(`\n# result: patched=${res.patched}  categories=${res.categories.length}  clues=${total}  (answer_first=${af}, fallback=${total - af})`);

let i = 0;
for (const cat of res.categories) {
  console.log(`\n${++i}. ${cat.title.toUpperCase()}  (${cat.clues.length})`);
  for (const c of cat.clues) console.log(`   $${c.value} [${c.provenance}] ${c.clue}\n        -> ${c.response}`);
}
