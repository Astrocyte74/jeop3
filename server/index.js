/**
 * Jeop3 AI Server - OpenRouter Proxy
 *
 * Proxies AI requests to OpenRouter, keeping API keys server-side.
 * Main game board works standalone - only Editor needs this server.
 */

const express = require('express');
const cors = require('cors');
require('dotenv').config();

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

// Get available models from OR_MODELS env var
function getAvailableModels() {
  const modelsEnv = process.env.OR_MODELS || '';
  return modelsEnv.split(',').map(m => m.trim()).filter(m => m);
}

// Select model based on options (difficulty, etc.)
function selectModel(options = {}) {
  const models = getAvailableModels();
  if (models.length === 0) {
    throw new Error('No models configured in OR_MODELS');
  }

  // Default: first model in list
  // Could add logic to select based on difficulty here
  return models[0];
}

// Whitelist of allowed prompt types
const ALLOWED_PROMPT_TYPES = new Set([
  'game-title',
  'categories-generate',
  'category-rename',
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
    models: getAvailableModels(),
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

  try {
    const { promptType, context, difficulty } = req.body;

    // Validate prompt type
    if (!promptType || !ALLOWED_PROMPT_TYPES.has(promptType)) {
      return res.status(400).json({
        error: 'Invalid prompt type',
        allowed: Array.from(ALLOWED_PROMPT_TYPES),
      });
    }

    // Build prompt (will use ai-prompts.js logic)
    const prompt = buildPrompt(promptType, context, difficulty);

    // Call OpenRouter API
    const model = selectModel({ difficulty });
    const result = await callOpenRouter(model, prompt, promptType);

    res.json({ result, model });
  } catch (error) {
    console.error('AI generation error:', error);
    res.status(500).json({
      error: 'AI generation failed',
      message: error.message,
    });
  }
});

