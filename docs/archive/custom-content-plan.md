> ⚠️ **ARCHIVED — SUPERSEDED (2026-01).** This plan described a Python/`YTV2-Dashboard`
> (`jeop3_prompts.py`) approach with chunking, intended for the launcher's *Auth Test Mode*.
> The feature was instead implemented in the Node backend (`server/index.js`) as the
> `categories-generate-from-content` prompt type, with no chunking (full source up to 200k chars).
> As of 2026-07 that implementation was **broken** (server was missing the prompt type from its
> whitelist) — see the "Known Issues" section of `PLAN.md`. Kept for historical context only.

# Custom Content Creation for Jeop3 - Implementation Plan

## Overview

Add ability to create Jeopardy games from custom content sources:
- **Pasted text/transcripts** (up to 100,000 characters)
- **Fetched from URL** (web pages, Wikipedia articles)
- Uses existing YTV2-Dashboard `/api/fetch-article` endpoint
- Similar to Quizzernator's implementation

## Current State

### Already Working (YTV2-Dashboard)
- ✅ `POST /api/fetch-article` endpoint exists (lines 5337-5523)
  - Wikipedia API integration
  - BeautifulSoup parsing for general web pages
  - 500KB download limit, 100K character text limit
  - Smart text clipping at sentence/paragraph boundaries

### Jeop3 Frontend
- ✅ AI generation infrastructure (`src/lib/ai/service.ts`, `hooks.ts`)
- ✅ NewGameWizard for theme/difficulty selection
- ✅ AIPreviewDialog for previewing and editing generated games
- ✅ Jeop3 prompt building system in YTV2 (`jeop3_prompts.py`)

## Implementation Plan

### Phase 1: Backend - Add Content-Aware Prompts to YTV2

**File: `/Users/markdarby/projects/YTV2-Dashboard/jeop3_prompts.py`**

1. Add new prompt type: `categories-generate-from-content`
   - Similar to `categories-generate` but includes source material
   - Prompt structure:
     ```
     Generate {count} Jeopardy categories based on the following source material.

     Source material:
     """{content}"""

     Theme: {theme}
     Difficulty: {difficulty}
     {value_guidance}

     Create categories that cover the key topics, people, events, and concepts
     from the source material above. All clues should be answerable using
     only the information provided in the source material.

     Return JSON format:
     {
       "categories": [...]
     }
     ```

2. Add source material metadata tracking:
   - `source_type`: "url" | "paste" | "none"
   - `source_url`: string (optional)
   - `source_characters`: number
   - `chunk_count`: number (if chunked)

3. Implement chunking for large content (similar to Quizzernator):
   - Split content into ~8000 character chunks
   - Generate categories per chunk
   - Merge and deduplicate categories

### Phase 2: Frontend - Content Input UI

**File: `/Users/markdarby/projects/jeop3/jeop3/src/components/NewGameWizard.tsx`**

1. Add new wizard step: `source` (before theme)
   - Three options:
     - "From scratch" (existing behavior)
     - "Paste content" (textarea input)
     - "From URL" (URL input + fetch button)

2. State management:
   ```typescript
   interface WizardState {
     step: 'source' | 'theme' | 'difficulty'
     sourceMode: 'scratch' | 'paste' | 'url'
     referenceMaterial: string  // For paste mode
     referenceUrl: string       // For URL mode
     isFetching: boolean
     fetchError: string
     theme: string
     difficulty: 'easy' | 'normal' | 'hard'
   }
   ```

3. UI Components:
   - Radio buttons for source mode selection
   - Conditional rendering based on mode
   - Textarea for paste (100K char limit, character counter)
   - URL input + "Fetch" button for URL mode
   - "Continue" button only enabled when content is loaded/valid

### Phase 3: Frontend - URL Fetching

**File: `/Users/markdarby/projects/jeop3/jeop3/src/lib/ai/service.ts`**

