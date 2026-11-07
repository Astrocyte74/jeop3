import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { createServer } from 'node:http';
import cancellation from '../server/cancellation.cjs';
import contract from '../server/verification.cjs';
const dir = await mkdtemp(join(tmpdir(), 'jeop-pipeline-test-'));
const modules = {};
for (const name of ['board', 'wholeBoard', 'service', 'verification']) {
  const out = join(dir, name + '.mjs');
  await build({entryPoints:[`src/lib/ai/${name}.ts`],bundle:true,format:'esm',outfile:out,logLevel:'silent',define:{'import.meta.env.VITE_AI_API_URL':'"http://test/api"'}});
  modules[name] = await import(pathToFileURL(out));
}
after(()=>rm(dir,{recursive:true,force:true}));
const opts = {referenceMaterial:'Source material',count:1,titles:['History'],difficulty:'normal'};
const good = async (_, items) => ({model:'reviewer',verdicts:items.map(i=>({id:i.id,verdict:'true',onTopic:true,reason:'Supported'}))});
const cats = [{title:'History',sourceMaterial:'A long independent source.',sourceUrl:'https://example.org/source',clues:[{value:1000,clue:'This person did something.',response:'Existing Person'}]}];
const candidate = {category:'A historical connection',clue:'This pioneer accomplished that other feat.',response:'Different Person',sourceIndex:0};
test('pre-aborted board makes no model calls',async()=>{
  let calls=0;const c=new AbortController();c.abort();
  await assert.rejects(modules.board.generateContentSpan(async()=>{calls++;},{...opts,signal:c.signal}),{name:'AbortError'});
  assert.equal(calls,0);
});
test('abort after extraction cannot trigger writing, fallback or verification',async()=>{
  const c=new AbortController();const calls=[];
  await assert.rejects(modules.board.generateContentSpan(async type=>{calls.push(type);c.abort();return {categories:[]};},{...opts,signal:c.signal}),{name:'AbortError'});
  assert.deepEqual(calls,['extract-board-answers']);
});
test('abort during verifier does not return checked categories',async()=>{
 const c=new AbortController();const events=[];await assert.rejects(modules.verification.verifyCategories(cats,'History',async(t,i)=>{c.abort();return good(t,i);},{signal:c.signal,onProgress:e=>events.push(e)}),{name:'AbortError'});
 assert.ok(events.every(e=>!e.verificationFailure));
});
test('aborted retrieval does not fall through to AI fact sheets',async()=>{
 const original=globalThis.fetch;const c=new AbortController();let calls=0;
 globalThis.fetch=async()=>{c.abort();throw c.signal.reason;};
 try {await assert.rejects(modules.board.generateTopicSpan(async()=>{calls++;},{topic:'History',count:1,titles:['History'],difficulty:'normal',signal:c.signal}),{name:'AbortError'});assert.equal(calls,0);}finally{globalThis.fetch=original;}
});
test('generateAI forwards the actual abort signal to fetch',async()=>{
 const original=globalThis.fetch;const c=new AbortController();let gotSignal;
 globalThis.fetch=async(url,options)=>{if(url.endsWith('/health'))return Response.json({});gotSignal=options.signal;return new Promise((_,reject)=>options.signal.addEventListener('abort',()=>reject(options.signal.reason),{once:true}));};
 try {await modules.service.checkAIServer();const p=modules.service.generateAI('game-title',{},'normal',undefined,null,{signal:c.signal});c.abort();await assert.rejects(p,{name:'AbortError'});assert.equal(gotSignal,c.signal);}finally{globalThis.fetch=original;}
});
test('retrieval emits failed-category completion, even when no source exists',async()=>{
 const original=globalThis.fetch;const events=[];globalThis.fetch=async()=>Response.json({results:[]});
 try {await assert.rejects(modules.board.generateTopicSpan(async()=>({sections:[]}),{topic:'History',count:1,titles:['History'],difficulty:'normal',onProgress:e=>events.push(e)}),/No usable source/);
 assert.ok(events.some(e=>e.stage==='retrieval'&&e.categoryTitle==='History'&&e.completed===1&&e.total===1&&e.status==='failed'));assert.ok(events.some(e=>e.stage==='facts'&&e.status==='failed'));}finally{globalThis.fetch=original;}
});
test('Final is accepted only with independent verification and source provenance',async()=>{
 const result=await modules.wholeBoard.generateFinalJeopardy(async()=>candidate,cats,'History',{verify:good});
 assert.equal(result.final.response,candidate.response);assert.equal(result.final.verification.model,'reviewer');assert.equal(result.final.sourceUrl,cats[0].sourceUrl);
});
test('Final fails closed for false, unsure, malformed, absent evidence and repeated answers',async()=>{
 for(const verdict of ['false','unsure']){const r=await modules.wholeBoard.generateFinalJeopardy(async()=>candidate,cats,'History',{verify:async(t,i)=>{const r=await good(t,i);r.verdicts[0].verdict=verdict;return r;}});assert.equal(r.final,undefined);assert.ok(r.warning);}
 for(const c of [{...candidate,sourceIndex:99},{...candidate,response:'Existing Person'},{...candidate,clue:'Existing Person knew this pioneer.'}]){const r=await modules.wholeBoard.generateFinalJeopardy(async()=>c,cats,'History',{verify:good});assert.equal(r.final,undefined);}
 let calls=0;const r=await modules.wholeBoard.generateFinalJeopardy(async()=>{calls++;return candidate;},cats.map(c=>({...c,sourceType:'ai_synthesized'})),'History');assert.equal(r.final,undefined);assert.equal(calls,0);
});
test('Final cancellation propagates instead of turning into an omission warning',async()=>{
 const c=new AbortController();await assert.rejects(modules.wholeBoard.generateFinalJeopardy(async()=>{c.abort();return candidate;},cats,'History',{signal:c.signal,verify:good}),{name:'AbortError'});
});
test('whole-board review catches inverse-pair answer leaks; invalid model IDs fail visibly',async()=>{
 const board=[{title:'Books',clues:[{value:200,clue:'The Northern States Mission published this collection.',response:'Songs of Zion'},{value:400,clue:'This mission published Songs of Zion.',response:'Northern States Mission'}]}];
 const result=await modules.wholeBoard.reviewWholeBoard(async()=>({issues:[{kind:'ambiguous',ids:['missing'],reason:'No'}]}),board);
 assert.equal(result.issues.length,2);assert.match(result.warning,/unavailable/);
 assert.notEqual(result.snapshot,modules.wholeBoard.boardSnapshot([{...board[0],clues:board[0].clues.slice(1)}]));
});
test('subscription and API access to the same model cannot count as independent verification',()=>{
 assert.throws(()=>contract.chooseVerifier('codex:gpt-6.1-terra','openai:gpt-6.1-terra',[{id:'openai:gpt-6.1-terra'}]),/different model/);
});
test('client disconnect aborts server work and normal response completion does not',async()=>{
 let resolveStart,resolveAbort;const start=new Promise(r=>resolveStart=r),aborted=new Promise(r=>resolveAbort=r);let normalSignal;
 const server=createServer((req,res)=>{const signal=cancellation.requestSignal(req,res);if(req.url==='/ok'){normalSignal=signal;res.end('ok');}else{signal.addEventListener('abort',resolveAbort,{once:true});resolveStart();}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const url=`http://127.0.0.1:${server.address().port}`;
 try{await (await fetch(url+'/ok')).text();assert.equal(normalSignal.aborted,false);const c=new AbortController();const pending=fetch(url+'/wait',{signal:c.signal});await start;c.abort();await assert.rejects(pending,{name:'AbortError'});await aborted;}finally{server.closeAllConnections();await new Promise(r=>server.close(r));}
});
