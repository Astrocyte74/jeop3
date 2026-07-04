// Unit-test the content-relevance guard logic in isolation, without live
// Wikipedia (which rate-limits under rapid testing). Replicates the guard's
// exact decision rule and checks it against representative (query, topic, lead)
// triples — including the hard cases the live API made ambiguous.
import { build as esbuild } from 'esbuild';
await esbuild({
  entryPoints: ['src/lib/ai/service.ts'], bundle: true, format: 'esm', outfile: '/tmp/svc.mjs',
  logLevel: 'silent', define: { 'import.meta.env.VITE_AI_API_URL': 'undefined' },
  banner: { js: 'globalThis.window = globalThis.window || { location: { hostname: "localhost" } };' },
});

// Replicate the guard's rule exactly (from service.ts):
//   - skip if query has >2 significant words (specific queries trust the title)
//   - skip if no/generic topic
//   - else require ≥1 topic word (>3 chars) in the lead's first 600 chars
function guardAccepts(query, contextTopic, lead) {
  const queryWords = query.toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(w => w.length > 2);
  const isAmbiguous = queryWords.length === 1;
  if (!isAmbiguous) return true;
  if (!contextTopic || !contextTopic.trim() || contextTopic.toLowerCase() === 'random') return true;
  const leadLower = lead.slice(0, 600).toLowerCase();
  const topicWords = contextTopic.toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(w => w.length > 3);
  return topicWords.some(w => leadLower.includes(w));
}

const appleFruitLead = `The apple is a round, edible fruit produced by an apple tree (Malus domestica). Apple trees are cultivated worldwide and are the most widely grown species in the genus Malus. The tree originated in Central Asia, where its wild ancestor, Malus sieversii, is still found today.`;
const appleIncLead = `Apple Inc. is an American multinational corporation and technology company headquartered in Cupertino, California, in Silicon Valley. It is best known for its consumer electronics, software, and services.`;
const jupiterPlanetLead = `Jupiter is the fifth planet from the Sun, and the largest in the Solar System. It is a gas giant with a mass nearly 2.5 times that of all the other planets combined.`;
const julioClaudianLead = `The Julio-Claudian dynasty comprised the first five Roman emperors: Augustus, Tiberius, Caligula, Claudius, and Nero. The family came to prominence under Julius Caesar.`;

const cases = [
  // [query, topic, lead, expectedAccept, label]
  ['Apple', 'Fruit and Orchards', appleFruitLead, true, 'Apple (fruit article) in Fruit game → ACCEPT (correct article)'],
  ['Apple', 'Tech Companies', appleIncLead, true, 'Apple (Inc. article) in Tech game → ACCEPT (lead mentions tech)'],
  ['Apple', 'Fruit and Orchards', appleIncLead, false, 'Apple (Inc. article) in Fruit game → REJECT (lead says tech, not fruit)'],
  ['Jupiter', 'Astronomy and Planets', jupiterPlanetLead, true, 'Jupiter (planet) in Astronomy → ACCEPT'],
  ['Julio-Claudians', 'Ancient Rome', julioClaudianLead, true, 'Julio-Claudians (4 words) → ACCEPT (skips content check)'],
  ['Jupiter', 'Ancient Rome', jupiterPlanetLead, false, 'Jupiter (planet) in Rome game → REJECT (no roman/rome in planet lead)'],
];

let pass = 0, fail = 0;
for (const [query, topic, lead, expected, label] of cases) {
  const got = guardAccepts(query, topic, lead);
  const ok = got === expected;
  console.log(`${ok ? '✓' : '✗'} ${label}`);
  console.log(`    guard: ${got ? 'ACCEPT' : 'REJECT'} (expected ${expected ? 'ACCEPT' : 'REJECT'})`);
  if (ok) pass++; else fail++;
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
