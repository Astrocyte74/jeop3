/**
 * Jeop3 AI Server - OpenRouter Proxy
 *
 * Proxies AI requests to OpenRouter, keeping API keys server-side.
 * Main game board works standalone - only Editor needs this server.
 */

const express = require('express');
const cors = require('cors');
require('dotenv').config({ override: true });

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

  return {
    openrouter: openrouterModels,
    ollama: ollamaModels
  };
}

// Get all available models (flattened with provider prefix)
function getAllModels() {
  const models = getAvailableModels();
  const all = [];

  models.openrouter.forEach(m => all.push({ id: `or:${m}`, name: m, provider: 'openrouter' }));
  models.ollama.forEach(m => all.push({ id: `ollama:${m}`, name: m, provider: 'ollama' }));

  return all;
}

// Select model based on options (provider, model, etc.)
function selectModel(options = {}) {
  const { provider = 'openrouter', model } = options;
  const models = getAvailableModels();

  // If specific model requested, parse provider:model format
  if (model) {
    const parts = model.split(':');
    const modelProvider = parts[0];
    // Join the rest with ':' in case the model name contains colons (e.g., gemma3:12b)
    const modelName = parts.slice(1).join(':');

    if (modelProvider === 'or' || modelProvider === 'openrouter') {
      return { provider: 'openrouter', model: modelName || models.openrouter[0] };
    } else if (modelProvider === 'ollama') {
      return { provider: 'ollama', model: modelName || models.ollama[0] };
    }
  }

  // Default to first available model from requested provider
  if (provider === 'ollama' && models.ollama.length > 0) {
    return { provider: 'ollama', model: models.ollama[0] };
  }

  // Fall back to OpenRouter
  if (models.openrouter.length === 0) {
    throw new Error('No models configured in OR_MODELS or OLLAMA_MODELS');
  }

  return { provider: 'openrouter', model: models.openrouter[0] };
}

// Whitelist of allowed prompt types
const ALLOWED_PROMPT_TYPES = new Set([
  'game-title',
  'categories-generate',
  'categories-generate-from-content',
  'extract-board-answers',
  'clues-from-answers',
  'judge-clues',
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
    providers: {
      openrouter: getAvailableModels().openrouter,
      ollama: getAvailableModels().ollama
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
  const { promptType, prompt, model } = req.body;

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

    // Select provider and model
    const selectedModel = selectModel({ model });

    // Call appropriate provider
    let result, usage;
    const startTime = Date.now();
    if (selectedModel.provider === 'ollama') {
      ({ content: result, usage } = await callOllama(selectedModel.model, prompt, promptType));
    } else {
      ({ content: result, usage } = await callOpenRouter(selectedModel.model, prompt, promptType));
    }
    const duration = Date.now() - startTime;

    // Log successful generation (with token usage for cost tracking)
    console.log(`[${new Date().toISOString()}] AI Success: ${selectedModel.provider}:${selectedModel.model} | Type: ${promptType} | Time: ${duration}ms | In: ${usage?.prompt_tokens ?? '?'} tok | Out: ${usage?.completion_tokens ?? '?'} tok`);

    res.json({ result, model: `${selectedModel.provider}:${selectedModel.model}`, usage });
  } catch (error) {
    const timestamp = new Date().toISOString();
    console.error(`[${timestamp}] AI generation error:`, error.message);
    console.error(`[${timestamp}] Model: ${model || 'default'}, Type: ${promptType}`);
    res.status(500).json({
      error: 'AI generation failed',
      message: error.message,
    });
  }
});

// Get max tokens based on prompt type
function getMaxTokens(promptType) {
  const tokenLimits = {
    'categories-generate': 8000,  // Full game with 6 categories × 5 clues
    'categories-generate-from-content': 8000, // Full game generated from source material
    'extract-board-answers': 4000, // Answer candidates + facts per category
    'clues-from-answers': 8000, // Full board of clues for fixed answers
    'judge-clues': 4000, // Score every clue/answer pair
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
async function callOpenRouter(model, prompt, promptType) {
  const apiKey = process.env.OPENROUTER_API_KEY;

  if (!apiKey) {
    throw new Error('OPENROUTER_API_KEY not configured');
  }

  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
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
      temperature: 0.7,
      max_tokens: getMaxTokens(promptType),
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OpenRouter error: ${response.status} ${error}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;

  if (!content) {
    throw new Error('No content in AI response');
  }

  return { content, usage: data.usage || null };
}

// Call Ollama API
async function callOllama(model, prompt, promptType) {
  const baseUrl = process.env.OLLAMA_BASE_URL || 'http://localhost:11434/api/chat';

  try {
    const response = await fetch(baseUrl, {
      method: 'POST',
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
app.listen(PORT, () => {
  const models = getAvailableModels();
  console.log(`\n🪄 Jeop3 AI Server running on http://localhost:${PORT}`);
  console.log(`🤖 OpenRouter: ${models.openrouter.length > 0 ? models.openrouter.join(', ') : 'none'}`);
  console.log(`🦙 Ollama: ${models.ollama.length > 0 ? models.ollama.join(', ') : 'none'}`);
  console.log(`⚡ Rate limit: ${RPM_LIMIT} requests/minute`);
  console.log(`🌐 CORS: ${corsOrigin === '*' ? 'All origins' : corsOrigin}`);
  console.log(`\nPress Ctrl+C to stop\n`);
});
