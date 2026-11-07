// Verify Live Board truthfulness: when suggestedCategoryTitles are provided,
// generation honors them (final category titles match the curated drafts).
import { build as esbuild } from 'esbuild';
const OUT = '/tmp/jeop3-prompts.mjs';
await esbuild({ entryPoints: ['src/lib/ai/prompts.ts'], bundle: true, format: 'esm', outfile: OUT, logLevel: 'silent' });
const { buildPrompt } = await import(OUT);

const suggested = ['ROMAN HOLIDAY', 'WHEN IN ROME...', 'ET TU, BRUTE?', 'GLADIATOR GAMES', "THE EMPEROR'S NEW", 'HAIL, CAESAR!'];
const prompt = buildPrompt('categories-generate', { theme: 'Ancient Rome', count: 6, suggestedCategoryTitles: suggested }, 'normal');
console.log('prompt honors suggested titles?', prompt.user.includes('Use these category titles IN THIS ORDER') ? 'YES' : 'NO');

const r = await fetch('http://localhost:7476/api/ai/generate', {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ promptType: 'categories-generate', prompt, model: 'or:google/gemini-2.5-flash' }),
});
const d = await r.json();
if (d.error) { console.log('ERR', d.error, d.message); process.exit(0); }
let cleaned = d.result.replace(/^```json\s*/i, '').replace(/[“”«»]/g, '"').replace(/[‘’]/g, "'").replace(/…/g, '...').replace(/```$/, '').trim();
const parsed = JSON.parse(cleaned);
const finals = parsed.categories.map(c => c.title);
console.log('\nSUGGESTED :', suggested.join(' | '));
console.log('GENERATED :', finals.join(' | '));
const norm = s => s.toUpperCase().replace(/[^A-Z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
let exact = 0;
finals.forEach((f, i) => { if (norm(f) === norm(suggested[i] || '')) exact++; });
console.log(`\n${exact}/6 titles identical (position-wise); ${parsed.categories.length} categories, ${parsed.categories.reduce((s, c) => s + c.clues.length, 0)} clues`);
