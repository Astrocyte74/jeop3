# Jeop3 Development Plan

## Project Overview

Jeop3 is a web-based Jeopardy game generator and player with AI-powered content creation. Built with React + TypeScript + Vite, featuring Clerk authentication and modern LLM integration.

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
- ✅ **Model Selection** - OpenRouter and Ollama models
  - Gemini 2.5 Flash/Lite
  - GLM-4.7
  - Kimi K2
  - Grok 4.1
  - Gemma3 12b (Ollama)
- ✅ **Content Processing**:
  - Full content support (up to 100k characters)
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
- Max 100,000 characters for pasted content
- ~25,000 tokens (well within model limits)
- No chunking needed (modern LLMs have 1M+ token context)

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
- React 18+ with TypeScript
- Vite build system
- TailwindCSS + shadcn/ui components
- Radix UI primitives
- Lucide React icons
- Framer Motion (animations)

### Backend/Services
- Node.js/Express (AI proxy server)
- Clerk Authentication
- OpenRouter API (LLM routing)
- Ollama (local models)

### Deployment
- Render (production)
- Local development (port 8735)

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
PORT=8735
GAME_PORT=8735
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

## 🔗 Related Projects

- **quizzernator** - Inspiration for chunking approach (not used)
- **jeop2** - Previous version, some patterns reused

## 📖 Documentation Files

- `README.md` - Project overview and setup
- `CLERK_AUTH_GUIDE.md` - Authentication setup guide
- `PLAN.md` - This file - development roadmap