// Build prompt from template (inline for now - will be shared with frontend)
function buildPrompt(type, context, difficulty) {
  const SYSTEM_INSTRUCTION = `You are a Jeopardy game content generator. Always respond with valid JSON only, no prose. No markdown, no explanations, just raw JSON.`;

  const VALUE_GUIDANCE = {
    200: "Obvious / very well-known facts",
    400: "Common knowledge within topic",
    600: "Requires familiarity with the topic",
    800: "Niche or specific details",
    1000: "Deep cuts / less obvious information"
  };

  const difficultyText = difficulty === 'easy'
    ? 'Make questions accessible and straightforward.'
    : difficulty === 'hard'
    ? 'Make questions challenging and specific.'
    : 'Balanced difficulty level.';

  const prompts = {
    'game-title': {
      system: SYSTEM_INSTRUCTION,
      user: (() => {
        const existingTitlesText = context.existingTitles && context.existingTitles.length > 0
          ? `IMPORTANT: Do NOT repeat these existing titles:
${context.existingTitles.map(t => `- "${t.title}"`).join('\n')}

Generate something completely different and fresh.
`
          : '';

        if (context.hasContent) {
          return `Generate 3 engaging Jeopardy game title options based on this sample content:

${context.sampleContent}

Analyze the categories and questions above, then create titles that capture the theme and tone.

${difficultyText}

${existingTitlesText}

Return JSON format:
{
  "titles": [
    { "title": "...", "subtitle": "..." },
    { "title": "...", "subtitle": "..." },
    { "title": "...", "subtitle": "..." }
  ]
}`;
        } else {
          const theme = context.theme || 'general trivia';
          const randomHint = context.theme === 'random' ? 'Choose any interesting trivia theme at random.' : '';
          return `Generate 3 engaging Jeopardy game title options for theme: "${theme}"

${randomHint}

${difficultyText}

${existingTitlesText}

Return JSON format:
{
  "titles": [
    { "title": "...", "subtitle": "..." },
    { "title": "...", "subtitle": "..." },
    { "title": "...", "subtitle": "..." }
  ]
}`;
        }
      })()
    },

    'categories-generate': {
      system: SYSTEM_INSTRUCTION,
      user: `Generate ${context.count || 6} Jeopardy categories for theme: "${context.theme}".

Difficulty: ${difficultyText}
${difficulty === 'normal' ? `
Value guidelines:
- 200: ${VALUE_GUIDANCE[200]}
- 400: ${VALUE_GUIDANCE[400]}
- 600: ${VALUE_GUIDANCE[600]}
- 800: ${VALUE_GUIDANCE[800]}
- 1000: ${VALUE_GUIDANCE[1000]}
` : ''}

IMPORTANT: Each category needs TWO names:
1. "title" - A creative, catchy display name for players (e.g., "Geography Genius", "Word Wizards")
2. "contentTopic" - The descriptive topic name for AI context (e.g., "World Capitals", "Literary Terms")

The title should be fun and creative while the contentTopic should be clear and descriptive.

Return JSON format:
{
  "categories": [
    {
      "title": "Creative Display Name",
      "contentTopic": "Descriptive Topic Name",
      "clues": [
        { "value": 200, "clue": "...", "response": "..." },
        { "value": 400, "clue": "...", "response": "..." },
        { "value": 600, "clue": "...", "response": "..." },
        { "value": 800, "clue": "...", "response": "..." },
        { "value": 1000, "clue": "...", "response": "..." }
      ]
    }
  ]
}`
    },

    'category-rename': {
      system: SYSTEM_INSTRUCTION,
      user: `Suggest 3 alternative names for this Jeopardy category: "${context.currentTitle}"

Theme: ${context.theme || 'general'}

Return JSON format:
{
  "names": ["Option 1", "Option 2", "Option 3"]
}`
    },

    'category-title-generate': {
      system: SYSTEM_INSTRUCTION,
      user: `Generate a BRAND NEW, completely original Jeopardy category title for this content topic: "${context.contentTopic}"

IMPORTANT: Create something FRESH and DIFFERENT - not just a variation or rewording of existing titles.

The category title should:
- Be completely original and unique
- Use clever wordplay, puns, or pop culture references related to "${context.contentTopic}"
- Fit the classic Jeopardy style (playful, sometimes cryptic, often using before/after, puns, or rhymes)
- Capture the essence of "${context.contentTopic}" in a creative way
${context.theme ? `- Optionally connect to the overall game theme: "${context.theme}"` : ''}
- Be short (typically 1-6 words)

Examples of good Jeopardy category styles:
- "Before & After" (combining two phrases)
- Puns or wordplay on the topic
- Rhymes or alliteration
- Pop culture references
- Play on words or idioms

Difficulty: ${difficultyText}

Return JSON format:
{
  "title": "Brand New Clever Title"
}`
    },

    'category-generate-clues': {
      system: SYSTEM_INSTRUCTION,
      user: `Generate missing clues for category: "${context.categoryTitle}"

Theme: ${context.theme || context.categoryTitle}
Existing clues: ${JSON.stringify(context.existingClues || [])}

Fill missing values to complete [200, 400, 600, 800, 1000] set.
${difficulty === 'normal' ? `
Value guidelines:
- 200: ${VALUE_GUIDANCE[200]}
- 400: ${VALUE_GUIDANCE[400]}
- 600: ${VALUE_GUIDANCE[600]}
- 800: ${VALUE_GUIDANCE[800]}
- 1000: ${VALUE_GUIDANCE[1000]}
` : ''}

Return JSON format:
{
  "clues": [
    { "value": 200, "clue": "...", "response": "..." }
  ]
}`
    },

    'category-replace-all': {
      system: SYSTEM_INSTRUCTION,
      user: `Replace all clues in category: "${context.categoryTitle}"

Theme: ${context.theme || context.categoryTitle}
Count: ${context.count || 5}
${difficulty === 'normal' ? `
Value guidelines:
- 200: ${VALUE_GUIDANCE[200]}
- 400: ${VALUE_GUIDANCE[400]}
- 600: ${VALUE_GUIDANCE[600]}
- 800: ${VALUE_GUIDANCE[800]}
- 1000: ${VALUE_GUIDANCE[1000]}
` : ''}

Return JSON format:
{
  "category": {
    "title": "${context.categoryTitle}",
    "clues": [
      { "value": 200, "clue": "...", "response": "..." }
    ]
  }
}`
    },

    'questions-generate-five': {
      system: SYSTEM_INSTRUCTION,
      user: `Generate 5 clues for category: "${context.categoryTitle}"

Theme: ${context.theme || context.categoryTitle}
${difficulty === 'normal' ? `
Value guidelines:
- 200: ${VALUE_GUIDANCE[200]}
- 400: ${VALUE_GUIDANCE[400]}
- 600: ${VALUE_GUIDANCE[600]}
- 800: ${VALUE_GUIDANCE[800]}
- 1000: ${VALUE_GUIDANCE[1000]}
` : ''}

Return JSON format:
{
  "clues": [
    { "value": 200, "clue": "...", "response": "..." },
    { "value": 400, "clue": "...", "response": "..." },
    { "value": 600, "clue": "...", "response": "..." },
    { "value": 800, "clue": "...", "response": "..." },
    { "value": 1000, "clue": "...", "response": "..." }
  ]
}`
    },

    'question-generate-single': {
      system: SYSTEM_INSTRUCTION,
      user: `Generate 1 clue for value $${context.value}.

Category: "${context.categoryTitle}"
Theme: ${context.theme || context.categoryTitle}
${difficulty === 'normal' ? `Value guidance: ${VALUE_GUIDANCE[context.value]}` : ''}

Return JSON format:
{
  "clue": {
    "value": ${context.value},
    "clue": "...",
    "response": "..."
  }
}`
    },

    'editor-generate-clue': {
      system: SYSTEM_INSTRUCTION,
      user: `Generate a question and answer for this slot.

Category: "${context.categoryTitle}"
Value: $${context.value}
Theme: ${context.theme || 'general'}
${difficulty === 'normal' ? `Value guidance: ${VALUE_GUIDANCE[context.value]}` : ''}

Return JSON format:
{
  "clue": "...",
  "response": "..."
}`
    },

    'editor-rewrite-clue': {
      system: SYSTEM_INSTRUCTION,
      user: `Rewrite this question to be more engaging.

Original: "${context.currentClue}"
Category: "${context.categoryTitle}"
Value: $${context.value}

Return JSON format:
{
  "clue": "..."
}`
    },

    'editor-generate-answer': {
      system: SYSTEM_INSTRUCTION,
      user: `Generate the correct answer for this question.

Question: "${context.clue}"
Category: "${context.categoryTitle}"
Value: $${context.value}

Return JSON format:
{
  "response": "..."
}`
    },

    'editor-validate': {
      system: SYSTEM_INSTRUCTION,
      user: `Validate this Jeopardy clue pair.

Question: "${context.clue}"
Answer: "${context.response}"
Category: "${context.categoryTitle}"
Value: $${context.value}

Check for:
1. Answer matches question
2. Difficulty appropriate for value
3. Clear and unambiguous

Return JSON format:
{
  "valid": true/false,
  "issues": ["..."],
  "suggestions": ["..."]
}`
    },

    'team-name-random': {
      system: `You are a creative team name generator. Always respond with valid JSON only, no prose.`,
      user: `Generate ${context.count || 1} creative and fun team name(s) for a trivia game.

Make them memorable, clever, and fun. Use wordplay, puns, or creative concepts related to knowledge, trivia, or competition.
${context.gameTopic ? `\n\nGame theme/topic: "${context.gameTopic}"\nConsider making the team names thematically related to this game topic.` : ''}
${context.existingNames && context.existingNames.length > 0 ? `\n\nIMPORTANT: Do NOT use these existing team names: ${context.existingNames.map(n => `"${n}"`).join(', ')}` : ''}

Return JSON format:
{
  "names": ["Team Name 1"${context.count && context.count > 1 ? ', "Team Name 2", "Team Name 3"' : ''}]
}`
    },

    'team-name-enhance': {
      system: `You are a creative team name enhancer. Always respond with valid JSON only, no prose.`,
      user: `Make this team name more creative and fun for a trivia game: "${context.currentName}"

Transform it into something more memorable, clever, or humorous. Keep the spirit of the original but make it better.
${context.gameTopic ? `\n\nGame theme/topic: "${context.gameTopic}"\nConsider enhancing the name to be thematically related to this game topic.` : ''}
${context.existingNames && context.existingNames.length > 0 ? `\n\nIMPORTANT: The enhanced name should not conflict with these existing team names: ${context.existingNames.map(n => `"${n}"`).join(', ')}` : ''}

Return JSON format:
{
  "name": "Enhanced Team Name"
}`
    },
  };

  return prompts[type] || { system: SYSTEM_INSTRUCTION, user: 'Generate Jeopardy content.' };
}

// Get max tokens based on prompt type
function getMaxTokens(promptType) {
  const tokenLimits = {
    'categories-generate': 8000,  // Full game with 6 categories × 5 clues
    'category-replace-all': 4000, // Single category with 5 clues
    'questions-generate-five': 3000, // 5 clues
    'category-generate-clues': 3000, // Fill missing clues
    'game-title': 500, // Title options
    'category-title-generate': 300, // Single category title
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

  return content;
}

// Start server
app.listen(PORT, () => {
  console.log(`\n🪄 Jeop3 AI Server running on http://localhost:${PORT}`);
  console.log(`📋 Models: ${getAvailableModels().join(', ')}`);
  console.log(`⚡ Rate limit: ${RPM_LIMIT} requests/minute`);
  console.log(`🌐 CORS: ${corsOrigin === '*' ? 'All origins' : corsOrigin}`);
  console.log(`\nPress Ctrl+C to stop\n`);
});
