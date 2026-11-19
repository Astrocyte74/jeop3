# Jeop3 - AI-Powered Jeopardy Game

A modern Jeopardy-style trivia game with AI-powered question generation, built with React, TypeScript, and Vite.

## Features

- 🎮 **Play Games** - Classic Jeopardy gameplay with team scoring
- 🤖 **AI Generation** - Generate games with AI (OpenRouter, Ollama, or custom)
- ✏️ **Manual Editor** - Create/edit games manually
- 📥 **Import/Export** - Share games as JSON files
- 🎨 **Multiple Themes** - Customizable visual themes
- 🖼️ **Icon Matching** - AI-powered icon suggestions for clues
- 📊 **Team Management** - Multiple teams with score tracking
- 💾 **Auto-Save** - Game state persists between sessions

## Prerequisites

- **Node.js** 22+ - [Download here](https://nodejs.org/)
- **npm** (comes with Node.js)
- **OpenRouter API Key** - Get one at [openrouter.ai/keys](https://openrouter.ai/keys) (for AI features)
- Optional: **Ollama** - For local AI models (not required)
- Optional: **Docker Desktop** - For single-container Tailscale access

## Quick Start (Mac)

### 1. Clone the Repository

```bash
git clone <your-repo-url>
cd jeop3
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Set Up Environment (Optional but Recommended)

```bash
cp .env.example .env
```

Edit `.env` and add your OpenRouter API key:

```bash
OPENROUTER_API_KEY=sk-or-your-actual-key-here
OR_MODELS=google/gemini-2.5-flash-lite,google/gemini-2.5-flash
PORT=7476
```

### 4. Start the Application

**Option A: Start everything (recommended)**
```bash
# From the root directory
./launch-jeop3.command
```

This starts both:
- Web server at http://localhost:8345
- AI server at http://localhost:7476

**Option B: Start separately**
```bash
# Terminal 1: Web server
npm run dev

# Terminal 2: AI server
node server/index.js
```

### 5. Play!

Open http://localhost:8345 in your browser.

## Docker / Tailscale Mode

Docker mode builds the React app and serves the static frontend plus AI API from one Express server on port `10005`.

```bash
cp .env.example .env
# edit .env with OPENROUTER_API_KEY and optional YTV2_API_SECRET

./scripts/docker-build.sh
./scripts/docker-start.sh
```

URLs:

- Local: http://localhost:10005
- Tailscale HTTP: http://marks-macbook-pro-2.tail9e123c.ts.net:10005

Docker Compose reads root `.env`, then overrides Docker-only runtime values:

- `PORT=10005`
- `NODE_ENV=production`
- `AI_PUBLIC_API_BASE_URL=/api`
- `OLLAMA_MODELS=""` so Ollama is not advertised on the i9 MacBook
- `SOURCE_PARSER_BASE_URL=http://host.docker.internal:6453` so the container can call the YTV2 parser running on the host

Useful commands:

```bash
./scripts/docker-logs.sh
./scripts/docker-stop.sh
```

Target-machine checks:

```bash
curl http://localhost:10005/api/health
curl -X POST http://localhost:10005/api/fetch-article \
  -H 'Content-Type: application/json' \
  -d '{"url":"https://en.wikipedia.org/wiki/California"}'
```

HTTPS on the Tailscale hostname requires Tailscale Serve or another TLS proxy. Docker port publishing alone provides HTTP.

## Game Modes

### Manual Mode (No AI Required)
- Play the built-in "Science & Nature" game
- Create games manually using the editor
- Import game files shared by others

### AI Mode (Requires API Key)
- Generate games automatically with AI
- Choose themes and difficulty levels
- AI creates categories, clues, and answers
- Generate team names and enhance content

### Local AI Mode (Optional)
- Install [Ollama](https://ollama.com)
- Pull a model: `ollama pull gemma3:12b`
- Configure in `.env`:
  ```bash
  OLLAMA_BASE_URL=http://localhost:11434/api/chat
  OLLAMA_MODELS=gemma3:12b
  ```

## Troubleshooting

### AI Features Not Working

**Check if AI server is running:**
- You should see: `🪄 Jeop3 AI Server running on http://localhost:7476`
- If not, start it: `node server/index.js`

**Check your API key:**
- Verify `OPENROUTER_API_KEY` is set in `.env`
- Get a free key at [openrouter.ai/keys](https://openrouter.ai/keys)

**Console errors?**
- Open browser DevTools (Cmd+Option+I)
- Check for connection errors to `localhost:7476`
- Make sure AI server is running on port 7476

### Port Already in Use

**If port 8345 is taken:**
```bash
# Find what's using the port
lsof -ti:8345
# Kill it
lsof -ti:8345 | xargs kill -9
```

**If port 7476 is taken:**
```bash
lsof -ti:7476 | xargs kill -9
```

### Icons Not Showing

Icons come from the [Thiings collection](https://www.thiings.co/things). For local
development, link your extracted collection into the app (from the project root):

```bash
ln -s "$HOME/projects/icons" public/icons
```

Replace the source path if your collection is stored elsewhere. Each resolution
needs `size-128`, `size-256`, `size-512`, or `size-1024`, containing `meta.json`
and an `images/` directory. The metadata must include the collection's `items`
array with image filenames. Reload the app after restoring the link.

The local link is gitignored. Vite copies public assets when building locally;
production can instead use the hosted collection through `VITE_ICON_BASE_URL`.
The app prefers 512px by default and falls back to the 1024px collection when the
selected resolution is absent. A single `size-1024` folder is sufficient; smaller
copies are optional. Search reads `meta.json` directly (title, slug, tags and
category); no separate `icons.json` index is needed. The `images/` folder is still
required to display results. Games also work without icons.

Automatic icons appear only after revealing the answer. Toggle **Show answer
icons** in Table settings or the in-game settings menu; the preference is saved
on this device. Matching prioritizes answer names and uses the clue/category as
supporting context. Weak matches are omitted.

## Project Structure

```
jeop3/
├── src/
│   ├── components/      # React components
│   ├── lib/             # Utilities (AI, storage, themes)
│   └── styles/          # CSS files
├── server/              # AI server (Express)
│   ├── index.js         # Main server file
│   └── .env.example     # Environment template
├── public/
│   ├── games/           # Game JSON files
│   └── icons/           # Icon pack (optional)
└── docs/                # Documentation
```

## Importing/Exporting Games

**Export:**
- Main menu → Click game → Export button
- Saves as JSON file

**Import:**
- Main menu → Create Game → Import from File
- Select a JSON game file

## AI Models

Jeop3 supports multiple AI models:

| Model | Speed | Quality | Cost |
|-------|-------|---------|------|
| google/gemini-2.5-flash-lite | ⚡⚡⚡ | ⭐⭐⭐⭐ | 💰 |
| google/gemini-2.5-flash | ⚡⚡⚡ | ⭐⭐⭐⭐⭐ | 💰💰 |
| z-ai/glm-4.7 | ⚡⚡ | ⭐⭐⭐⭐ | 💰💰 |
| x-ai/grok-4.1-fast | ⚡⚡ | ⭐⭐⭐⭐ | 💰💰 |

See `docs/AI-MODEL-COMPARISON.md` for detailed comparison.

## Keyboard Shortcuts

During gameplay:
- `I` - Toggle icon keywords
- `←/→` - Navigate between matched icons

## License

This project is for personal use. Please respect AI service terms of use.

## Support

For issues or questions:
1. Check the Troubleshooting section above
2. Review AI model comparison in `docs/AI-MODEL-COMPARISON.md`
3. Check browser console for errors

Enjoy the game! 🎮
