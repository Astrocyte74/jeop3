// Eyeball clue quality: generate a game from a source and print every clue → answer.
import { build as esbuild } from 'esbuild';
const OUT = '/tmp/jeop3-prompts.mjs';
await esbuild({ entryPoints: ['src/lib/ai/prompts.ts'], bundle: true, format: 'esm', outfile: OUT, logLevel: 'silent' });
const { buildPrompt } = await import(OUT);

const source = `Mercury is the smallest planet in the Solar System and the closest to the Sun. It completes an orbit every 88 Earth days, the fastest of any planet. A solar day on Mercury (sunrise to sunrise) lasts about 176 Earth days due to its 3:2 spin-orbit resonance. Mercury has no moons and almost no atmosphere, causing extreme temperature swings from 430°C in daylight to -180°C at night. Its heavily cratered surface includes the Caloris Basin, one of the largest impact craters in the Solar System at about 1,550 km across. Mercury was first visited by Mariner 10 in 1974-75, then by NASA's MESSENGER probe, which orbited from 2011 to 2015. The planet is named after the Roman messenger god. BepiColombo, a joint ESA-JAXA mission, launched in 2018 to study Mercury.`;

const prompt = buildPrompt('categories-generate-from-content', { theme: 'Mercury', count: 6, referenceMaterial: source, sourceCharacters: source.length }, 'normal');
const model = process.env.MODEL ? 'or:' + process.env.MODEL : 'or:google/gemini-2.5-flash';
console.log(`# model: ${model}\n`);
const r = await fetch('http://localhost:7476/api/ai/generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ promptType: 'categories-generate-from-content', prompt, model }) });
const d = await r.json();
if (d.error) { console.log('ERR', d.error, d.message); process.exit(0); }
const cleaned = d.result.replace(/^```json\s*/i, '').replace(/["«»]/g, '"').replace(/['']/g, "'").replace(/…/g, '...').replace(/```$/, '').trim();
const parsed = JSON.parse(cleaned);
let i = 0;
for (const cat of parsed.categories) {
  console.log(`\n${++i}. ${cat.title.toUpperCase()}`);
  for (const c of cat.clues) console.log(`   $${c.value}  ${c.clue}\n        -> ${c.response}`);
}
