// Eyeball the clues-from-answers prompt WITH few-shot exemplars injected, then
// run the full A+ pipeline and print the resulting clues with provenance.
// Compare against the prior (no-few-shot) baseline to judge voice improvement.
import { build as esbuild } from 'esbuild';
const OUTP = '/tmp/p.mjs';
const OUTB = '/tmp/b.mjs';
await esbuild({ entryPoints: ['src/lib/ai/prompts.ts'], bundle: true, format: 'esm', outfile: OUTP, logLevel: 'silent', loader: { '.json': 'json' } });
await esbuild({ entryPoints: ['src/lib/ai/board.ts'], bundle: true, format: 'esm', outfile: OUTB, logLevel: 'silent', loader: { '.json': 'json' } });
const { buildPrompt } = await import(OUTP);
const { generateContentSpan } = await import(OUTB);
const { retrieveExemplars } = await import('/tmp/jeop3-exemplars.mjs');

// 1. Show that the prompt actually contains the exemplars.
const titles = ['PLANETARY PROFILE', 'ORBIT & MOTION', 'SURFACE FEATURES', 'MISSIONS & PROBES', 'TEMPERATURE & ATMOSPHERE', 'NAME & MYTHOLOGY'];
const ex = retrieveExemplars(['Mercury', ...titles].join(' · '), 4);
const probePrompt = buildPrompt('clues-from-answers', { answerBoard: [{ title: 'PLANETARY PROFILE', answers: [{ answer: 'Mariner 10', fact: 'first Mercury flyby' }] }], exemplars: ex }, 'normal');
console.log('# exemplars retrieved:', ex.length);
console.log('# prompt contains STYLE REFERENCES?', probePrompt.user.includes('REAL JEOPARDY! STYLE REFERENCES') ? 'YES' : 'NO');
console.log('# sample injected line:', probePrompt.user.split('\n').find(l => l.startsWith('▎')));

// 2. Run the full pipeline on the Mercury source.
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

const source = `Mercury is the smallest planet in the Solar System and the closest to the Sun. It completes an orbit every 88 Earth days, the fastest of any planet. A solar day on Mercury (sunrise to sunrise) lasts about 176 Earth days due to its 3:2 spin-orbit resonance. Mercury has no moons and almost no atmosphere, causing extreme temperature swings from 430°C in daylight to -180°C at night. Its heavily cratered surface includes the Caloris Basin, one of the largest impact craters in the Solar System at about 1,550 km across. Mercury was first visited by Mariner 10 in 1974-75, then by NASA's MESSENGER probe, which orbited from 2011 to 2015. The planet is named after the Roman messenger god. BepiColombo, a joint ESA-JAXA mission, launched in 2018 to study Mercury.`;

console.log(`\n# A+ pipeline WITH few-shot  (model ${MODEL})`);
const res = await generateContentSpan(generate, { referenceMaterial: source, titles, count: 6, difficulty: 'normal' });
const total = res.categories.reduce((s, c) => s + c.clues.length, 0);
const af = res.categories.reduce((s, c) => s + c.clues.filter(cl => cl.provenance === 'answer_first').length, 0);
console.log(`patched=${res.patched}  categories=${res.categories.length}  clues=${total}  (answer_first=${af}, fallback=${total - af})`);
let i = 0;
for (const cat of res.categories) {
  console.log(`\n${++i}. ${cat.title.toUpperCase()}  (${cat.clues.length})`);
  for (const c of cat.clues) console.log(`   $${c.value} [${c.provenance}] ${c.clue}\n        -> ${c.response}`);
}
