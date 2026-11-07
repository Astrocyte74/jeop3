// Simulate the regen-from-pool logic to confirm:
//   1. a candidate is pulled from the pool when available
//   2. the used candidate is removed from the pool (decrement)
//   3. re-validation against the live board catches duplicates
//   4. falls through to fresh-call when the pool is exhausted
// Generates a real board (with alternatives) on the Renaissance source, then
// simulates N regenerations of one clue, printing each swap.
import { build as esbuild } from 'esbuild';
await esbuild({ entryPoints: ['src/lib/ai/prompts.ts'], bundle: true, format: 'esm', outfile: '/tmp/p.mjs', logLevel: 'silent' });
await esbuild({ entryPoints: ['src/lib/ai/board.ts'], bundle: true, format: 'esm', outfile: '/tmp/b.mjs', logLevel: 'silent', loader: { '.json': 'json' } });
const { buildPrompt } = await import('/tmp/p.mjs');
const { generateContentSpan } = await import('/tmp/b.mjs');

const API = 'http://localhost:7476/api';
const MODEL = 'or:google/gemini-2.5-flash';
const clean = s => s.replace(/^```json\s*/i, '').replace(/["«»]/g, '"').replace(/['']/g, "'").replace(/…/g, '...').replace(/```$/, '').trim();
async function generate(promptType, context, difficulty) {
  const prompt = buildPrompt(promptType, context, difficulty);
  const r = await fetch(`${API}/ai/generate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ promptType, prompt, model: MODEL }) });
  const d = await r.json();
  if (d.error) throw new Error(d.error);
  return JSON.parse(clean(d.result));
}

const source = `The Italian Renaissance began in Florence in the 14th century. The Medici family bankrolled artists and ruled Florence. Leonardo da Vinci painted the Mona Lisa and the Last Supper. Michelangelo sculpted David and painted the Sistine Chapel ceiling. Raphael painted The School of Athens. Botticelli painted The Birth of Venus. Galileo improved the telescope and discovered Jupiter's moons. Gutenberg invented the printing press around 1440. Brunelleschi engineered the dome of Florence Cathedral. Machiavelli wrote The Prince. Venice grew rich on trade. The Council of Trent began in 1545.`;
const titles = ['FLORENTINE POWER', 'MASTERS OF ART', 'SCIENCE & DISCOVERY', 'IDEAS IN PRINT', 'ARCHITECTURE & STATECRAFT', 'EMPIRE & THE CHURCH'];

const res = await generateContentSpan(generate, { referenceMaterial: source, titles, count: 6, difficulty: 'normal' });

// Simulated "live board" state — mirrors GeneratedGameData shape
let categories = res.categories.map(c => ({ title: c.title, clues: c.clues.map(cl => ({ ...cl })) }));
let alternatives = (res.alternatives || []).map(a => ({ title: a.title, clues: [...a.clues] }));

const norm = s => s.toLowerCase().replace(/^(the|a|an)\s+/, '').replace(/[^a-z0-9\s]/g, '').trim();

// Find a category with alternatives to test against
const targetCat = categories.findIndex(c => alternatives.find(a => a.title === c.title)?.clues.length);
if (targetCat < 0) { console.log('No category has alternatives — try a richer source'); process.exit(0); }
const targetClueIdx = 1; // regenerate the $400 slot

console.log(`# simulating regen on: ${categories[targetCat].title} clue #${targetClueIdx} ($${categories[targetCat].clues[targetClueIdx].value})`);
console.log(`   starting clue -> ${categories[targetCat].clues[targetClueIdx].response}`);
console.log(`   pool size: ${alternatives.find(a => a.title === categories[targetCat].title).clues.length}\n`);

for (let i = 1; i <= 5; i++) {
  const cat = categories[targetCat];
  const clue = cat.clues[targetClueIdx];
  const existingAnswers = categories.flatMap(c => c.clues.map(cl => cl.response)).filter(a => a !== clue.response);
  const usedNorms = new Set(existingAnswers.map(norm));
  const pool = alternatives.find(a => a.title === cat.title)?.clues || [];
  const candidate = pool.find(a => !usedNorms.has(norm(a.response)));

  if (candidate) {
    const oldResp = clue.response;
    cat.clues[targetClueIdx] = { value: clue.value, clue: candidate.clue, response: candidate.response, provenance: 'answer_first' };
    // decrement pool
    const poolEntry = alternatives.find(a => a.title === cat.title);
    poolEntry.clues = poolEntry.clues.filter(c => !(c.clue === candidate.clue && c.response === candidate.response));
    console.log(`  regen ${i}: POOL HIT  "${oldResp}" -> "${candidate.response}"   (pool now ${poolEntry.clues.length})`);
  } else {
    console.log(`  regen ${i}: POOL EXHAUSTED -> would fall through to fresh AI call`);
    break;
  }
}
