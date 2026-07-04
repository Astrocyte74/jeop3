# Jeop3 Development Plan

## Project Overview

Jeop3 is a web-based Jeopardy game generator and player with AI-powered content creation. Built with React + TypeScript + Vite, featuring Clerk authentication and modern LLM integration.

## 🔧 Architecture Notes (2026-07)

- **Prompt unification.** The frontend `src/lib/ai/prompts.ts` (`buildPrompt`) is now the **single source of truth** for all AI prompts. The Express server (`server/index.js`) no longer builds prompts — it validates the prompt type, then forwards the client-built `{ system, user }` to OpenRouter/Ollama as-is. This fixed regeneration silently dropping source material (the server templates used to ignore `referenceMaterial`) and removed ~400 lines of duplicated prompt code.
- **Auth dev-bypass.** Set `localStorage['jeop3:devAuthBypass'] = 'true'` on localhost (or click "Skip sign-in" in the gate dialog) to exercise the full AI flow without a Clerk account. The sign-in gate itself remains for multi-user ownership/visibility in real deployments. Bypass is localhost-gated and never active in production.
- **Wizard: the Live Board.** `NewGameWizard` opens directly onto the Live Board — the single AI creation flow (the old composer/stepper step code remains in the file but has no entry point; Manual editor and Import JSON are demoted to the footer "More options" menu). The mental model is **columns and spans**: the board always shows 6 columns; the user authors a *span* at a time (default 1 column, widened via stepper or "All N"), choosing per span whether it's filled by an AI topic, pasted content, or a URL. Under the hood a span is still a `CustomSource` with `categoryCount` = span width; each span is generated in **one AI call** (N distinct categories, uniqueness enforced in-prompt), spans generate **sequentially** with `existingAnswers` chained across calls (MainMenu) so similar sources can't duplicate questions. The next-to-fill span is highlighted on the board (gold dashed "↓ next"), spans get ribbons grouping their columns, the game title composes live from column topics, and the draft-title pass (`category-names-draft`, debounced/cached, per-column hover-reroll) writes real AI titles onto columns as you type. Curated draft titles flow to generation via `suggestedTitles` → `suggestedCategoryTitles`, so the generated board matches the preview.
- **Known minor issues.** Paste counter reads "100,000 characters" but the prompt truncates at 200k; `_metadata` is referenced in `MainMenu` but never returned by the server (always `undefined`); `serverAvailable` is cached at module load and not re-checked if the AI server restarts mid-session (reload the page to recover).

## ✅ Completed Features

### Core Gameplay
- ✅ **Game Board** - 5x6 or custom grid with Jeopardy-style gameplay
- ✅ **Clue Dialog** - Display clues, mark correct/incorrect, assign points
- ✅ **Scoreboard** - TV-style bottom bar with team scores
  - Up to 4 teams (configurable)
  - Active team highlighting
  - Crown indicator for leader
  - Always-visible sticky positioning
- ✅ **Team Management** - Add/edit/remove teams during gameplay
  - Manual name editing
  - AI-enhanced names (signed-in users)
  - AI-generated new names (signed-in users)
  - Score editing for corrections
  - Min 2 teams, max 4 teams

### Authentication & Authorization
- ✅ **Clerk Authentication** - Sign in/sign up with email/password
- ✅ **Allowlist Protection** - AI features require sign-in
- ✅ **Admin System** - Admin (markcdarby@gmail.com) can see all games
- ✅ **Game Permissions** - View/edit game ownership controls

### AI Game Generation
- ✅ **Multiple Sources**:
  - From scratch (any theme)
  - Paste content (notes, transcripts, articles)
  - From URL (fetch webpages)
- ✅ **Model Selection** - OpenRouter and Ollama models (configured in `server/.env`)
  - google/gemini-2.5-flash-lite, google/gemini-2.5-flash, google/gemini-3-pro-preview
  - moonshotai/kimi-k2-thinking, x-ai/grok-4.1-fast
  - Ollama models (optional, e.g. gemma3:12b)
- ✅ **Content Processing**:
  - Full content support (up to 200k characters)
  - No chunking needed (models have 1M+ token context)
  - Character count displayed in prompts
- ✅ **Fact-Checked Clues** - AI verifies against source material
- ✅ **Metadata Tracking** - Model used, generation time, timestamp

### Game Management
- ✅ **Manual Editor** - Full board editing capabilities
- ✅ **AI Preview Editor** - Review/edit before finalizing
- ✅ **Import/Export** - JSON format for backup/sharing
- ✅ **Game Visibility**:
  - Public games (visible to everyone)
  - Private games (visible only to creator)
  - Visibility toggle per game
- ✅ **Game Filters** - All Games, Public, My Private, My All
- ✅ **Game Sorting** - Newest, Oldest, Recently Played, Most Played, In Progress, Not Started, Completion %
- ✅ **Reset Game** - Reset to 2 teams with fresh state
- ✅ **Play Statistics** - Track play count and last played date
- ✅ **Completion Tracking** - Show % of clues answered

### UI/UX Features
- ✅ **Theme System** - Multiple visual themes (Classic, Neon, Nature, etc.)
- ✅ **Icon Customization** - Different icon sizes (128px-1024px)
- ✅ **Responsive Design** - Works on desktop and mobile
- ✅ **Dark Mode** - Default slate/dark theme
- ✅ **Loading States** - Progress indicators for AI operations
- ✅ **AI Performance Stats** - Track model speeds and usage

