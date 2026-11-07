# Jeop3 AI Model Benchmark Scripts

Scripts for testing and comparing AI models on Jeopardy question generation.

## Files

- **`benchmark_models.py`** - Full benchmark suite testing multiple models on multiple test cases
- **`quick_test.py`** - Quick single test to verify API key and test individual models
- **`README.md`** - This file

## Setup

1. Ensure `.env` file exists in the project root with:
   ```
   OPENROUTER_API_KEY=sk-or-v1-...
   OPENAI_BASE_URL=https://openrouter.ai/api/v1
   ```

2. Install dependencies:
   ```bash
   pip install openai
   ```

## Usage

### Quick Test
Test one model quickly to verify setup:
```bash
python scripts/quick_test.py
```

### Full Benchmark
Test all models on all test cases:
```bash
python scripts/benchmark_models.py
```

Results are saved to `benchmark_results_YYYYMMDD_HHMMSS.json` in the project root.

## Models Tested

The benchmark tests these models (configurable in `benchmark_models.py`):

- Gemini 2.5 Flash Lite (free tier)
- Gemini 2.5 Flash (free tier)
- GLM-4.7 Flash
- GPT-4o Mini
- Claude 3.5 Haiku

## Evaluation Criteria

Each model response is evaluated on:

- **JSON Validity** - Response is parseable JSON
- **All Values Present** - All 5 clue values (200, 400, 600, 800, 1000) are generated
- **Unique Answers** - No duplicate responses across clues
- **Response Time** - How fast the model responds
- **Quality Score** - Composite score 0-10 based on above criteria

## Test Cases

1. **Simple Category (No Source)** - "U.S. Presidents" - tests general knowledge
2. **Source Material Category** - "Solar System Facts" - tests using provided reference text
3. **Pop Culture Category** - "Marvel Movies" - tests contemporary knowledge

## Customization

To test additional models:

1. Add model config to `MODELS` list in `benchmark_models.py`:
```python
{
    "id": "model-id",
    "name": "Display Name",
    "model": "or:provider/model-name"
}
```

2. To test with free tier models on OpenRouter, use:
   - `or:google/gemini-2.0-flash-exp:free`
   - `or:google/gemini-2.0-flash-thinking-exp:free`
   - `or:meta-llama/llama-3.3-8b-instruct:free`

## Security

- Scripts read API key from `.env` file (never hardcode keys)
- `.env` files are in `.gitignore`
- Benchmark results truncate response text for safety

## Independent factual verification and paired eval

The topic/content pipelines now run `/api/ai/verify` after selection and fallback,
including runner-up clues. Only `true` AND on-topic pairs survive. A checked
runner-up may replace a rejected clue; if any column still has fewer than five
clues, generation reports an error instead of silently shipping a partial board.
Reviewer outages, malformed JSON, missing IDs and duplicate IDs also fail closed.
The topic wizard no longer escapes into an unchecked single-pass board.

Set `AI_VERIFIER_MODEL` in `server/.env` to an enabled model different from the
generator. If omitted, the server chooses the first different enabled cloud model.
The UI labels results **AI checked**, not proven true: a second model can also be
wrong. Synthesized fact sheets are excluded from the reviewer evidence. Exact
clue/answer/category snapshots prevent edited text from retaining a stale badge.
Manual edits, legacy single-clue tools and scratch/random boards can be unverified.

Run deterministic regression tests (no API calls):

```bash
npm run test:ai
```

Run the live paired eval against a running local server:

```bash
npm run eval:ai -- --config scripts/eval-ai.example.json --out eval-results/comparison.json
```

The example compares Luna low/high and Terra low on three topics. Edit the model
IDs to match `/api/health`; additional OpenRouter models can be added to `OR_MODELS`
and the config. Generation reasoning overrides apply to direct OpenAI calls only;
the app keeps its low default. This command makes paid provider calls.

Each run generates one baseline candidate board using production retrieval and
prompts, then filters that exact board through the verifier. This isolates the
filter's effect; it does not measure production runner-up replacement. Reports
include full clues and sources, retained/rejected pairs, completeness, duplicate
answers, model IDs, per-call latency and provider usage (including cost if supplied).
Errors are recorded, reports are saved after each run, and any failed run exits
nonzero. A rejection rate is **not** an accuracy score.

Optionally set `evaluatorModel` to a third enabled model, different from both the
generator and verifier. It reviews the baseline without seeing the verifier's
verdicts; the report separates its scores for baseline and retained clues. These
remain model assessments. The blank `humanReview` rows are for checking claims
against real sources and recording disagreements before choosing a teaching model.
Reports stay under ignored `eval-results/` by default.

Use `--replay eval-results/comparison.json` with matching model/topic/title/trial
entries to review the exact same saved baseline with another verifier, without
paying to regenerate it. For example, switch `verifierModel` in your config and
write to a new `--out` file. Sources and clue wording remain identical.

Set `"reviewMode": "manual"` in an eval config to save the generated candidate
board and blank review rows without calling an automated verifier. This is useful
for source-based review of every clue. Production verification is unaffected.

