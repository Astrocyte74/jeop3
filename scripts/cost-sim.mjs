// Simulate a full game creation and report real OpenRouter cost per step.
// Drives the actual pipeline (buildPrompt) through the local server and sums
// OpenRouter's own usage.cost across calls.
import { build as esbuild } from 'esbuild';
await esbuild({ entryPoints: ['src/lib/ai/prompts.ts'], bundle: true, format: 'esm', outfile: '/tmp/p.mjs', logLevel: 'silent' });
await esbuild({ entryPoints: ['src/lib/ai/answers.ts'], bundle: true, format: 'esm', outfile: '/tmp/a.mjs', logLevel: 'silent' });
const { buildPrompt } = await import('/tmp/p.mjs');
const { filterAnswerBoard } = await import('/tmp/a.mjs');

const API = 'http://localhost:7476/api';
const MODEL = 'or:' + (process.env.MODEL || 'google/gemini-2.5-flash');

// ~430-word source — a realistic moderate paste (cost scales with source length,
// since it's sent in extract + judge).
const source = `The Italian Renaissance was a period of cultural rebirth that began in Florence in the 14th century and spread across Europe into the 17th century. The wealthy Medici family bankrolled countless artists and effectively ruled Florence as its patrons. Leonardo da Vinci painted the Mona Lisa and the Last Supper, and filled notebooks with designs for flying machines, tanks, and anatomical studies centuries ahead of their time. Michelangelo sculpted the 17-foot marble David and spent four years on his back painting the Sistine Chapel ceiling. Raphael became famous for The School of Athens. Sandro Botticelli painted The Birth of Venus. In science, Galileo Galilei improved the telescope, discovered Jupiter's four largest moons, and was tried by the Roman Inquisition for supporting heliocentrism. The printing press, invented by Johannes Gutenberg around 1440 in Mainz, let ideas spread rapidly and is often credited with enabling the Renaissance itself. The architect Brunelleschi engineered the enormous dome of the Florence Cathedral without scaffolding. Niccolo Machiavelli wrote The Prince, a foundational text of modern political science. Venice grew rich on trade with the Byzantine and Ottoman empires. The Council of Trent, beginning in 1545, launched the Catholic Counter-Reformation in response to Protestantism. The era ended as the Baroque period took hold, but its humanism, art, and rediscovery of classical antiquity reshaped Western civilization.`;
const titles = ['FLORENTINE POWER', 'MASTERS OF ART', 'SCIENCE & DISCOVERY', 'IDEAS IN PRINT', 'ARCHITECTURE & STATECRAFT', 'EMPIRE & THE CHURCH'];

function clean(s) { return s.replace(/^```json\s*/i, '').replace(/["«»]/g, '"').replace(/['']/g, "'").replace(/…/g, '...').replace(/```$/g, '').trim(); }

async function step(label, promptType, context) {
  const prompt = buildPrompt(promptType, context, 'normal');
  const t0 = Date.now();
  const r = await fetch(`${API}/ai/generate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ promptType, prompt, model: MODEL }) });
  const d = await r.json();
  const ms = Date.now() - t0;
  if (d.error) { console.log(`  ✗ ${label}: ${d.error}`); return { cost: 0, inT: 0, outT: 0, result: null }; }
  const u = d.usage || {};
  const cost = typeof u.cost === 'number' ? u.cost : 0;
  console.log(`  ${label.padEnd(26)} in=${String(u.prompt_tokens || 0).padStart(6)}  out=${String(u.completion_tokens || 0).padStart(6)}  $${cost.toFixed(5)}  ${ms}ms`);
  return { cost, inT: u.prompt_tokens || 0, outT: u.completion_tokens || 0, result: JSON.parse(clean(d.result)) };
}

console.log(`\n# Full game-creation cost  (model: ${MODEL})\n`);
let total = 0, inT = 0, outT = 0;
const add = r => { total += r.cost; inT += r.inT; outT += r.outT; };

// 1. extract answer candidates (overgenerate)
const e = await step('extract-board-answers', 'extract-board-answers', { referenceMaterial: source, count: 6, topicList: titles, theme: 'Renaissance' });
add(e);
const { board } = filterAnswerBoard((e.result?.categories || []).map(c => ({ title: c.title, answers: (c.answers || []).filter(a => a?.answer && a?.fact) })), 5);

// 2. clues for fixed answers
const c = await step('clues-from-answers', 'clues-from-answers', { answerBoard: board, theme: 'Renaissance' });
add(c);
const clueCats = c.result?.categories || [];

// 3. judge
const j = await step('judge-clues', 'judge-clues', { answerBoard: clueCats, referenceMaterial: source, theme: 'Renaissance' });
add(j);

// 4. game title (MainMenu calls this with the generated categories as sample content)
const sampleCats = clueCats.map(cat => `${cat.title}\n` + (cat.clues || []).slice(0, 2).map(cl => `  $${cl.value || 200} ${cl.clue} (${cl.response})`).join('\n')).join('\n\n');
const t = await step('game-title', 'game-title', { hasContent: true, sampleContent: `Game Categories:\n\n${sampleCats}` });
add(t);

// 5. team names
const tn = await step('team-name-random', 'team-name-random', { count: 4, gameTopic: 'Renaissance' });
add(tn);

console.log(`\n  ${'TOTAL'.padEnd(26)} in=${String(inT).padStart(6)}  out=${String(outT).padStart(6)}  $${total.toFixed(5)}`);
console.log(`\n  ≈ $${(total * 100).toFixed(3)}¢ per game  (${(inT + outT).toLocaleString()} tokens)`);
console.log(`  (thin sources that trigger the single-pass fallback add ~1 more call — see note)`);
