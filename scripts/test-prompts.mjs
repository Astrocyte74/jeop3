// Test-drive the REAL prompts (src/lib/ai/prompts.ts) across every configured LLM.
//
// It transpiles prompts.ts with esbuild (type-only imports are erased, so the
// module is self-contained), imports the actual `buildPrompt`, builds a prompt
// for each test case, sends it to the local AI server for each model, and scores
// the JSON that comes back. This keeps the harness in sync with production — no
// prompt-text duplication.
//
//   node scripts/test-prompts.mjs
//
import { build as esbuild } from 'esbuild';

const API = process.env.AI_API || 'http://localhost:7476/api';
const OUT = '/tmp/jeop3-prompts.mjs';

// 1) Transpile the real prompts module.
await esbuild({
  entryPoints: ['src/lib/ai/prompts.ts'],
  bundle: true,
  format: 'esm',
  outfile: OUT,
  logLevel: 'silent',
});
const { buildPrompt } = await import(OUT);

// 2) Discover models from the server.
const health = await fetch(`${API}/health`).then(r => r.json()).catch(() => null);
if (!health) { console.error('AI server not reachable at', API); process.exit(1); }
const override = process.env.MODELS; // comma-separated IDs to test directly (bypasses /api/health list)
const filter = process.env.MODEL;
const models = (override ? override.split(',').map(s => s.trim()).filter(Boolean) : health.models.map(m => m.id))
  .filter(m => !filter || m.includes(filter));
console.log(`Models (${models.length}): ${models.join(', ')}\n`);

const VALUES = [200, 400, 600, 800, 1000];
const norm = a => (a || '').toLowerCase().trim()
  .replace(/^(the|a|an)\s+/, '')
  .replace(/[^a-z0-9\s]/g, '')
  .replace(/\s+/g, ' ').trim();

function score(parsed) {
  const cats = parsed.categories || [];
  let valuesOk = 0, totalClues = 0, revealCount = 0, noTopic = 0;
  const answers = [];
  const clueLens = [], ansLens = [];
  cats.forEach(cat => {
    if (!cat.contentTopic) noTopic++;
    const vals = (cat.clues || []).map(c => Number(c.value)).sort((x, y) => x - y);
    if (vals.join() === VALUES.join()) valuesOk++;
    (cat.clues || []).forEach(c => {
      totalClues++;
      answers.push(c.response || '');
      clueLens.push((c.clue || '').length);
      ansLens.push((c.response || '').length);
      // reveal heuristic: a 4+ char token of the answer appears in the clue
      const toks = norm(c.response).split(' ').filter(t => t.length > 3);
      const clue = norm(c.clue);
      if (toks.some(t => clue.includes(t))) revealCount++;
    });
  });
  const counts = {};
  answers.forEach(a => { const n = norm(a); if (n) counts[n] = (counts[n] || 0) + 1; });
  const dupGroups = Object.values(counts).filter(c => c > 1).length;
  const dupClues = Object.values(counts).reduce((s, c) => s + (c > 1 ? c : 0), 0);
  const avg = arr => arr.length ? Math.round(arr.reduce((s, x) => s + x, 0) / arr.length) : 0;
  return {
    cats: cats.length, valuesOk, totalClues, noTopic,
    dupGroups, dupClues, revealCount,
    avgClue: avg(clueLens), avgAns: avg(ansLens),
  };
}

function cleanJson(raw) {
  let s = (raw || '').trim();
  s = s.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/g, '').trim();
  // some models prepend prose; grab the outermost {...}
  const first = s.indexOf('{'), last = s.lastIndexOf('}');
  if (first > 0 && last > first) s = s.slice(first, last + 1);
  return s;
}

async function runOne(model, c) {
  const prompt = buildPrompt(c.promptType, c.context, c.difficulty);
  const t0 = Date.now();
  let res;
  try {
    res = await fetch(`${API}/ai/generate`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ promptType: c.promptType, prompt, model }),
      signal: AbortSignal.timeout(75000),
    });
  } catch (e) { return { model, label: c.label, error: 'fetch/timeout: ' + e.message }; }
  const ms = Date.now() - t0;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { model, label: c.label, error: data.error || `HTTP ${res.status}`, ms };
  let parsed;
  try { parsed = JSON.parse(cleanJson(data.result)); }
  catch (e) { return { model, label: c.label, error: 'JSON: ' + e.message, ms }; }
  return { model, label: c.label, ms, ...score(parsed) };
}

// 3) Test cases — a general-knowledge topic and a content-based generation.
const renaissance = `The Italian Renaissance began in Florence in the 14th century and spread across Europe through the 17th century. The Medici family bankrolled many artists and became de facto rulers of Florence. Leonardo da Vinci painted the Mona Lisa and designed flying machines centuries before flight. Michelangelo sculpted David and painted the Sistine Chapel ceiling over four years. Galileo Galilei improved the telescope and confirmed heliocentrism, for which the Church put him on trial. Niccolo Machiavelli wrote The Prince, a founding text of modern political science. Sandro Botticelli painted The Birth of Venus. The printing press, invented by Johannes Gutenberg around 1440, let ideas spread rapidly. Brunelleschi engineered the dome of the Florence Cathedral without scaffolding. Venice grew rich on trade with the Byzantine and Ottoman empires. The Council of Trent launched the Counter-Reformation in response to Protestantism.`;

const caseFilter = process.env.CASE;
const cases = [
  { label: 'topic-wwii-norm', promptType: 'categories-generate', context: { theme: 'World War II', count: 6 }, difficulty: 'normal' },
  { label: 'content-renaissance-norm', promptType: 'categories-generate-from-content', context: { theme: 'Renaissance', count: 6, referenceMaterial: renaissance, sourceCharacters: renaissance.length }, difficulty: 'normal' },
].filter(c => !caseFilter || c.label.includes(caseFilter));

// 4) Run + report.
const REPEAT = parseInt(process.env.REPEAT || '1', 10);
const rows = [];
for (let rep = 0; rep < REPEAT; rep++) {
  if (REPEAT > 1) console.log(`--- run ${rep + 1}/${REPEAT} ---`);
for (const c of cases) {
  console.log(`# ${c.label} (parallel × ${models.length})`);
  const settled = await Promise.allSettled(models.map(m => runOne(m, c)));
  settled.forEach((r, i) => {
    const row = r.status === 'fulfilled' ? r.value : { model: models[i], label: c.label, error: String(r.reason?.message || r.reason) };
    rows.push(row);
    if (row.error) console.log(`  ${row.model.padEnd(42)} ✗ ${row.error}`);
    else console.log(`  ${row.model.padEnd(42)} ✓ cats=${row.cats} vals=${row.valuesOk}/6 dup=${row.dupGroups}g/${row.dupClues}c reveal≈${row.revealCount} noTopic=${row.noTopic} ${row.ms}ms`);
  });
  console.log('');
}
}

console.log('=== SUMMARY (label | model | cats | valuesOk | dupGroups | dupClues | reveal | avgClue | avgAns | ms) ===');
for (const r of rows) {
  console.log([r.label, r.model, r.cats ?? '-', r.valuesOk ?? '-', r.dupGroups ?? '-', r.dupClues ?? '-', r.revealCount ?? '-', r.avgClue ?? '-', r.avgAns ?? '-', r.error ? 'ERR' : r.ms].join(' | '));
}
