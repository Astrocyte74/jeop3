// Prove the A+ helper: extract -> filter -> clues -> (patch gaps from single-pass).
// Prints the merged board with per-clue provenance + the `patched` flag.
import { build as esbuild } from 'esbuild';
await esbuild({ entryPoints: ['src/lib/ai/prompts.ts'], bundle: true, format: 'esm', outfile: '/tmp/p.mjs', logLevel: 'silent' });
await esbuild({ entryPoints: ['src/lib/ai/board.ts'], bundle: true, format: 'esm', outfile: '/tmp/b.mjs', logLevel: 'silent' });
const { buildPrompt } = await import('/tmp/p.mjs');
const { generateContentSpan } = await import('/tmp/b.mjs');

const API = 'http://localhost:7476/api';
const MODEL = 'or:' + (process.env.MODEL || 'google/gemini-2.5-flash');
const clean = s => s.replace(/^```json\s*/i, '').replace(/["«»]/g, '"').replace(/['']/g, "'").replace(/…/g, '...').replace(/```$/g, '').trim();
async function generate(promptType, context, difficulty) {
  const prompt = buildPrompt(promptType, context, difficulty);
  const r = await fetch(`${API}/ai/generate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ promptType, prompt, model: MODEL }) });
  const d = await r.json();
  if (d.error) throw new Error(d.error + ': ' + d.message);
  return JSON.parse(clean(d.result));
}

const source = `Mercury is the smallest planet in the Solar System and the closest to the Sun. It completes an orbit every 88 Earth days, the fastest of any planet. A solar day on Mercury (sunrise to sunrise) lasts about 176 Earth days due to its 3:2 spin-orbit resonance. Mercury has no moons and almost no atmosphere, causing extreme temperature swings from 430°C in daylight to -180°C at night. Its heavily cratered surface includes the Caloris Basin, one of the largest impact craters in the Solar System at about 1,550 km across. Mercury was first visited by Mariner 10 in 1974-75, then by NASA's MESSENGER probe, which orbited from 2011 to 2015. The planet is named after the Roman messenger god. BepiColombo, a joint ESA-JAXA mission, launched in 2018 to study Mercury.`;
const titles = ['PLANETARY PROFILE', 'ORBIT & MOTION', 'SURFACE FEATURES', 'MISSIONS & PROBES', 'TEMPERATURE & ATMOSPHERE', 'NAME & MYTHOLOGY'];

console.log(`# A+ pipeline  (model ${MODEL})`);
const res = await generateContentSpan(generate, { referenceMaterial: source, titles, count: 6, difficulty: 'normal' });
const total = res.categories.reduce((s, c) => s + c.clues.length, 0);
const af = res.categories.reduce((s, c) => s + c.clues.filter(cl => cl.provenance === 'answer_first').length, 0);
console.log(`patched=${res.patched}  categories=${res.categories.length}  clues=${total}  (answer_first=${af}, fallback=${total - af})`);
let i = 0;
for (const cat of res.categories) {
  console.log(`\n${++i}. ${cat.title.toUpperCase()}  (${cat.clues.length})`);
  for (const c of cat.clues) console.log(`   $${c.value} [${c.provenance}] ${c.clue}\n        -> ${c.response}`);
}
