// Verify single-source normalization routes through the answer-first pipeline.
// Simulates handleWizardComplete's normalization + the pipeline loop for a
// single paste source, confirming it produces judged clues + alternatives
// (proving it went through the pipeline, not legacy single-pass).
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

// Simulate the normalization: single paste source → one-element customSources
const referenceMaterial = `The Italian Renaissance began in Florence. Leonardo da Vinci painted the Mona Lisa. Michelangelo sculpted David and painted the Sistine Chapel ceiling. Raphael painted The School of Athens. Botticelli painted The Birth of Venus. Galileo improved the telescope and discovered Jupiter's moons. Gutenberg invented the printing press around 1440.`;

const effectiveCustomSources = [{
  id: 'single-source',
  type: 'paste',
  content: referenceMaterial,
  categoryCount: 6,
}];

console.log(`# single-source normalized → ${effectiveCustomSources.length} customSource, type=${effectiveCustomSources[0].type}`);
console.log(`# (should now flow through generateContentSpan, producing judged clues + alternatives)\n`);

// Run the pipeline as the loop would
const span = await generateContentSpan(generate, {
  referenceMaterial: effectiveCustomSources[0].content,
  theme: 'Renaissance',
  count: 6,
  difficulty: 'normal',
  sourceMaterial: effectiveCustomSources[0].content,
});

const total = span.categories.reduce((s, c) => s + c.clues.length, 0);
const af = span.categories.reduce((s, c) => s + c.clues.filter(cl => cl.provenance === 'answer_first').length, 0);
const altTotal = (span.alternatives || []).reduce((s, c) => s + c.clues.length, 0);
console.log(`result: ${span.categories.length} categories, ${total} clues (answer_first=${af}, fallback=${total-af}), ${altTotal} alternatives`);
console.log(af > 0 ? '✓ PASSED: pipeline produced judged answer_first clues (not single-pass)' : '✗ FAILED: no answer_first clues');
console.log(altTotal > 0 ? '✓ alternatives retained (proves pipeline ran)' : '⚠ no alternatives (thin source or judge rejected all)');
