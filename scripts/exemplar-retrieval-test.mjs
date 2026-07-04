// Verify the exemplar retriever returns sensible matches for sample queries.
import { build as esbuild } from 'esbuild';
const OUT = '/tmp/jeop3-exemplars.mjs';
await esbuild({
  entryPoints: ['src/lib/ai/exemplars.ts'],
  bundle: true, format: 'esm', outfile: OUT, logLevel: 'silent',
  loader: { '.json': 'json' },
});
const { retrieveExemplars } = await import(OUT);

const queries = [
  'SPACE EXPLORATION',
  'Ancient Rome',
  'OPERAS',
  'U.S. PRESIDENTS',
  'SCIENCE',
  'Mercury — PLANETARY PROFILE',
  '80s MUSIC',
  'WORLD CAPITALS',
];

for (const q of queries) {
  console.log(`\n=== "${q}" ===`);
  const hits = retrieveExemplars(q, 4);
  for (const h of hits) {
    console.log(`  [${h.category}] $${h.value}`);
    console.log(`    ${h.clue}`);
    console.log(`    -> ${h.response}`);
  }
}
