/**
 * Jeop3 AI Server - OpenRouter Proxy
 *
 * Proxies AI requests to OpenRouter, keeping API keys server-side.
 * Main game board works standalone - only Editor needs this server.
 */

const { callCodex, subscriptionAvailable, assertLocalSubscription } = require('./codex.cjs');
const { requestSignal, timedSignal, retryDelay } = require('./cancellation.cjs');
const express = require('express');
const cors = require('cors');
const { chooseVerifier, verificationPrompt, parseVerdicts, verificationUnavailable, logVerification } = require('./verification.cjs');
require('dotenv').config({ path: require('node:path').join(__dirname, '.env') });
const codexAvailable = subscriptionAvailable();

const app = express();
const PORT = process.env.PORT || 7476;

// CORS configuration
const corsOrigin = process.env.AI_CORS_ORIGIN || '*';
app.use(cors({ origin: corsOrigin }));
app.use(express.json({ limit: '1mb' }));

// Rate limiting (in-memory)
const rateLimiter = new Map();
const RPM_LIMIT = parseInt(process.env.AI_RPM || '60', 10);

function checkRateLimit(ip) {
  const now = Date.now();
  const requests = rateLimiter.get(ip) || [];
  // Remove requests older than 1 minute
  const recent = requests.filter(t => now - t < 60000);

  if (recent.length >= RPM_LIMIT) {
    return false;
  }

  recent.push(now);
  rateLimiter.set(ip, recent);
  return true;
}

// Get available models from environment variables
function getAvailableModels() {
  const openrouterModels = (process.env.OR_MODELS || '').split(',').map(m => m.trim()).filter(m => m);
  const ollamaModels = (process.env.OLLAMA_MODELS || '').split(',').map(m => m.trim()).filter(m => m);
  // Direct OpenAI API (e.g. gpt-6-luna). Only listed when its key is configured.
  const openaiModels = process.env.OPENAI_PLATFORM_API_KEY
    ? (process.env.OPENAI_MODELS || '').split(',').map(m => m.trim()).filter(m => m)
    : [];

  return {
    openrouter: openrouterModels,
    ollama: ollamaModels,
    codex: codexAvailable ? (process.env.CODEX_MODELS || 'gpt-6.1-terra,gpt-6-luna').split(',').map(m => m.trim()).filter(Boolean) : [],
    openai: openaiModels
  };
}

// Get all available models (flattened with provider prefix)
function getAllModels() {
  const models = getAvailableModels();
  const all = [];

  models.codex.forEach(m => all.push({ id: `codex:${m}`, name: `${m} · Subscription`, provider: 'codex' }));
  models.openrouter.forEach(m => all.push({ id: `or:${m}`, name: `${m} · OpenRouter API`, provider: 'openrouter' }));
  models.ollama.forEach(m => all.push({ id: `ollama:${m}`, name: m, provider: 'ollama' }));
  models.openai.forEach(m => all.push({ id: `openai:${m}`, name: `${m} · OpenAI API`, provider: 'openai' }));

  return all;
}

// Select model based on options (provider, model, etc.)
function selectModel(options = {}) {
  const models = getAvailableModels();
  const id = options.model || process.env.AI_DEFAULT_MODEL || getAllModels()[0]?.id;
  const [prefix, ...rest] = (id || '').split(':');
  const provider = prefix === 'or' ? 'openrouter' : prefix;
  const name = rest.join(':');
  if (!name || !models[provider]?.includes(name)) throw new Error(`Model not enabled: ${id || '(none)'}`);
  return { provider, model: name };
}

async function callProvider(selected, prompt, type, effort, signal, req) {
  signal?.throwIfAborted();
  if (selected.provider === 'codex') {
    assertLocalSubscription(req);
    return callCodex(selected.model, prompt, type, effort || 'low', signal);
  }
  if (selected.provider === 'openai') return callOpenAI(selected.model, prompt, type, effort, signal);
  if (selected.provider === 'ollama') return callOllama(selected.model, prompt, type, undefined, signal);
  return callOpenRouter(selected.model, prompt, type, effort, signal);
}

