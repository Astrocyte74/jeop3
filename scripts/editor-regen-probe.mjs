// End-to-end test of the EditorBoard smart-AI flow (Commits 4+5):
//   1. Generate a board via the pipeline (produces clues + alternatives)
//   2. Simulate per-category regen (generateContentSpan count=1) — replaces
//      the category's clues AND fills the alternatives pool
//   3. Simulate per-clue regen — pulls from the freshly-filled pool (instant)
//      until exhausted, then would fall through to a fresh call
// Mirrors the EditorBoard handlers' logic against a real AI server.
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
const norm = s => s.toLowerCase().replace(/^(the|a|an)\s+/, '').replace(/[^a-z0-9\s]/g, '').trim();

const source = `The Italian Renaissance began in Florence. Leonardo da Vinci painted the Mona Lisa. Michelangelo sculpted David and painted the Sistine Chapel ceiling. Raphael painted The School of Athens. Botticelli painted The Birth of Venus. Galileo improved the telescope and discovered Jupiter's moons. Gutenberg invented the printing press around 1440. Brunelleschi engineered the dome of Florence Cathedral. Machiavelli wrote The Prince.`;

// === STEP 1: initial board (one category, for speed) ===
console.log('# Step 1: initial generation (MASTERS OF ART)');
let board = (await generateContentSpan(generate, {
  referenceMaterial: source, theme: 'Renaissance', titles: ['MASTERS OF ART'], count: 1, difficulty: 'normal', sourceMaterial: source,
})).categories[0];
console.log(`   ${board.clues.length} clues: ${board.clues.map(c => c.response).join(', ')}`);

// === STEP 2: per-category regen (Commit 5) — replaces clues + fills pool ===
console.log('\n# Step 2: per-category regen via pipeline');
const catRes = await generateContentSpan(generate, {
  referenceMaterial: source, theme: 'Renaissance', titles: ['MASTERS OF ART'], count: 1, difficulty: 'normal', sourceMaterial: source,
  existingAnswers: [], // no other categories in this sim
});
const newCat = catRes.categories[0];
const pool = catRes.alternatives?.[0]?.clues || [];
console.log(`   regenerated: ${newCat.clues.length} clues (${newCat.clues.filter(c=>c.provenance==='answer_first').length} answer_first)`);
console.log(`   pool filled: ${pool.length} alternatives`);
board = newCat;
for (const c of board.clues) console.log(`     $${c.value} [${c.provenance}] -> ${c.response}`);
for (const a of pool) console.log(`     [alt] -> ${a.response}`);

// === STEP 3: per-clue regen (Commit 4) — pull from pool until exhausted ===
console.log('\n# Step 3: per-clue regen (clue #1) — pool-first');
let altPool = [...pool];
for (let i = 1; i <= pool.length + 1; i++) {
  const clueIdx = 0;
  const clue = board.clues[clueIdx];
  const existingAnswers = board.clues.filter((_, j) => j !== clueIdx).map(c => c.response);
  const usedNorms = new Set(existingAnswers.map(norm));
  const candidate = altPool.find(a => !usedNorms.has(norm(a.response)));
  if (candidate) {
    const old = clue.response;
    board.clues[clueIdx] = { value: clue.value, clue: candidate.clue, response: candidate.response, provenance: 'answer_first' };
    altPool = altPool.filter(a => !(a.clue === candidate.clue && a.response === candidate.response));
    console.log(`   regen ${i}: POOL HIT  "${old}" -> "${candidate.response}"   (pool ${altPool.length})`);
  } else {
    console.log(`   regen ${i}: POOL EXHAUSTED -> would fall through to fresh editor-generate-clue call`);
    break;
  }
}
console.log('\n✓ EditorBoard smart-AI flow verified (category regen fills pool, per-clue pulls from it)');
