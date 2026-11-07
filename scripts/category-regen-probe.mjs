// Verify per-category regeneration routes through the answer-first pipeline,
// producing judged clues (not single-pass) + a fresh alternatives pool.
// Simulates handleRegenerateCategory's content-mode path: generateContentSpan
// for ONE category with existingAnswers from other categories.
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

const source = `The Italian Renaissance began in Florence. Leonardo da Vinci painted the Mona Lisa. Michelangelo sculpted David and painted the Sistine Chapel ceiling. Raphael painted The School of Athens. Botticelli painted The Birth of Venus. Galileo improved the telescope and discovered Jupiter's moons. Gutenberg invented the printing press around 1440. Brunelleschi engineered the dome of Florence Cathedral. Machiavelli wrote The Prince.`;

// Simulate: other categories on the board already used these answers,
// so the regenerated category must avoid them (cross-category dedup).
const existingAnswers = ['Galileo Galilei', 'Johannes Gutenberg', 'Filippo Brunelleschi'];

console.log('# per-category regen via pipeline (MASTERS OF ART, count=1)');
console.log(`# existingAnswers to avoid: ${existingAnswers.join(', ')}\n`);

const span = await generateContentSpan(generate, {
  referenceMaterial: source,
  theme: 'Renaissance',
  titles: ['MASTERS OF ART'],
  count: 1,
  difficulty: 'normal',
  existingAnswers,
  sourceMaterial: source,
});

const cat = span.categories[0];
console.log(`${cat.title}  (${cat.clues.length} clues, patched=${span.patched})`);
for (const c of cat.clues) console.log(`  $${c.value} [${c.provenance}] ${c.clue}\n      -> ${c.response}`);

// Confirm none of the regenerated answers collide with existingAnswers
const norm = s => s.toLowerCase().replace(/^(the|a|an)\s+/, '').replace(/[^a-z0-9\s]/g, '').trim();
const usedNorms = new Set(existingAnswers.map(norm));
const collisions = cat.clues.filter(c => usedNorms.has(norm(c.response)));
console.log(`\n# cross-category dedup: ${collisions.length} collisions (expected 0)`);

// Confirm alternatives were produced (proves the pipeline ran, not single-pass)
const alts = span.alternatives?.[0]?.clues || [];
console.log(`# alternatives retained: ${alts.length} (proves pipeline ran, not single-pass)`);
for (const a of alts) console.log(`   [alt] -> ${a.response}`);