// Whitelist of allowed prompt types
const ALLOWED_PROMPT_TYPES = new Set([
  'final-jeopardy',
  'review-board',
  'game-title',
  'categories-generate',
  'categories-generate-from-content',
  'extract-board-answers',
  'clues-from-answers',
  'judge-clues',
  'topic-fact-sheet',
  'category-rename',
  'category-names-draft',
  'category-title-generate',
  'category-generate-clues',
  'category-replace-all',
  'questions-generate-five',
  'question-generate-single',
  'editor-generate-clue',
  'editor-rewrite-clue',
  'editor-generate-answer',
  'editor-validate',
  'team-name-random',
  'team-name-enhance',
]);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    models: getAllModels(),
    defaultModel: process.env.AI_DEFAULT_MODEL || getAllModels()[0]?.id,
    providers: {
      openrouter: getAvailableModels().openrouter,
      ollama: getAvailableModels().ollama,
      openai: getAvailableModels().openai,
      codex: getAvailableModels().codex
    },
    rpm_limit: RPM_LIMIT,
    port: PORT,
  });
});

// Config endpoint for frontend (loaded as JavaScript)
app.get('/ai-config.js', (req, res) => {
  res.setHeader('Content-Type', 'application/javascript');
  res.send(`window.AI_CONFIG = ${JSON.stringify({
    port: PORT,
    baseUrl: `http://localhost:${PORT}/api`
  })};`);
});

// Main AI generation endpoint
app.post('/api/ai/generate', async (req, res) => {
  const signal = requestSignal(req, res);
  const clientIp = req.ip || req.connection.remoteAddress;

  // Rate limit check
  if (!checkRateLimit(clientIp)) {
    return res.status(429).json({
      error: 'Rate limit exceeded',
      message: `Maximum ${RPM_LIMIT} requests per minute`,
    });
  }

  // Destructure in the handler scope (not inside try) so the catch block can
  // reference these for logging — otherwise an AI error crashes the server.
  const { promptType, prompt, model, reasoningEffort } = req.body;

  try {
    // Validate prompt type
    if (!promptType || !ALLOWED_PROMPT_TYPES.has(promptType)) {
      return res.status(400).json({
        error: 'Invalid prompt type',
        allowed: Array.from(ALLOWED_PROMPT_TYPES),
      });
    }

    // Prompt is built client-side (src/lib/ai/prompts.ts) and forwarded as-is.
    if (!prompt || typeof prompt.system !== 'string' || typeof prompt.user !== 'string') {
      return res.status(400).json({
        error: 'Missing prompt',
        message: 'Expected { system, user } in request body',
      });
    }

    if (reasoningEffort !== undefined && !['none', 'low', 'medium', 'high', 'xhigh'].includes(reasoningEffort)) {
      return res.status(400).json({ error: 'Invalid reasoning effort' });
    }

    // Select provider and model
    const selectedModel = selectModel({ model });

    const startTime = Date.now();
    console.log(`[${new Date().toISOString()}] AI Start: ${selectedModel.provider}:${selectedModel.model} | Type: ${promptType}`);
    const { content: result, usage } = await callProvider(selectedModel, prompt, promptType, reasoningEffort, signal, req);
    signal.throwIfAborted();
    const duration = Date.now() - startTime;

    // Log successful generation (with token usage for cost tracking)
    console.log(`[${new Date().toISOString()}] AI Success: ${selectedModel.provider}:${selectedModel.model} | Type: ${promptType} | Time: ${duration}ms | In: ${usage?.prompt_tokens ?? '?'} tok | Out: ${usage?.completion_tokens ?? '?'} tok`);

    res.json({ result, model: `${selectedModel.provider}:${selectedModel.model}`, usage });
  } catch (error) {
    if (signal.aborted) return;
    const timestamp = new Date().toISOString();
    console.error(`[${timestamp}] AI generation error:`, error.message);
    console.error(`[${timestamp}] Model: ${model || 'default'}, Type: ${promptType}`);
    res.status(500).json({
      error: 'AI generation failed',
      message: error.message,
    });
  }
});

// Final factual gate. Routing stays server-side and never silently uses the generator.
app.post('/api/ai/verify', async (req, res) => {
  const signal = requestSignal(req, res);
  if (!checkRateLimit(req.ip)) return res.status(429).json(verificationUnavailable(new Error('Rate limit exceeded')));
  const audit = { id: require('node:crypto').randomUUID(), startedAt: new Date().toISOString(), request: req.body };
  try {
    const { topic, items, generatorModel, verifierModel } = req.body;
    const generator = selectModel({ model: generatorModel });
    const generatorId = `${generator.provider}:${generator.model}`;
    const configured = verifierModel || process.env.AI_VERIFIER_MODEL;
    const preferred = configured || (generator.provider === 'codex' && generator.model !== 'gpt-6.1-terra' ? 'codex:gpt-6.1-terra' : undefined);
    const verifierId = chooseVerifier(generatorId, preferred, getAllModels());
    const selected = selectModel({ model: verifierId });
    const prompt = verificationPrompt(topic, items);
    audit.model = verifierId;
    audit.prompt = prompt;
    const started = Date.now();
    console.log(`[${new Date().toISOString()}] AI Start: ${verifierId} | Type: verify-clues`);
    const { content, usage } = await callProvider(selected, prompt, 'verify-clues', 'low', signal, req);
    audit.rawResponse = content;
    signal.throwIfAborted();
    const verdicts = parseVerdicts(content, items);
    audit.verdicts = verdicts;
    console.log(`[${new Date().toISOString()}] AI Verified: ${verifierId} | Accepted: ${verdicts.filter(v => v.verdict === 'true' && v.onTopic).length}/${items.length} | Audit: ${audit.id}`);
    res.json({ verdicts, model: `${selected.provider}:${selected.model}`, usage, durationMs: Date.now() - started });
  } catch (error) {
    audit.error = error.message;
    if (signal.aborted) return;
    console.error(`[${new Date().toISOString()}] Verification unavailable | Audit: ${audit.id} | ${error.message}`);
    res.status(502).json(verificationUnavailable(error));
  } finally {
    await logVerification(audit);
  }
});

// =============================================================================
// Wikipedia retrieval — used by topic-mode parity (per-category grounding).
// Real sources break the self-referential loop where the model invents a
// fact-sheet and then grades clues against its own invention. Falls back to
// the AI fact-sheet client-side when retrieval fails or is thin.
// =============================================================================

const WIKI_API = 'https://en.wikipedia.org/w/api.php';
const MAX_ARTICLE_CHARS = 8000; // matches the judge's source window (prompts.ts)

/**
 * Search Wikipedia full text. Returns ranked titles + URLs.
 * No API key required; upstream rate limits can still reject requests.
 */
app.post('/api/search-wikipedia', async (req, res) => {
  const signal = requestSignal(req, res);
  const clientIp = req.ip || req.connection.remoteAddress;
  if (!checkRateLimit(clientIp)) {
    return res.status(429).json({ error: 'Rate limit exceeded', message: `Maximum ${RPM_LIMIT} requests per minute` });
  }
  const { query } = req.body;
  if (!query || typeof query !== 'string') {
    return res.status(400).json({ error: 'Missing query', message: 'Expected { query: string }' });
  }
  try {
    const url = `${WIKI_API}?action=query&list=search&srsearch=${encodeURIComponent(query)}&srlimit=5&srnamespace=0&format=json&origin=*`;
    const r = await fetch(url, { signal: timedSignal(signal, 15000) });
    if (!r.ok) throw new Error(`Wikipedia search HTTP ${r.status}`);
    const data = await r.json();
    const results = (data?.query?.search || []).map(hit => ({
      title: hit.title,
      url: `https://en.wikipedia.org/wiki/${encodeURIComponent(hit.title.replace(/ /g, '_'))}`,
    }));
    res.json({ results });
  } catch (error) {
    if (signal.aborted) return;
    console.error(`[${new Date().toISOString()}] search-wiki error:`, error.message);
    res.status(500).json({ error: 'Wikipedia search failed', message: error.message, results: [] });
  }
});