For a controlled comparison using the ChatGPT subscription for Sol 6.1, Terra
6.1 and Astra 6, plus the OpenRouter API for Haiku 5.5:

```sh
node scripts/compare-clue-models.mjs scripts/fixtures/lighthouse-grounded-comparison.json eval-results/new-comparison
```

This requires a current Codex CLI logged in using ChatGPT, and the existing
OpenRouter key in `server/.env`. The CLI subprocesses have API-key overrides
removed and do not fall back to the OpenAI API. All four get the same task text,
source pack, JSON schema and medium reasoning setting. CLI system instructions
and provider reasoning budgets still differ. Runs use an isolated directory,
read-only sandbox and no requested tools; any tool activity is flagged.

The fixture is an editorial source pack with prior factual corrections, so this
tests grounded writing, not memory, retrieval or the production multistage
pipeline. Outputs are randomly labeled A–D. Score the candidate JSON files before
opening `identity-sealed.json`, provider responses, metrics or event logs, which
can reveal model names. This is label blinding, not cryptographic secrecy. Keep
failures and retries in the results instead of replacing them. The first pilot
hit Haiku's 12,000-token cap entirely in reasoning; the default is now 32,768,
overridable with `OR_EVAL_MAX_TOKENS`. CLI runs have no matching explicit cap.

To compare Luna, Terra 6.1 and Sol 6.1 through the application's topic pipeline:

```sh
node scripts/compare-topic-pipeline.mjs eval-results/new-topic-comparison 'Ancient Rome'
```

This calls the real category-drafting prompt and `generateTopicSpan`, including
Wikipedia retrieval, fact-sheet fallback, answer extraction, clue writing,
same-model quality scoring, selection and fallback filling. It replaces model
API calls with ChatGPT-authenticated CLI calls at low reasoning, and captures the
raw boards before final independent verification. It does not create saved games
or run the production verifier/runner-up replacement. Source hashes, every
prompt/response, retrieval responses, token usage and stage timings are retained.
Judge the labeled boards before revealing `identity-sealed.json`.

Models run sequentially. Retrieval requests are paced 1.5 seconds apart because
concurrent boards caused upstream Wikipedia 429 errors in the first diagnostic.
Pacing is a benchmark adjustment, not a production fix, and its time is included
in the total. Override with `EVAL_RETRIEVAL_INTERVAL_MS`; override reasoning with
`EVAL_REASONING_EFFORT` and retrieval server with `EVAL_RETRIEVAL_API`. A category
can still fall back to synthesis; inspect the recorded source mix before drawing
model-quality conclusions. The separate CLI system prompt and per-step startup
also mean these wall times are not predictions of direct API latency.

For the controlled LDS comparison, supply a cached source fixture:

```sh
EVAL_SOURCE_FIXTURE=scripts/fixtures/lds-restoration.json node scripts/compare-topic-pipeline.mjs eval-results/new-lds-restoration
```

The other fixtures are `lds-leaders.json` and `lds-hymns.json`. Each contains six
fixed categories, editorial paraphrases of checked official Church sources, and
source URLs. The fixture is copied into the run folder and hashed. In this mode,
category drafting, live retrieval and memory-based fact sheets are excluded;
network calls from the application pipeline are forbidden. The harness calls
`generateContentSpan`, the exact extraction/writing/self-scoring/selection/fallback
path used by topic mode after retrieval. `retrievedCategories` in this mode means
**cached source-pack categories**, not live Wikipedia retrieval. The manifest and
`sourceMode` distinguish these runs from live topic tests.

The historical biography fixture avoids claims about current officeholders;
hymn facts are tied to historical editions through 1989. Judge faith claims for
fidelity to the cited LDS sources. Keep source fidelity, factual concerns,
individual clue usability and cross-clue giveaways separate. Do not infer a
model’s general factual accuracy from its score on these curated packs.

To run a single OpenRouter model on the same cached-source pipeline:

```sh
node scripts/compare-openrouter-cached.mjs scripts/fixtures/lds-hymns.json eval-results/new-mercury-hymns inception/mercury-3
```

This uses the existing `OPENROUTER_API_KEY` from the environment or `server/.env`
and makes paid API calls. It checks the live model catalog, requests low reasoning
with required parameter support, and retains exact prompts, provider responses,
usage, cost, stage timings and any errors. There is no client retry, forced JSON
schema or model substitution; normal application fallback is retained and counted.
The 16,384-token completion cap leaves room for reasoning. Use
`EVAL_REASONING_EFFORT` to override low. Live retrieval and the final independent
verifier are excluded, as in the cached-source subscription comparison.

Compare individual clue quality separately from cross-clue giveaways. API timing
includes routing and provider latency but not the subscription CLI's startup and
system context, so cross-transport timings are observations of these workflows,
not a controlled measure of model inference speed alone.

## Local app providers and generation lifecycle