### Persistence
- ✅ **LocalStorage** - Game state, custom games, settings
- ✅ **Auto-Save** - Game state saves on every change
- ✅ **Progress Restoration** - Continue in-progress games
- ✅ **Team Name Suggestions** - AI-generated themed team names

## 🚧 Current Limitations

### Content Limits
- Max 200,000 characters for pasted/URL content
- ~50,000 tokens (within long-context model limits)
- No chunking — full source sent in a single prompt

### Team Limits
- Minimum 2 teams
- Maximum 4 teams
- Can add/remove teams during gameplay

### Category/Clue Limits
- Standard 5 categories × 5 clues
- Editor supports custom grid sizes
- AI generates 6 categories by default

## 📋 Potential Future Enhancements

### Gameplay Features
- [ ] Daily Double wagers
- [ ] Final Jeopardy round
- [ ] Audio/Video clues
- [ ] Timer for clues
- [ ] Multiplayer real-time (WebSocket)
- [ ] Game replay/history
- [ ] Hint system

### AI Improvements
- [ ] Image-based clue generation
- [ ] Difficulty calibration per category
- [ ] Duplicate detection across categories
- [ ] Multi-language support
- [ ] Voice/audio input for themes

### Social Features
- [ ] Share game links
- [ ] Public game gallery
- [ ] Rating system
- [ ] Comments/feedback
- [ ] Game remixing

### Analytics
- [ ] Detailed play statistics
- [ ] Category performance tracking
- [ ] Player skill assessment
- [ ] AI generation quality metrics

### Content Sources
- [ ] PDF upload support
- [ ] YouTube transcript extraction
- [ ] Wikipedia API integration
- [ ] Document (DOCX, PPTX) parsing

## 🛠 Technical Stack

### Frontend
- React 19 with TypeScript
- Vite 7 build system
- TailwindCSS v4 + shadcn/ui components
- Radix UI + Base UI primitives
- Lucide React icons
- CSS animations (tw-animate-css)

### Backend/Services
- Node.js/Express (AI proxy server)
- Clerk Authentication
- OpenRouter API (LLM routing)
- Ollama (local models)

### Deployment
- Render (production)
- Local development: web on `:8345`, AI server on `:7476`

### Development
- Git version control
- ESLint + TypeScript strict mode
- Component-based architecture

## 📝 Configuration

### Environment Variables
```bash
# Clerk Authentication
VITE_CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...

# AI Models
OPENROUTER_API_KEY=sk-or-...
OR_MODELS="google/gemini-2.5-flash-lite,google/gemini-2.5-flash,..."
OLLAMA_MODELS="gemma3:12b,..."

# Ports
PORT=7476                      # AI server (server/.env)
# Web dev server runs on 8345 (vite.config.ts)
```

## 🎯 Development Priorities

1. ✅ Core gameplay (COMPLETE)
2. ✅ AI generation (COMPLETE)
3. ✅ Authentication (COMPLETE)
4. ✅ Game management (COMPLETE)
5. ✅ Team management (COMPLETE)
6. ✅ Content processing (COMPLETE)

### Next Phase (When Needed)
- Performance optimization
- Enhanced analytics
- Social features
- Multiplayer real-time

## ✅ Done: click-to-edit span (refinement #1)

Implemented (`8de14d5`). The board is a two-way authoring surface: click a filled
column (or an "On the board" list row) to load that span back into the left rail for editing.

**Why it matters:** the worst mistake-recovery case today is a paste span —
trashing a 5,000-char article to fix something means re-pasting it. Edit-in-place
turns that into one click. The board already advertises clickability (hover-reroll,
card-like columns), so this honors an existing affordance rather than adding a new one.

**Scope:** `editingSourceId` state; clicking an added span's column (or its row in
the "On the board" list) enters edit mode — the rail flips from "Now filling: Column N"
to "Editing Col X–Y", loads the span's type/content, and "Fill column" becomes
**Save changes** (update the source in place) + **Cancel** (deselect). Span **width
is locked while editing** (content-only) so neighbors don't need re-packing.

**Edge cases to handle deliberately:**
1. **Stash in-progress input.** If the user has typed/pasted content for the next
   span and then clicks a filled column, stash that draft and restore it on Save/Cancel —
   never silently discard it (that's the exact data-loss this feature exists to fix).
2. **Curated titles don't survive content edits — be intentional.** Editing content
   changes the draft-cache key, so a fresh title pass fires and any hand-rerolled titles
   for the old content are orphaned. That's semantically correct (new content ⇒ new titles);
   the code must not half-preserve stale titles.
3. **Two entry points, one state.** Make the "On the board" list rows clickable into the
   same edit mode as board columns — covers the sub-lg case where the board pane is hidden
   and columns can't be clicked.

Reuses the existing draft-pass + truthfulness (`suggestedTitles`) plumbing.

## 🔗 Related Projects

- **quizzernator** - Inspiration for chunking approach (not used)
- **jeop2** - Previous version, some patterns reused

## 📖 Documentation Files

- `README.md` - Project overview and setup
- `CLERK_AUTH_GUIDE.md` - Authentication setup guide
- `PLAN.md` - This file - development roadmap
