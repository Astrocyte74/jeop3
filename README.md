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

- **Node.js** 18+ - [Download here](https://nodejs.org/)
- **npm** (comes with Node.js)
- **OpenRouter API Key** - Get one at [openrouter.ai/keys](https://openrouter.ai/keys) (for AI features)
- Optional: **Ollama** - For local AI models (not required)

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

### 3. Set Up AI Server (Optional but Recommended)

```bash
cd server
cp .env.example .env
```

Edit `server/.env` and add your OpenRouter API key:

```bash
OPENROUTER_API_KEY=sk-or-your-actual-key-here
OR_MODELS=google/gemini-2.5-flash-lite,google/gemini-2.5-flash
PORT=7476
```

### 4. Start the Application

**Option A: Start everything (recommended)**
```bash
# From the root directory
npm run dev
```

This starts both:
- Web server at http://localhost:8345
- AI server at http://localhost:7476

**Option B: Start separately**
```bash
# Terminal 1: Web server
npm run dev

# Terminal 2: AI server
cd server && npm start
```

### 5. Play!

Open http://localhost:8345 in your browser.

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
- Configure in `server/.env`:
  ```bash
  OLLAMA_BASE_URL=http://localhost:11434/api/chat
  OLLAMA_MODELS=gemma3:12b
  ```

## Troubleshooting

### AI Features Not Working

**Check if AI server is running:**
- You should see: `🪄 Jeop3 AI Server running on http://localhost:7476`
- If not, start it: `cd server && npm start`

**Check your API key:**
- Verify `OPENROUTER_API_KEY` is set in `server/.env`
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

Icons are loaded from the `/icons` directory. If they're missing:
- Make sure you're running from the project root
- Check that `/public/icons/size-256/meta.json` exists
- Or games will work fine with just text (no icons needed)

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
