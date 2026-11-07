// Prove topic-mode parity: topic -> fact-sheet -> answer-first pipeline.
// Verifies the fact-sheet grounds the topic, then the same A+ curation runs.
import { build as esbuild } from 'esbuild';
const OUTP = '/tmp/p.mjs';
const OUTB = '/tmp/b.mjs';
await esbuild({ entryPoints: ['src/lib/ai/prompts.ts'], bundle: true, format: 'esm', outfile: OUTP, logLevel: 'silent', loader: { '.json': 'json' } });
await esbuild({ entryPoints: ['src/lib/ai/board.ts'], bundle: true, format: 'esm', outfile: OUTB, logLevel: 'silent', loader: { '.json': 'json' } });
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

// 1. Inspect the fact-sheet for a topic (no categories — let it propose).
console.log(`# topic-fact-sheet for "Ancient Rome"  (model ${MODEL})`);
const sheet = await generate('topic-fact-sheet', { theme: 'Ancient Rome', count: 3 }, 'normal');
for (const s of sheet.sections.slice(0, 3)) {
  console.log(`\n  [${s.title}]  (${s.facts.length} facts)`);
  for (const f of s.facts.slice(0, 4)) console.log(`    - ${f}`);
}

// 2. Run the full topic pipeline with suggested titles.
const titles = ['JULIO-CLAUDIANS', 'ROMAN GODS', 'THE LEGIONS'];
console.log(`\n# topic pipeline -> A+ curation  (titles: ${titles.join(', ')})`);
const res = await generateTopicSpan(generate, { topic: 'Ancient Rome', titles, count: 3, difficulty: 'normal' });
const total = res.categories.reduce((s, c) => s + c.clues.length, 0);
const af = res.categories.reduce((s, c) => s + c.clues.filter(cl => cl.provenance === 'answer_first').length, 0);
console.log(`patched=${res.patched}  categories=${res.categories.length}  clues=${total}  (answer_first=${af}, fallback=${total - af})`);
let i = 0;
for (const cat of res.categories) {
  console.log(`\n${++i}. ${cat.title.toUpperCase()}  (${cat.clues.length})`);
  for (const c of cat.clues) console.log(`   $${c.value} [${c.provenance}] ${c.clue}\n        -> ${c.response}`);
}
