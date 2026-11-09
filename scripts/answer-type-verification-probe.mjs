// Explicit live regression probe; uses the configured independent reviewer.
// Not included in node --test. Run: node scripts/answer-type-verification-probe.mjs [api-base]
const api = process.argv[2] || 'http://localhost:7476/api';
const sources = [
  { id: 'moon', title: 'Supplied Apollo 11 facts', kind: 'user', retrievedAt: new Date().toISOString(), text: 'Apollo 11 was the first mission to land humans on the Moon. The landing site was the Sea of Tranquility.' },
  { id: 'houston', title: 'Supplied Mission Control facts', kind: 'user', retrievedAt: new Date().toISOString(), text: 'Houston is a city in Texas. NASA Mission Control is located in Houston.' },
];
const pairs = [
  ['bad-water', 'This body of water was the landing site for the first mission to land humans on the Moon.', 'Sea of Tranquility', 'moon'],
  ['good-site', 'This was the landing site for the first mission to land humans on the Moon.', 'Sea of Tranquility', 'moon'],
  ['bad-country', 'NASA Mission Control is located in this country.', 'Houston', 'houston'],
  ['good-city', 'NASA Mission Control is located in this city in Texas.', 'Houston', 'houston'],
];
const request = {
  topic: 'Space exploration', generatorModel: process.env.AI_PROBE_GENERATOR || 'or:google/gemini-2.5-flash', sources,
  items: pairs.map(([id, clue, response, sourceId]) => ({ id, clue, response, category: 'Space exploration', sourceIds: [sourceId], requireEvidence: true, reviewMode: 'provided-material' })),
};
const response = await fetch(`${api}/ai/verify`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(request), signal: AbortSignal.timeout(150000) });
const result = await response.json();
console.log(JSON.stringify(result, null, 2));
if (!response.ok || !Array.isArray(result.verdicts)) throw new Error('Verifier unavailable');
for (const [id] of pairs) {
  const rows = result.verdicts.filter(v => v.id === id);
  if (rows.length !== 1) throw new Error(`Missing/duplicated verdict for ${id}`);
  const accepted = rows[0].verdict === 'true' && rows[0].onTopic;
  if (accepted !== id.startsWith('good-')) throw new Error(`Answer-type regression: ${id}: ${rows[0].reason}`);
}
console.log('PASS: false answer types rejected; supported alternatives accepted.');