The local server can offer Terra 6.1 and Luna through a signed-in Codex CLI,
alongside separately selected OpenAI API routes and Mercury 3 through OpenRouter.
Copy the opt-in `CODEX_*` settings from `server/.env.example` and run `codex login`
with ChatGPT locally. `AI_DEFAULT_MODEL=codex:gpt-6.1-terra` selects Terra for a
browser without an existing preference. Restart the AI server after configuration
changes. Subscription calls use plan limits, not the configured API keys, and
never fall back to a paid API. The adapter binds the server to loopback and rejects
nonlocal subscription origins. It is for this local app, not a hosted public API.

Generation now carries an AbortSignal and typed progress events through retrieval,
model calls and verification. Cancel closes active provider requests, kills a local
CLI process group, and prevents later stages/retries from starting. The progress
bar remains a time estimate; the displayed stage and completed counts are real.

Final Jeopardy is enabled by default and can be switched off. One source-grounded
candidate must pass a different model's factual gate; an unavailable, incomplete
or rejected check omits the Final with a warning. Source and verification metadata
survive preview, saving and editor changes (edited wording invalidates the badge).

An advisory whole-board pass flags answer giveaways, repeated facts, ambiguous
clues and difficulty ordering. Literal giveaways are checked deterministically
as well. This pass does not rewrite clues or replace factual verification. Edits
make its stored snapshot stale. A model check is still not proof of accuracy.
The verifier cannot be the generator under another transport: subscription Terra
and API Terra count as the same model. With no `AI_VERIFIER_MODEL`, Luna
subscription uses Terra; other models use the first different enabled model.

Run `npm run test:ai`, `npm run test:state`,
`npx tsc --noEmit -p tsconfig.app.json` and `npm run build` before handoff.

## Verification incident capture and UI diagnostics

Run the four single-column production cases (Space exploration with the exact
`To Infinity And Beyond` title, Apollo 11, World capitals, and pasted Apollo 11
text) against a running proxy:

```sh
node scripts/diagnose-ai-verification.mjs eval-results/new-verification-run http://localhost:7476/api
```

This uses Gemini 2.5 Flash via OpenRouter and the server-selected independent
verifier. It calls production prompt builders and board/Final pipelines, retains
raw HTTP requests/responses, source excerpts, progress events and errors, and
never saves a game. Each case is captured even if another fails. To repeat one
case, set `AI_DIAGNOSTIC_CASES=space`, `apollo`, `capitals`, or `paste`.
These are live model calls. Output directories must be new; keep captures local.

For the exact raw verifier model output (including malformed responses), set
`AI_VERIFICATION_LOG` to an absolute JSONL file path when starting the server.
The parent directory must exist. Each record contains an audit ID, request,
server-built prompt, selected model, raw response, and parsed verdicts or error.
Logging is opt-in because source excerpts can be private; logs are not game data.
Normal console logs include accepted/total counts only after schema validation.

On a failed board, `generateTopicSpan` / `generateContentSpan` throw
`VerificationError`. Read `error.details`, or consume the same object from the
last `onProgress` event:

```ts
{
  stage: 'verifying',
  status: 'failed',
  message: 'Independent fact check could not complete the board: ...',
  verificationFailure: {
    code: 'VERIFICATION_INCOMPLETE',
    retryable: true,
    message: 'Independent fact check could not complete the board: ...',
    model: 'codex:gpt-6.1-terra',
    categories: [{ title: 'To Infinity And Beyond', accepted: 0, required: 5 }],
    clues: [{
      id: '0:0', categoryIndex: 0, clueIndex: 0,
      category: 'To Infinity And Beyond',
      clue: 'This author wrote Beyond Infinity.', response: 'Eugenia Cheng',
      verdict: 'true', onTopic: false,
      reason: 'The pair concerns mathematics rather than space exploration.'
    }]
  }
}
```

`clues` contains rejected candidates, including runner-ups; IDs and indices are
local to the current span's candidate batch, not final dollar-value positions.
Category counts reflect selection after verification and deduplication. An empty
candidate batch is an incomplete board with empty reasons, not a verifier outage.
`verifyCategories` also returns `rejected` alongside its existing categories/audit.

Unavailable service, HTTP errors, timeouts, empty output and malformed/partial
verdict schemas instead produce `VERIFICATION_UNAVAILABLE`, `retryable: true`,
an explicit unavailable message and `clues: []`. There are no invented negative
verdicts. `/api/ai/verify` returns HTTP 502 (429 for rate limits) with
`{ error, message, code: 'VERIFICATION_UNAVAILABLE', retryable: true }`;
successful responses retain `{ model, verdicts, usage, durationMs }`.
User cancellation still propagates as cancellation without a failure event.
No unchecked fallback runs after the verification gate.

Manual live benchmark scripts use `*-probe.mjs` names (previously `*-test.mjs`;
`test-prompts.mjs` is now `prompts-probe.mjs`). Run these directly and individually.
They require services and some share temporary filenames, so they must not be
picked up concurrently by automatic test discovery. `node --test` runs the offline
regression suite; `npm run test:ai` runs the focused AI contracts.
