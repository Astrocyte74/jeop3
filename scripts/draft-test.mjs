import { build as esbuild } from 'esbuild';
const OUT = '/tmp/jeop3-prompts.mjs';
await esbuild({ entryPoints: ['src/lib/ai/prompts.ts'], bundle: true, format: 'esm', outfile: OUT, logLevel: 'silent' });
const { buildPrompt } = await import(OUT);
const avoid = ['ROMAN EMPERORS', 'GODS & GODDESSES', 'LATIN PHRASES'];
const prompt = buildPrompt('category-names-draft', { gameTopic: 'Ancient Rome', count: 3, existingNames: avoid }, 'normal');
const r = await fetch('http://localhost:7476/api/ai/generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ promptType: 'category-names-draft', prompt, model: 'or:google/gemini-2.5-flash' }) });
const d = await r.json();
if (d.error) { console.log('ERR', d.error, d.message); process.exit(0); }
const cleaned = d.result.replace(/^```json\s*/i, '').replace(/[""«»]/g, '"').replace(/['']/g, "'").replace(/…/g, '...').replace(/```$/, '').trim();
const names = JSON.parse(cleaned).names;
const norm = s => s.toUpperCase().replace(/[^A-Z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
const collisions = names.filter(n => avoid.map(norm).includes(norm(n)));
console.log('avoid     :', avoid.join(' | '));
console.log('generated :', names.join(' | '));
console.log(`count=${names.length}/3, collisions with avoid: ${collisions.length}`);