1. Add new function:
   ```typescript
   export async function fetchArticleContent(url: string): Promise<{
     success: boolean;
     text?: string;
     truncated?: boolean;
     error?: string;
   }> {
     const apiBase = getAIApiBase();
     const response = await fetch(`${apiBase}/fetch-article`, {
       method: 'POST',
       headers: { 'Content-Type': 'application/json' },
       body: JSON.stringify({ url })
     });
     return response.json();
   }
   ```

### Phase 4: Frontend - Content-Aware Generation

**File: `/Users/markdarby/projects/jeop3/jeop3/src/components/MainMenu.tsx`**

1. Modify `handleAIGenerateFullGame`:
   - Accept optional `referenceMaterial` and `referenceUrl` parameters
   - Pass to `aiGenerate()` as part of context

2. Add context field for source material:
   ```typescript
   const context: AIContext = {
     theme: theme || 'random',
     count: 6,
     // NEW:
     referenceMaterial?: string,
     referenceUrl?: string,
   };
   ```

### Phase 5: Update Types

**File: `/Users/markdarby/projects/jeop3/jeop3/src/lib/ai/types.ts`**

1. Extend `AIContext` interface:
   ```typescript
   export interface AIContext {
     // ... existing fields
     referenceMaterial?: string;
     referenceUrl?: string;
     sourceCharacters?: number;
   }
   ```

**File: `/Users/markdarby/projects/jeop3/jeop3/src/lib/ai/types.ts`**

2. Add new prompt type:
   ```typescript
   export type AIPromptType =
     // ... existing types
     | 'categories-generate-from-content';
   ```

### Phase 6: Game Metadata

**File: `/Users/markdarby/projects/jeop3/jeop3/src/components/MainMenu.tsx`**

1. Add source metadata to `GeneratedGameData`:
   ```typescript
   interface GeneratedGameData {
     // ... existing fields
     sourceType?: 'url' | 'paste' | 'none';
     sourceUrl?: string;
     sourceCharacters?: number;
   }
   ```

2. Display source info in AIPreviewDialog:
   - Show "Generated from: URL" or "Generated from: pasted content"
   - Show character count
   - Link to source URL if applicable

## Implementation Order

1. **Backend first** - Add `categories-generate-from-content` to YTV2
2. **Frontend types** - Update TypeScript interfaces
3. **Service function** - Add `fetchArticleContent()` to AI service
4. **Wizard UI** - Add source selection step to NewGameWizard
5. **Generation logic** - Update MainMenu to pass content to AI
6. **Metadata** - Add source tracking to generated games

## Testing Checklist

- [ ] Paste mode works with short content (< 1000 chars)
- [ ] Paste mode works with long content (> 8000 chars, tests chunking)
- [ ] Paste mode rejects content under 40 characters
- [ ] URL mode works with Wikipedia articles
- [ ] URL mode works with regular web pages
- [ ] URL mode handles invalid URLs gracefully
- [ ] URL mode handles fetch failures (404, timeout, etc.)
- [ ] Generated clues are based on source material
- [ ] Generated categories reflect source content themes
- [ ] Scratch mode (existing behavior) still works
- [ ] Source metadata is saved with game
- [ ] Character counter displays correctly
- [ ] Loading states work during URL fetch

## Technical Notes

### Content Chunking
- For content > 8000 characters, split into chunks
- Each chunk generates 1-2 categories
- Merge all categories and deduplicate by title/topic
- Total category count: 6 (standard Jeop3)

### Wikipedia Integration
- Use existing YTV2 `fetch_wikipedia_article()` function
- Returns clean text extract without markup
- More reliable than general web scraping

### Error Handling
- URL fetch failures should show inline error message
- AI generation failures should fallback to scratch mode
- Invalid URLs should be validated before fetch attempt

### Future Enhancements (Out of Scope)
- File upload (PDF, TXT, DOC)
- Multiple source combination
- Source citation in clues
- "Verify against source" feature
