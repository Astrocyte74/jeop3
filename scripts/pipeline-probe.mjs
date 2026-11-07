// Prove the answer-first pipeline before wiring it into the app.
// extract-board-answers -> filter (generic/dup banlist) -> clues-from-answers
import { build as esbuild } from 'esbuild';
const OUT = '/tmp/jeop3-prompts.mjs';
await esbuild({ entryPoints: ['src/lib/ai/prompts.ts'], bundle: true, format: 'esm', outfile: OUT, logLevel: 'silent' });
const { buildPrompt } = await import(OUT);

const API = 'http://localhost:7476/api';
const MODEL = 'or:' + (process.env.MODEL || 'google/gemini-2.5-flash');
const source = `Mercury is the smallest planet in the Solar System and the closest to the Sun. It completes an orbit every 88 Earth days, the fastest of any planet. A solar day on Mercury (sunrise to sunrise) lasts about 176 Earth days due to its 3:2 spin-orbit resonance. Mercury has no moons and almost no atmosphere, causing extreme temperature swings from 430°C in daylight to -180°C at night. Its heavily cratered surface includes the Caloris Basin, one of the largest impact craters in the Solar System at about 1,550 km across. Mercury was first visited by Mariner 10 in 1974-75, then by NASA's MESSENGER probe, which orbited from 2011 to 2015. The planet is named after the Roman messenger god. BepiColombo, a joint ESA-JAXA mission, launched in 2018 to study Mercury.`;

async function gen(promptType, context) {
  const prompt = buildPrompt(promptType, context, 'normal');
  const r = await fetch(`${API}/ai/generate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ promptType, prompt, model: MODEL }) });
  const d = await r.json();
  if (d.error) throw new Error(d.error + ': ' + d.message);
  let s = d.result.replace(/^```json\s*/i, '').replace(/["«»]/g, '"').replace(/['']/g, "'").replace(/…/g, '...').replace(/```$/g, '').trim();
  return JSON.parse(s);
}

const titles = ['PLANETARY PROFILE', 'ORBIT & MOTION', 'SURFACE FEATURES', 'MISSIONS & PROBES', 'TEMPERATURE & ATMOSPHERE', 'NAME & MYTHOLOGY'];
console.log(`# model: ${MODEL}\n# Step 1: extract-board-answers`);
const extracted = await gen('extract-board-answers', { referenceMaterial: source, count: 6, topicList: titles });

const GENERIC = new Set(['size','speed','atmosphere','orbit','orbital speed','orbital velocity','temperature','craters','the sun','sun','planet','surface','rotation','axial rotation','distance','gravity','core','moons','moon','year','day','name','color','mass','diameter','velocity','resonance']);
const norm = s => s.toLowerCase().trim().replace(/^(the|a|an)\s+/, '').replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ');
const seen = new Set(); let dropped = 0;
const board = extracted.categories.map(cat => ({
  title: cat.title,
  answers: cat.answers.filter(a => {
    const n = norm(a.answer);
    if (GENERIC.has(n) || (!/\s/.test(n) && n.length < 5) || seen.has(n)) { dropped++; return false; }
    seen.add(n); return true;
  }),
}));
const total = board.reduce((s, c) => s + c.answers.length, 0);
console.log(`   extracted ${extracted.categories.reduce((s, c) => s + c.answers.length, 0)} -> dropped ${dropped} generic/dup -> ${total} kept` + (board.some(c => c.answers.length < 5) ? '   ⚠ thin' : ''));

console.log('\n# Step 2: clues-from-answers');
const clues = await gen('clues-from-answers', { answerBoard: board });
let i = 0;
for (const cat of clues.categories) {
  console.log(`\n${++i}. ${(cat.title || '').toUpperCase()}  (${(cat.clues || []).length} clues)`);
  for (const c of (cat.clues || [])) console.log(`   $${c.value}  ${c.clue}\n        -> ${c.response}`);
}