/**
 * Fetch article content for a URL. Currently only supports Wikipedia article
 * URLs (the common case for topic-mode grounding). Returns clean plain text
 * via the MediaWiki extracts API (explaintext=1), capped at MAX_ARTICLE_CHARS.
 *
 * Honors the client contract at src/lib/ai/service.ts (fetchArticleContent):
 *   POST { url } → 200 { text, truncated } | 500/4xx { error, message }
 *
 * This also retroactively fixes the previously-unimplemented endpoint that
 * URL-mode in the wizard calls (was returning 404).
 */
app.post('/api/fetch-article', async (req, res) => {
  const signal = requestSignal(req, res);
  const clientIp = req.ip || req.connection.remoteAddress;
  if (!checkRateLimit(clientIp)) {
    return res.status(429).json({ error: 'Rate limit exceeded', message: `Maximum ${RPM_LIMIT} requests per minute` });
  }
  const { url } = req.body;
  if (!url || typeof url !== 'string') {
    return res.status(400).json({ error: 'Missing url', message: 'Expected { url: string }' });
  }

  // Parse the Wikipedia article title out of a /wiki/<Title> URL.
  let parsed;
  try { parsed = new URL(url); } catch { parsed = null; }
  const isWiki = parsed && /(^|\.)wikipedia\.org$/.test(parsed.hostname) && parsed.pathname.startsWith('/wiki/');
  if (!isWiki) {
    return res.status(400).json({
      error: 'Unsupported URL',
      message: 'fetch-article currently supports Wikipedia article URLs only (e.g. https://en.wikipedia.org/wiki/...). General web fetching is not supported.',
    });
  }
  // /wiki/<Title> → decode + replace _ with space. Strip any sub-fragment.
  const title = decodeURIComponent(parsed.pathname.replace(/^\/wiki\//, '').split('#')[0].split('?')[0]).replace(/_/g, ' ');
  const lang = (parsed.hostname.split('.')[0] === 'en' || parsed.hostname.startsWith('en.')) ? 'en' : parsed.hostname.split('.')[0];
  const apiBase = `https://${lang || 'en'}.wikipedia.org/w/api.php`;

  try {
    // redirects=1 resolves redirect pages (e.g. "Julio-Claudians" →
    // "Julio-Claudian dynasty") so the extract comes back populated.
    const apiUrl = `${apiBase}?action=query&prop=extracts&explaintext=true&exsectionformat=plain&redirects=1&titles=${encodeURIComponent(title)}&format=json&origin=*`;
    const r = await fetch(apiUrl, { signal: timedSignal(signal, 15000) });
    if (!r.ok) throw new Error(`Wikipedia extracts HTTP ${r.status}`);
    const data = await r.json();
    const pages = data?.query?.pages || {};
    const page = Object.values(pages)[0];
    const extract = page?.extract || '';
    if (!extract) {
      return res.status(404).json({ error: 'Article not found', message: `No extract for "${title}".` });
    }
    const truncated = extract.length > MAX_ARTICLE_CHARS;
    const text = truncated ? extract.slice(0, MAX_ARTICLE_CHARS) : extract;
    res.json({ text, truncated });
  } catch (error) {
    if (signal.aborted) return;
    console.error(`[${new Date().toISOString()}] fetch-article error:`, error.message);
    res.status(500).json({ error: 'Article fetch failed', message: error.message });
  }
});

// Get max tokens based on prompt type
function getMaxTokens(promptType) {
  const tokenLimits = {
    'categories-generate': 8000,  // Full game with 6 categories × 5 clues
    'categories-generate-from-content': 8000, // Full game generated from source material
    'extract-board-answers': 4000, // Answer candidates + facts per category
    'clues-from-answers': 8000, // Full board of clues for fixed answers
    'final-jeopardy': 2000,
    'review-board': 4000,
    'verify-clues': 8000,
    'judge-clues': 4000, // Score every clue/answer pair
    'topic-fact-sheet': 4000, // Grounding fact-sheet for topic-mode parity
    'category-replace-all': 4000, // Single category with 5 clues
    'questions-generate-five': 3000, // 5 clues
    'category-generate-clues': 3000, // Fill missing clues
    'game-title': 500, // Title options
    'category-title-generate': 300, // Single category title
    'category-names-draft': 300, // Draft category titles for the wizard live preview
    'team-name-random': 200, // Short team names
    'team-name-enhance': 200, // Enhanced team name
    'default': 2000, // Single clue operations
  };
  return tokenLimits[promptType] || tokenLimits['default'];
}

// Call OpenRouter API
async function callOpenRouter(model, prompt, promptType, reasoningEffort, signal) {
  const apiKey = process.env.OPENROUTER_API_KEY;

  if (!apiKey) {
    throw new Error('OPENROUTER_API_KEY not configured');
  }

  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    signal: timedSignal(signal),
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'http://localhost:8001',
    },
    body: JSON.stringify({
      model: model,
      messages: [
        { role: 'system', content: prompt.system },
        { role: 'user', content: prompt.user },
      ],
      ...(model.startsWith('inception/mercury') ? { reasoning: { effort: reasoningEffort || 'low' }, provider: { require_parameters: true }, max_tokens: Math.max(16384, getMaxTokens(promptType) * 2) } : { temperature: 0.7, max_tokens: getMaxTokens(promptType) }),
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OpenRouter error: ${response.status} ${error}`);
  }

  const data = await response.json();
  if (data.choices?.[0]?.finish_reason !== 'stop') throw new Error('Incomplete OpenRouter response');
  const content = data.choices?.[0]?.message?.content;

  if (!content) {
    throw new Error('No content in AI response');
  }

  return { content, usage: data.usage || null };
}

// Call the OpenAI API directly. GPT-5+/6 models differ from OpenRouter-proxied
// chat models: they take max_completion_tokens (max_tokens is rejected) and only
// support the default temperature, so neither is sent the OpenRouter way.
async function callOpenAI(model, prompt, promptType, reasoningEffort, signal) {
  const apiKey = process.env.OPENAI_PLATFORM_API_KEY;

  if (!apiKey) {
    throw new Error('OPENAI_PLATFORM_API_KEY not configured');
  }

  const body = {
    model,
    messages: [
      { role: 'system', content: prompt.system },
      { role: 'user', content: prompt.user },
    ],
    // Reasoning tokens count against this cap, so leave headroom over the
    // visible-output budget used for the other providers.
    max_completion_tokens: getMaxTokens(promptType) * 2,
  };
  // These are structured-JSON tasks whose facts come from supplied source
  // material, so deep deliberation isn't needed. Unbounded reasoning has
  // exhausted the whole token cap before emitting any output (finish_reason
  // "length", empty content) and slows every step. Override via env.
  body.reasoning_effort = reasoningEffort || process.env.OPENAI_REASONING_EFFORT || 'low';

  // Long generations (full-board clue writing can run 60s+) occasionally die at
  // the network layer with a bare "fetch failed". Surface the underlying cause
  // and retry once on transient failures (network error, 429, 5xx) so one blip
  // doesn't leave the board half-built.
  const MAX_ATTEMPTS = 2;
  let data;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    signal?.throwIfAborted();
    let response;
    try {
      response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        signal: timedSignal(signal),
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });
    } catch (err) {
      signal?.throwIfAborted();
      const cause = err.cause?.code || err.cause?.message || err.message;
      console.warn(`[${new Date().toISOString()}] OpenAI network error (attempt ${attempt}/${MAX_ATTEMPTS}, ${promptType}): ${cause}`);
      if (attempt < MAX_ATTEMPTS) {
        await retryDelay(signal);
        continue;
      }
      throw new Error(`OpenAI request failed: ${cause}`);
    }

    if (!response.ok) {
      const error = await response.text();
      const transient = response.status === 429 || response.status >= 500;
      if (transient && attempt < MAX_ATTEMPTS) {
        console.warn(`[${new Date().toISOString()}] OpenAI ${response.status} (attempt ${attempt}/${MAX_ATTEMPTS}, ${promptType}), retrying`);
        await retryDelay(signal);
        continue;
      }
      throw new Error(`OpenAI error: ${response.status} ${error}`);
    }

    data = await response.json();
    break;
  }

  const choice = data.choices?.[0];
  if (choice?.finish_reason !== 'stop') throw new Error('Incomplete OpenAI response');
  const content = choice?.message?.content;

  if (!content) {
    throw new Error(`No content in OpenAI response (finish_reason: ${choice?.finish_reason ?? 'unknown'})`);
  }

  return { content, usage: data.usage || null };
}

// Call Ollama API
async function callOllama(model, prompt, promptType, _effort, signal) {
  const baseUrl = process.env.OLLAMA_BASE_URL || 'http://localhost:11434/api/chat';

  try {
    const response = await fetch(baseUrl, {
      method: 'POST',
      signal: timedSignal(signal),
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: model,
        stream: false,
        messages: [
          { role: 'system', content: prompt.system },
          { role: 'user', content: prompt.user },
        ],
        options: {
          temperature: 0.7,
          num_predict: getMaxTokens(promptType),
        },
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Ollama error: ${response.status} ${error}`);
    }

    const data = await response.json();
    const content = data.message?.content;

    if (!content) {
      throw new Error('No content in Ollama response');
    }

    return { content, usage: data.prompt_eval_count != null ? { prompt_tokens: data.prompt_eval_count, completion_tokens: data.eval_count } : null };
  } catch (error) {
    if (error.message.includes('ECONNREFUSED')) {
      throw new Error('Ollama server not available. Make sure Ollama is running with: ollama serve');
    }
    throw error;
  }
}

// Start server
app.listen(PORT, process.env.CODEX_ENABLED === 'true' ? '127.0.0.1' : (process.env.HOST || '127.0.0.1'), () => {
  const models = getAvailableModels();
  console.log(`\n🪄 Jeop3 AI Server running on http://localhost:${PORT}`);
  console.log(`🎟️ Subscription: ${models.codex.join(', ') || 'unavailable'}`);
  console.log(`🤖 OpenRouter: ${models.openrouter.length > 0 ? models.openrouter.join(', ') : 'none'}`);
  console.log(`🦙 Ollama: ${models.ollama.length > 0 ? models.ollama.join(', ') : 'none'}`);
  console.log(`🧠 OpenAI: ${models.openai.length > 0 ? models.openai.join(', ') : 'none'}`);
  console.log(`⚡ Rate limit: ${RPM_LIMIT} requests/minute`);
  console.log(`🌐 CORS: ${corsOrigin === '*' ? 'All origins' : corsOrigin}`);
  console.log(`\nPress Ctrl+C to stop\n`);
});
