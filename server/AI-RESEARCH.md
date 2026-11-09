# Evidence-based game generation

Topic generation now uses Wikipedia plus web search. It retrieves real article text before writing clues, then requires a separate model to verify the complete clue/answer pair against that text. Missing, invented or non-matching citations fail closed. Search snippets and model-written fact sheets never count as evidence.

## Configuration and limits

- Install backend dependencies with `npm ci --prefix server` (Node 20.18.1 or newer).
- `OPENROUTER_API_KEY` enables the OpenRouter Exa web-search plugin. This uses OpenRouter search and model credits even when generation or verification runs through Codex or Ollama.
- `AI_SEARCH_MODEL` defaults to `google/gemini-2.5-flash`. The search model must support OpenRouter's web plugin and return provider URL annotations. Generated prose URLs are ignored.
- Existing `AI_VERIFIER_MODEL` selection remains independent of the generator. An unavailable, malformed or timed-out verifier stops generation with `VERIFICATION_UNAVAILABLE`.
- General research tries a relevant Wikipedia overview and web results, capped at three fetched documents per category, 8,000 characters each. It can continue with a usable source when another provider is unavailable, emitting warnings.
- Fetched URLs must be public HTTPS. DNS addresses are validated and pinned; every redirect is checked. HTML/plain text only, 3 MB response cap, three redirects, 20-second fetch timeout, 15-minute in-memory cache. PDFs, gated pages and pages requiring JavaScript are not supported in this version.
- Pasted material stays in provided-material mode, with no outside search. Its first 72,000 characters form three evidence chunks; longer input emits a truncation warning. URL material supplied to the content pipeline uses the same evidence rules.
- Single-column research uses the actual topic, never the playful title. Multi-column planning produces literal topic angles while retaining the user's titles. A lexical Wikipedia filter rejects obvious wrong senses; the verifier still checks each clue's topic relevance.
- One retry per deficient category: retain accepted clues and their values, retain original source documents, retrieve additional sources focused on rejection feedback, and propose corrected/new candidates. A corrected answer may be reused; unchanged rejected pairs and accepted answers may not. At most six source documents and seven candidates enter a repair check. Replacements pass the same independent gate. No automatic loop on verifier outages.
- A board still short after that retry fails without returning a partial board. Optional Final Jeopardy has one separate generation/check attempt and is omitted with a warning if it cannot pass.

## Gospel source policy

`generateTopicSpan` accepts `sourcePolicy: 'auto' | 'general' | 'lds-official'`; auto is the default. The server recognizes common LDS/gospel/scripture topics (including Word of Wisdom, Book of Mormon, Bible, Jesus Christ, baptism and repentance) and uses only `churchofjesuschrist.org` and its subdomains. Search, fetch redirects and verification source references all enforce that restriction. There is no Wikipedia or unofficial-source fallback in this mode.

Automatic detection is a keyword heuristic, not an exhaustive topic classifier. Explicit other traditions and gospel music use general research. Callers can select `lds-official` for an unrecognized gospel topic or explicitly select `general`. This version adds the backend option; UI controls remain Claude's work.

Official-source mode evaluates what Church sources teach or scripture narrates. Prompts require attribution for doctrinal claims; historical dates and other factual details must still be supported. Source fidelity does not assert empirical proof of religious beliefs. User-pasted material is intentionally kept as supplied material rather than silently replaced by official pages.

## Claude / UI handoff

No component files changed. Existing prompt-type names, stages and `VerificationError.details` remain compatible. New types are exported from `src/lib/ai/index.ts`.

Each accepted clue (including Final and accepted alternatives) stores evidence inside its existing verification metadata:

```ts
clue.verification = {
  model: 'reviewer-model', checkedAt: 'ISO timestamp', reason: 'Reviewer rationale',
  clue: 'Exact checked wording', response: 'Exact checked answer', category: 'Exact category',
  evidence: [{
    sourceId: 'stable-document-id', title: 'Article title',
    url: 'https://example.org/article', // absent for pasted material
    quote: 'Exact supporting passage from the retrieved text',
    retrievedAt: 'ISO timestamp', kind: 'wikipedia' // or 'web' | 'user'
  }]
}
```

Evidence uses trusted document metadata, not model-supplied titles/URLs. One to three exact passages (20–2,000 characters each, whitespace normalized) must substantiate an accepted pair. Editing clue, answer or category invalidates `currentVerification`, including its evidence. The existing verification metadata serialization retains these fields without storage/UI changes.

Research progress adds:

```ts
{
  stage: 'retrieval', categoryIndex: 0, categoryTitle: 'To Infinity And Beyond',
  completed: 1, total: 1, status: 'complete',
  sourcePolicy: 'general', // or 'lds-official'
  sources: [{ id, title, url, kind, retrievedAt }], // no full text in progress
  warnings: ['An optional page was unavailable']
}
```

Retries add `attempt: 1` and `missing: number` to retrieval/clue events. Replacement verification events carry `attempt: 1` and the original category index/title. Research refresh events carry source metadata and warnings.

**Source labels:** legacy `sourceType: 'retrieved'` now covers Wikipedia, other web pages and official Church pages. Do not label every retrieved category “Wikipedia”. Use `sources[].kind`, `sources[].title` and `sourcePolicy`. Persisted per-clue source links are in `verification.evidence` even if category source documents are not retained by the UI's storage projection.

On failure, the thrown error's `details` and the failed progress event's `verificationFailure` have the same shape:

```ts
{
  code: 'VERIFICATION_INCOMPLETE', // or VERIFICATION_UNAVAILABLE
  retryable: true,
  message: 'Independent fact check could not complete the board: …',
  model: 'reviewer-model',
  categories: [{ title: 'Category', accepted: 4, required: 5 }],
  clues: [{
    id: '0:retry:0', categoryIndex: 0, clueIndex: 0, category: 'Category',
    clue: 'Rejected wording', response: 'Rejected answer',
    verdict: 'unsure', onTopic: true, reason: 'The sources lack this date.',
    attempt: 1 // absent on initial candidates; ids there are categoryIndex:clueIndex
  }]
}
```

An outage uses `VERIFICATION_UNAVAILABLE`, `clues: []`, and a retry message. It is never converted into a factual rejection or a request for richer sources. An incomplete board includes the initial and replacement rejection reasons. Accepted repairs do not erase the original failure audit.

## HTTP contracts and diagnostics

`POST /api/research-sources` accepts `{ topic, query, policy?, excludeUrls? }` and returns `{ sources: SourceDocument[], policy, warnings }`. No readable documents produces an empty array with warnings; the topic pipeline stops before generating clues. Request-level research errors return HTTP 502 `{ code: 'RESEARCH_UNAVAILABLE', retryable: true, error }`.

`POST /api/ai/verify` now accepts a deduplicated top-level `sources` array. Strict items contain `sourceIds`, `requireEvidence: true`, `reviewMode` and `sourcePolicy`. A successful row has `{ id, verdict, onTopic, reason, evidence: [{ sourceId, quote }] }`. Unsupported/false/off-topic rows may have empty evidence. A purportedly accepted row missing valid evidence is a malformed verifier response, reported as an outage.

`AI_VERIFICATION_LOG=/private/path/log.jsonl` enables raw requests, provider responses and verdicts; it contains supplied source text, so leave it off normally and do not commit logs. Live capture:

```sh
AI_DIAGNOSTIC_CASES=space,apollo,capitals,paste,gospel,multi \
  node scripts/diagnose-ai-verification.mjs eval-results/new-run http://localhost:7476/api
```

Offline checks: `npm run test:ai`, `npx tsc --noEmit`, `node --test`, `npm run build`.
