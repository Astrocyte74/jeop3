// Inspect the raw topic-fact-sheet response to verify confidence signaling.
import { build as esbuild } from 'esbuild';
const OUTP = '/tmp/p.mjs';
await esbuild({ entryPoints: ['src/lib/ai/prompts.ts'], bundle: true, format: 'esm', outfile: OUTP, logLevel: 'silent', loader: { '.json': 'json' } });
const { buildPrompt } = await import(OUTP);

const API = 'http://localhost:7476/api';
const MODEL = 'or:google/gemini-2.5-flash';
const clean = s => s.replace(/^```json\s*/i, '').replace(/["«»]/g, '"').replace(/['']/g, "'").replace(/…/g, '...').replace(/```$/, '').trim();
async function gen(promptType, context) {
  const prompt = buildPrompt(promptType, context, 'normal');
  const r = await fetch(`${API}/ai/generate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ promptType, prompt, model: MODEL }) });
  const d = await r.json();
  if (d.error) throw new Error(d.error);
  return JSON.parse(clean(d.result));
}

// Two scenarios: real categories + a made-up one
console.log('# fact-sheet with mixed real + made-up titles');
const titles = ['JULIO-CLAUDIANS', 'ROMAN GODS', 'A VERY OBSCURE MADE-UP TOPIC XYZQ'];
const sheet = await gen('topic-fact-sheet', { theme: 'Ancient Rome', count: titles.length, topicList: titles });
for (const s of sheet.sections) {
  console.log(`  [${s.title}]  confidence=${s.confidence}  facts=${(s.facts || []).length}`);
  for (const f of (s.facts || []).slice(0, 2)) console.log(`    - ${f}`);
}

console.log('\n# fact-sheet with ALL made-up titles (should bail or all-low)');
const fake = ['TOTALLY FICTIONAL CONCEPT ABC123', 'MADE UP HISTORY OF PLANET ZORB'];
const sheet2 = await gen('topic-fact-sheet', { theme: 'Completely Made Up Thing', count: fake.length, topicList: fake });
for (const s of sheet2.sections) {
  console.log(`  [${s.title}]  confidence=${s.confidence}  facts=${(s.facts || []).length}`);
  for (const f of (s.facts || []).slice(0, 2)) console.log(`    - ${f}`);
}
