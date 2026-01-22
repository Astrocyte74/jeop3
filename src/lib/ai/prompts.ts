/**
 * AI Prompts Module
 *
 * All prompt templates for AI operations.
 * Ported from jeop2 with TypeScript types.
 */

import type {
  AIPromptType,
  AIContext,
  AIDifficulty,
  AIValidator,
  AIResponses
} from './types';

// Consistent system instruction for all AI calls
const SYSTEM_INSTRUCTION = `You are a Jeopardy game content generator. Always respond with valid JSON only, no prose. No markdown, no explanations, just raw JSON.`;

/**
 * Build prompt for a specific AI operation
 */
export function buildPrompt(
  type: AIPromptType,
  context: AIContext,
  difficulty: AIDifficulty = 'normal'
): { system: string; user: string } {
  const difficultyText = difficulty === 'easy'
    ? 'Make questions accessible and straightforward. Avoid obscure references.'
    : difficulty === 'hard'
    ? 'Make questions challenging and specific. Embrace niche details.'
    : 'Balanced difficulty level.';

  // Value guidance for difficulty calibration
  const valueGuidance: Record<number, string> = {
    200: "Obvious / very well-known facts",
    400: "Common knowledge within topic",
    600: "Requires familiarity with the topic",
    800: "Niche or specific details",
    1000: "Deep cuts / less obvious information"
  };

  const valueGuidanceText = difficulty === 'normal' ? `
Value guidelines:
- 200: ${valueGuidance[200]}
- 400: ${valueGuidance[400]}
- 600: ${valueGuidance[600]}
- 800: ${valueGuidance[800]}
- 1000: ${valueGuidance[1000]}
` : '';

  const prompts: Record<AIPromptType, { system: string; user: string }> = {
    // ==================== GAME LEVEL ====================

    'game-title': {
      system: SYSTEM_INSTRUCTION,
      user: (() => {
        const existingTitlesText = context.existingTitles && context.existingTitles.length > 0
          ? `IMPORTANT: Do NOT repeat these existing titles:
${context.existingTitles.map(t => `- "${t.title}"`).join('\n')}

Generate something completely different and fresh.
`
          : '';

        if (context.hasContent && context.sampleContent) {
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
        } else if (context.multipleTopics && context.topicList) {
          // Multi-source mode: use topic list for context
          const topicListText = context.topicList.map((t: string, i: number) => `${i + 1}. ${t}`).join('\n');
          return `Generate 3 engaging Jeopardy game title options based on these multiple source topics:

${topicListText}

This is a multi-category game with ${context.sourceCount || context.topicList.length} different sources. Create titles that capture the overall theme or connect the diverse topics in a creative way.

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

    // ==================== CATEGORY LEVEL ====================

    'categories-generate': {
      system: SYSTEM_INSTRUCTION,
      user: `Generate ${context.count || 6} Jeopardy categories for theme: "${context.theme || 'general'}".

${difficultyText}
${valueGuidanceText}

REQUIREMENTS:
- Each category has 5 clues [200, 400, 600, 800, 1000]
- The clue must NOT contain or reveal the answer
- Each clue must have a DIFFERENT unique answer
- Responses must be specific and factual

Return JSON format:
{
  "categories": [
    {
      "title": "Category Name",
      "contentTopic": "Content topic (optional)",
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

    'categories-generate-from-content': {
      system: SYSTEM_INSTRUCTION,
      user: (() => {
        const referenceMaterial = context.referenceMaterial || '';

        return `Generate ${context.count || 6} Jeopardy categories from the source material below.

Source (${referenceMaterial.length.toLocaleString()} chars):
"""${referenceMaterial}"""
${context.theme ? `Theme: ${context.theme}` : ''}
${difficultyText}
${valueGuidanceText}

REQUIREMENTS:
- Create categories covering key topics, people, events, places, concepts from the source
- All clues must be answerable using ONLY the source material
- The clue must NOT contain or reveal the answer
- Each clue must have a DIFFERENT unique answer
- Each category needs: "title" (creative name) and "contentTopic" (descriptive topic)

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
}`;
      })()
    },

    'category-rename': {
      system: SYSTEM_INSTRUCTION,
      user: `Suggest 3 alternative names for this Jeopardy category: "${context.currentTitle}"

Theme: ${context.theme || 'general'}
${difficultyText}

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

${difficultyText}

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
${difficultyText}
${valueGuidanceText}

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
${context.contentTopic && context.contentTopic !== context.categoryTitle ? `Content Topic: "${context.contentTopic}"` : ''}

Theme: ${context.theme || context.categoryTitle}
Count: ${context.count || 5}
${difficultyText}
${valueGuidanceText}
${context.referenceMaterial ? `Source material to use for questions:
${context.referenceMaterial.substring(0, 3000)}

All clues must be answerable from the source material above.
` : ''}
${context.existingClues && context.existingClues.length > 0 ? `Current questions being replaced (for context only):
${context.existingClues.filter(c => c.clue).map(c => `- ${c.clue}`).join('\n')}
` : ''}
${context.existingAnswers && context.existingAnswers.length > 0 ? `IMPORTANT: These answers are used in OTHER categories - do NOT reuse them:
${context.existingAnswers.map((a: string) => `- ${a}`).join('\n')}
` : ''}

REQUIREMENTS:
- Each clue must have a DIFFERENT unique answer
${context.referenceMaterial ? '- All clues must be answerable from the source material' : ''}

Return JSON format:
{
  "category": {
    "title": "${context.categoryTitle}",
    "clues": [
      { "value": 200, "clue": "...", "response": "..." },
      { "value": 400, "clue": "...", "response": "..." },
      { "value": 600, "clue": "...", "response": "..." },
      { "value": 800, "clue": "...", "response": "..." },
      { "value": 1000, "clue": "...", "response": "..." }
    ]
  }
}`
    },

    // ==================== QUESTION LEVEL ====================

    'questions-generate-five': {
      system: SYSTEM_INSTRUCTION,
      user: `Generate 5 clues for category: "${context.categoryTitle}"
${context.contentTopic && context.contentTopic !== context.categoryTitle ? `Content Topic: "${context.contentTopic}"` : ''}
Theme: ${context.theme || context.categoryTitle}
${difficultyText}
${valueGuidanceText}
${context.referenceMaterial ? `Source material to use for questions:
${context.referenceMaterial.substring(0, 3000)}

All clues must be answerable from the source material above.
` : ''}
${context.existingClues && context.existingClues.length > 0 ? `IMPORTANT: Avoid duplicating these existing questions:
${context.existingClues.filter(c => c.clue).map(c => `- ${c.clue}`).join('\n')}
` : ''}
${context.existingAnswers && context.existingAnswers.length > 0 ? `IMPORTANT: These answers are already used - do NOT reuse them:
${context.existingAnswers.map((a: string) => `- ${a}`).join('\n')}
` : ''}

REQUIREMENTS:
- The clue must NOT contain or reveal the answer
- Each clue must have a DIFFERENT unique answer
${context.referenceMaterial ? '- All clues must be answerable from the source material' : ''}

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
${context.contentTopic && context.contentTopic !== context.categoryTitle ? `Content Topic: "${context.contentTopic}"` : ''}
Theme: ${context.theme || context.categoryTitle}
${difficultyText}
${difficulty === 'normal' && context.value ? `Value guidance: ${valueGuidance[context.value as keyof typeof valueGuidance]}` : ''}
${context.referenceMaterial ? `Source material to use for question:
${context.referenceMaterial.substring(0, 3000)}

The clue must be answerable from the source material above.
` : ''}
${context.existingClues && context.existingClues.length > 0 ? `IMPORTANT: Avoid duplicating these existing questions:
${context.existingClues.filter(c => c.clue).map(c => `- ${c.clue}`).join('\n')}
` : ''}
${context.existingAnswers && context.existingAnswers.length > 0 ? `IMPORTANT: These answers are already used - do NOT reuse them:
${context.existingAnswers.map((a: string) => `- ${a}`).join('\n')}
` : ''}

REQUIREMENTS:
- The clue must NOT contain or reveal the answer
${context.referenceMaterial ? '- The clue must be answerable from the source material' : ''}

Return JSON format:
{
  "clue": {
    "value": ${context.value || 200},
    "clue": "...",
    "response": "..."
  }
}`
    },

    // ==================== EDITOR PANEL ====================

    'editor-generate-clue': {
      system: SYSTEM_INSTRUCTION,
      user: `Generate a NEW question and answer for this slot.

Category: "${context.categoryTitle}"
${context.contentTopic && context.contentTopic !== context.categoryTitle ? `Content Topic: "${context.contentTopic}"` : ''}
Value: $${context.value}
Theme: ${context.theme || 'general'}
${difficultyText}
${difficulty === 'normal' && context.value ? `Value guidance: ${valueGuidance[context.value as keyof typeof valueGuidance]}` : ''}
${context.existingClues && context.existingClues.length > 0 ? `IMPORTANT: Avoid duplicating these existing questions:
${context.existingClues.filter(c => c.clue).map(c => `- ${c.clue}`).join('\n')}
` : ''}

REQUIREMENTS:
- The clue must NOT contain or reveal the answer

Return JSON format:
{
  "clue": "...",
  "response": "..."
}`
    },

    'editor-rewrite-clue': {
      system: SYSTEM_INSTRUCTION,
      user: `Enhance this question to be more engaging, clearer, and better written while keeping the same meaning and answer.

Original question: "${context.currentClue}"
Correct answer: "${context.currentResponse || '(answer will be provided separately)'}"
Category: "${context.categoryTitle}"
Value: $${context.value}
${context.referenceMaterial ? `Source material context:
${context.referenceMaterial.substring(0, 2000)}

Use the source material above to ensure accuracy and proper context.
` : ''}
${context.existingAnswers && context.existingAnswers.length > 0 ? `IMPORTANT: These answers are already used in other questions - do NOT reuse them:
${context.existingAnswers.map((a: string) => `- ${a}`).join('\n')}
` : ''}

Focus on:
- Making the question more interesting and engaging
- Improving clarity and flow
- Adding appropriate Jeopardy-style wording (e.g., "This is...", "What is...")
- Keeping the same answer and core meaning
- Using source material if provided to ensure accuracy

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
${difficultyText}

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
${difficulty === 'normal' && context.value ? `Expected difficulty: ${valueGuidance[context.value as keyof typeof valueGuidance]}` : ''}

Check for:
1. Answer matches question
2. Difficulty appropriate for value
3. Clear and unambiguous
4. Factually accurate

Return JSON format:
{
  "valid": true/false,
  "issues": ["...", "..."],
  "suggestions": ["...", "..."]
}`
    },

    // ==================== TEAM NAMES ====================

    'team-name-random': {
      system: `You are a creative team name generator. Always respond with valid JSON only, no prose.`,
      user: (() => {
        const hasGameTopic = context.gameTopic && context.gameTopic.trim() !== '' && context.gameTopic !== 'general trivia';

        return `Generate ${context.count || 1} creative and fun team name(s) for a trivia game.
${hasGameTopic ? `
CRITICAL: The game has a specific theme. You MUST create team names that are DIRECTLY themed to this topic.

Game theme/topic: "${context.gameTopic}"

Requirements:
- ALL team names MUST be themed to "${context.gameTopic}"
- Use references, characters, places, quotes, or wordplay related to this specific theme
- AVOID generic trivia/knowledge names (no "Quiztopher", "Brainiacs", etc.)
- Make them clever and specific to this game's theme
` : `
Make them memorable, clever, and fun. Use wordplay, puns, or creative concepts related to knowledge, trivia, or competition.
`}
${context.existingNames && context.existingNames.length > 0 ? `\n\nIMPORTANT: Do NOT use these existing team names: ${context.existingNames.map(n => `"${n}"`).join(', ')}` : ''}

Return JSON format:
{
  "names": ["Team Name 1"${context.count && context.count > 1 ? ', "Team Name 2", "Team Name 3"' : ''}]
}`;
      })()
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

/**
 * Schema validators for each AI response type
 */
export const validators: Record<AIPromptType, AIValidator<unknown>> = {
  'game-title': (data): data is AIResponses['game-title'] => {
    const d = data as AIResponses['game-title'];
    return typeof d === 'object' && d !== null &&
           Array.isArray(d.titles) &&
           d.titles.every(t => typeof t.title === 'string' && typeof t.subtitle === 'string');
  },

  'categories-generate': (data): data is AIResponses['categories-generate'] => {
    const d = data as AIResponses['categories-generate'];
    return typeof d === 'object' && d !== null &&
           Array.isArray(d.categories) &&
           d.categories.every(cat =>
             typeof cat.title === 'string' &&
             (typeof cat.contentTopic === 'string' || cat.contentTopic === undefined || cat.contentTopic === null) &&
             Array.isArray(cat.clues) &&
             cat.clues.every(clue =>
               typeof clue.value === 'number' &&
               typeof clue.clue === 'string' &&
               typeof clue.response === 'string'
             )
           );
  },

  'categories-generate-from-content': (data): data is AIResponses['categories-generate-from-content'] => {
    const d = data as AIResponses['categories-generate-from-content'];
    return typeof d === 'object' && d !== null &&
           Array.isArray(d.categories) &&
           d.categories.every(cat =>
             typeof cat.title === 'string' &&
             (typeof cat.contentTopic === 'string' || cat.contentTopic === undefined || cat.contentTopic === null) &&
             Array.isArray(cat.clues) &&
             cat.clues.every(clue =>
               typeof clue.value === 'number' &&
               typeof clue.clue === 'string' &&
               typeof clue.response === 'string'
             )
           );
  },

  'category-rename': (data): data is AIResponses['category-rename'] => {
    const d = data as AIResponses['category-rename'];
    return typeof d === 'object' && d !== null &&
           Array.isArray(d.names) &&
           d.names.length === 3 &&
           d.names.every(n => typeof n === 'string');
  },

  'category-title-generate': (data): data is AIResponses['category-title-generate'] => {
    const d = data as AIResponses['category-title-generate'];
    return typeof d === 'object' && d !== null &&
           typeof d.title === 'string' &&
           d.title.length > 0;
  },

  'category-generate-clues': (data): data is AIResponses['category-generate-clues'] => {
    const d = data as AIResponses['category-generate-clues'];
    return typeof d === 'object' && d !== null &&
           Array.isArray(d.clues) &&
           d.clues.every(clue =>
             typeof clue.value === 'number' &&
             typeof clue.clue === 'string' &&
             typeof clue.response === 'string'
           );
  },

  'category-replace-all': (data): data is AIResponses['category-replace-all'] => {
    const d = data as AIResponses['category-replace-all'];
    return typeof d === 'object' && d !== null &&
           typeof d.category === 'object' && d.category !== null &&
           typeof d.category.title === 'string' &&
           Array.isArray(d.category.clues) &&
           d.category.clues.every(clue =>
             typeof clue.value === 'number' &&
             typeof clue.clue === 'string' &&
             typeof clue.response === 'string'
           );
  },

  'questions-generate-five': (data): data is AIResponses['questions-generate-five'] => {
    const d = data as AIResponses['questions-generate-five'];
    return typeof d === 'object' && d !== null &&
           Array.isArray(d.clues) &&
           d.clues.length === 5 &&
           d.clues.every(clue =>
             typeof clue.value === 'number' &&
             typeof clue.clue === 'string' &&
             typeof clue.response === 'string'
           );
  },

  'question-generate-single': (data): data is AIResponses['question-generate-single'] => {
    const d = data as AIResponses['question-generate-single'];
    return typeof d === 'object' && d !== null &&
           typeof d.clue === 'object' && d.clue !== null &&
           typeof d.clue.value === 'number' &&
           typeof d.clue.clue === 'string' &&
           typeof d.clue.response === 'string';
  },

  'editor-generate-clue': (data): data is AIResponses['editor-generate-clue'] => {
    const d = data as AIResponses['editor-generate-clue'];
    return typeof d === 'object' && d !== null &&
           typeof d.clue === 'string' &&
           typeof d.response === 'string';
  },

  'editor-rewrite-clue': (data): data is AIResponses['editor-rewrite-clue'] => {
    const d = data as AIResponses['editor-rewrite-clue'];
    return typeof d === 'object' && d !== null &&
           typeof d.clue === 'string';
  },

  'editor-generate-answer': (data): data is AIResponses['editor-generate-answer'] => {
    const d = data as AIResponses['editor-generate-answer'];
    return typeof d === 'object' && d !== null &&
           typeof d.response === 'string';
  },

  'editor-validate': (data): data is AIResponses['editor-validate'] => {
    const d = data as AIResponses['editor-validate'];
    return typeof d === 'object' && d !== null &&
           typeof d.valid === 'boolean' &&
           Array.isArray(d.issues) &&
           Array.isArray(d.suggestions);
  },

  'team-name-random': (data): data is AIResponses['team-name-random'] => {
    const d = data as AIResponses['team-name-random'];
    return typeof d === 'object' && d !== null &&
           Array.isArray(d.names) &&
           d.names.length > 0 &&
           d.names.every(n => typeof n === 'string');
  },

  'team-name-enhance': (data): data is AIResponses['team-name-enhance'] => {
    const d = data as AIResponses['team-name-enhance'];
    return typeof d === 'object' && d !== null &&
           typeof d.name === 'string' &&
           d.name.length > 0;
  },
};
