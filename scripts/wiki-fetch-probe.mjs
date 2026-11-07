// Verify the server's Wikipedia retrieval endpoints.
//   POST /api/search-wikipedia  { query } → { results: [{title, snippet, url}] }
//   POST /api/fetch-article     { url }   → { text, truncated }
import fs from 'node:fs';

const API = 'http://localhost:7476/api';

async function post(path, body) {
  const r = await fetch(`${API}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const d = await r.json();
  return { ok: r.ok, status: r.status, data: d };
}

let pass = 0, fail = 0;
const ok = (cond, label) => { console.log(`${cond ? '✓' : '✗'} ${label}`); cond ? pass++ : fail++; };

console.log('=== POST /api/search-wikipedia ===');
const s1 = await post('/search-wikipedia', { query: 'Julio-Claudian' });
ok(s1.ok, 'search responds 200');
ok(Array.isArray(s1.data.results) && s1.data.results.length > 0, 'returns ≥1 result');
const top = s1.data.results[0];
ok(top.title === 'Julio-Claudian dynasty', `top title = "${top.title}" (expected "Julio-Claudian dynasty")`);
ok(top.url.startsWith('https://en.wikipedia.org/wiki/'), `top url is a wikipedia article: ${top.url}`);
console.log(`   top: ${top.title}\n        ${top.url}`);

console.log('\n=== POST /api/fetch-article (wikipedia URL) ===');
const f1 = await post('/fetch-article', { url: top.url });
ok(f1.ok, 'fetch responds 200');
ok(typeof f1.data.text === 'string' && f1.data.text.length > 500, `text length ${f1.data.text?.length} > 500`);
ok(/Augustus|Tiberius|Nero/i.test(f1.data.text), 'text mentions a Julio-Claudian emperor');
ok(f1.data.text.length <= 8000, `text capped at 8000 (got ${f1.data.text.length}, truncated=${f1.data.truncated})`);
console.log(`   snippet: ${f1.data.text.slice(0, 120).replace(/\n/g, ' ')}...`);

console.log('\n=== POST /api/fetch-article (non-wikipedia URL — should reject) ===');
const f2 = await post('/fetch-article', { url: 'https://example.com/article' });
ok(!f2.ok && f2.status === 400, 'rejects non-wikipedia URL with 400');
ok(/Unsupported URL|wikipedia/i.test(f2.data.error || f2.data.message || ''), `error message is clear: "${f2.data.error}"`);

console.log('\n=== POST /api/fetch-article (title with spaces, via /wiki/ path) ===');
const f3 = await post('/fetch-article', { url: 'https://en.wikipedia.org/wiki/Roman_Empire' });
ok(f3.ok, 'accepts /wiki/Roman_Empire');
ok(f3.data.text.length > 500, `text length ${f3.data.text?.length} > 500`);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
