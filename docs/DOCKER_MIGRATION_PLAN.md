# Jeop3 Docker Migration Plan

## Overview

Migrate Jeop3 from a dual-server setup (Vite dev server + Express AI server) to a single Docker container that serves both the static frontend and AI API, accessible via Tailscale.

---

## Current Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  Development Setup                                          │
├─────────────────────────────────────────────────────────────┤
│  Frontend: Vite Dev Server     →  Port 8345                │
│  Backend:  Express AI Server    →  Port 7476                │
│  Launch:   launch-jeop3.command (starts both)              │
│                                                              │
│  Frontend calls: http://localhost:7476/api/*                │
└─────────────────────────────────────────────────────────────┘

Problems:
- Requires two processes to run
- Doesn't work over Tailscale (localhost references)
- Complex startup/shutdown
- Manual dependency management
```

---

## Target Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  Docker Container (jeop3)                                   │
├─────────────────────────────────────────────────────────────┤
│  Port 10005 (internal)                                      │
│                                                              │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  Node.js Express Server                              │   │
│  │                                                       │   │
│  │  GET  /          → dist/index.html (React app)       │   │
│  │  GET  /assets/*  → Static build assets               │   │
│  │  GET  /games/*   → Game JSON files                   │   │
│  │  GET  /api/health → Health check                     │   │
│  │  POST /api/ai/generate → AI generation               │   │
│  │                                                       │   │
│  │  Environment:                                         │   │
│  │  - OPENROUTER_API_KEY (from server/.env)             │   │
│  │  - OR_MODELS, OLLAMA_MODELS                          │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼ Port mapping 10005:10005
        http://marks-macbook-pro-2.tail9e123c.ts.net:10005
        or HTTPS via Tailscale Serve / reverse proxy

Tailscale Access: ✓ Full functionality (frontend + AI)

Note: Docker port publishing alone exposes HTTP. The `https://...ts.net`
URL requires Tailscale Serve or another TLS proxy in front of the container.
```

---

## Implementation Steps

### Phase 1: Server Modifications

**File:** `server/index.js`

| Change | Description | Lines |
|--------|-------------|-------|
| Add `path` import | For serving static files | Top of file |
| Add static middleware | Serve `../dist` folder | After CORS setup |
| Add SPA fallback | Redirect non-API routes to index.html | After routes |
| Add games folder | Serve game JSON files | With static files |
| Update CORS | Make CORS explicit for dev/external API use | CORS config |
| Add health check | Return frontend/runtime metadata too | Enhance /api/health |
| Add article route | Implement `/api/fetch-article` if URL sources must work | API routes |

**Code additions needed:**
```javascript
// 1. CommonJS imports
const path = require('path');

// 2. Parse CORS origins instead of passing a comma string directly
const corsOrigin = process.env.AI_CORS_ORIGIN
  ? process.env.AI_CORS_ORIGIN.split(',').map(origin => origin.trim()).filter(Boolean)
  : '*';

// 3. Serve static files after API middleware setup
app.use(express.static(path.join(__dirname, '../dist')));
app.use('/games', express.static(path.join(__dirname, '../public/games')));

// 4. SPA fallback that does not swallow missing API routes
app.get(/^\/(?!api\/).*/, (req, res) => {
  res.sendFile(path.join(__dirname, '../dist/index.html'));
});

// 5. Update /ai-config.js if frontend loads it
app.get('/ai-config.js', (req, res) => {
  res.setHeader('Content-Type', 'application/javascript');
  res.send(`window.AI_CONFIG = ${JSON.stringify({
    port: PORT,
    baseUrl: process.env.AI_PUBLIC_API_BASE_URL || '/api'
  })};`);
});
```

**Important:** The current frontend treats `localhost` as development mode and
defaults AI calls to `http://localhost:7476/api`. Docker served at
`http://localhost:10005` must either:
- update `src/lib/ai/service.ts` so `window.location.port === "10005"` uses `/api`, or
- load `/ai-config.js` in `index.html` and make `getAIApiBase()` honor
  `window.AI_CONFIG.baseUrl`.

Do not rely on CORS to paper over this. In Docker production, the frontend and
API should be same-origin.

### Phase 2: Docker Configuration

**New File:** `Dockerfile` (project root)
```dockerfile
# Multi-stage build
# Stage 1: Build React frontend
FROM node:22-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# Stage 2: Production server
FROM node:22-alpine
WORKDIR /app
# Copy built frontend
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/public ./public
# Install server dependencies
COPY server/package*.json ./server/
RUN cd server && npm ci --production
COPY server/index.js ./server/
EXPOSE 10005
CMD ["node", "server/index.js"]
```

**New File:** `docker-compose.yml` (project root)
```yaml
services:
  jeop3:
    build: .
    container_name: jeop3
    restart: unless-stopped
    ports:
      - "10005:10005"
    env_file:
      - server/.env
    environment:
      - PORT=10005
      - NODE_ENV=production
      - AI_CORS_ORIGIN=http://localhost:10005,http://127.0.0.1:10005,http://marks-macbook-pro-2.tail9e123c.ts.net:10005
      - AI_PUBLIC_API_BASE_URL=/api
      # OpenRouter is the default AI path for this MacBook.
      # Enable Ollama later by setting OLLAMA_MODELS and OLLAMA_BASE_URL.
      # On Docker Desktop for macOS:
      # - OLLAMA_BASE_URL=http://host.docker.internal:11434/api/chat
    volumes:
      - ./public/games:/app/public/games:ro
    healthcheck:
      test: ["CMD", "wget", "--quiet", "--tries=1", "--spider", "http://localhost:10005/api/health"]
      interval: 30s
      timeout: 10s
      retries: 3
```

**New File:** `.dockerignore`
```
node_modules
dist
.git
.gitignore
*.log
.env
*.env
server/.env
.env.save
docs
scripts
.DS_Store
```

### Phase 3: Environment Configuration

**File:** `server/.env` (verify only; do not change shared dev port)

| Variable | Value | Purpose |
|----------|-------|---------|
| OPENROUTER_API_KEY | (existing secret) | Default AI provider |
| OR_MODELS | (existing) | No change needed |
| PORT | Leave unset or 7476 | Preserve existing dev launcher |
| OLLAMA_MODELS | Prefer unset on i9 MacBook | Optional future local model support |
| OLLAMA_BASE_URL | Optional | Use `http://host.docker.internal:11434/api/chat` in Docker |

**Note:** Keep `OPENROUTER_API_KEY` and other secrets in `server/.env` - already gitignored.

**Ollama position:** Do not optimize the initial Docker migration around Ollama
on the i9 MacBook Pro. Treat OpenRouter as the production/default provider.
Keep Ollama configurable for a future, more capable host by documenting:

```env
OLLAMA_MODELS=llama3.1:8b
OLLAMA_BASE_URL=http://host.docker.internal:11434/api/chat
```

If `OLLAMA_MODELS` is unset, the UI should simply not offer Ollama models.

### Phase 3.5: Source Parser Integration (Optional)

**Architecture Decision:** Keep Jeop3 standalone. Do NOT make it a submodule of YTV2.
This ensures Jeop3 can move to a GPU machine later without untangling dependencies.

Instead, implement `/api/fetch-article` as a configurable proxy to YTV2's new `/api/source/parse` endpoint.

---

#### YTV2 Source Parse API

**Endpoint:** `POST /api/source/parse`

**Request:**
```json
{
  "url": "https://en.wikipedia.org/wiki/California",
  "maxChars": 50000,
  "timeoutSeconds": 45
}
```

**Response:**
```json
{
  "success": true,
  "url": "https://en.wikipedia.org/wiki/California",
  "canonicalUrl": "https://en.wikipedia.org/wiki/California",
  "title": "California",
  "source": "en.wikipedia.org",
  "sourceType": "web|youtube|reddit|pubmed|wikipedia",
  "textKind": "article|transcript|discussion|abstract",
  "text": "clean extracted readable text...",
  "truncated": false,
  "characterCount": 12345,
  "originalCharacterCount": 12345,
  "metadata": { "extractor": "web_extract", "extractorNotes": {} }
}
```

**Supported Source Types:**
- `youtube` → transcript
- `reddit` → discussion text
- `web` → cleaned article text
- `wikipedia` → cleaned article text
- `pubmed` → abstract

**Auth:** `Authorization: Bearer $YTV2_API_SECRET` (if configured)

**Note:** Collection sources (playlists, RSS feeds) return `UNSUPPORTED_SOURCE`.

---

#### Jeop3 Implementation

**File:** `server/index.js` (add new route)

```javascript
// Add after other API routes, before SPA fallback

// Source Parser Integration
const SOURCE_PARSER_BASE_URL = process.env.SOURCE_PARSER_BASE_URL;
const SOURCE_PARSER_TOKEN = process.env.SOURCE_PARSER_TOKEN;

app.post('/api/fetch-article', async (req, res) => {
  // If no parser configured, return clear error
  if (!SOURCE_PARSER_BASE_URL) {
    return res.status(501).json({
      error: 'Source parser not configured',
      message: 'URL import requires SOURCE_PARSER_BASE_URL to be set',
    });
  }

  try {
    const { url } = req.body;

    if (!url || typeof url !== 'string') {
      return res.status(400).json({
        error: 'Invalid request',
        message: 'URL is required',
      });
    }

    // Proxy to YTV2's /api/source/parse endpoint
    const parserUrl = new URL('/api/source/parse', SOURCE_PARSER_BASE_URL);

    const headers = { 'Content-Type': 'application/json' };
    if (SOURCE_PARSER_TOKEN) {
      headers['Authorization'] = `Bearer ${SOURCE_PARSER_TOKEN}`;
    }

    const response = await fetch(parserUrl.toString(), {
      method: 'POST',
      headers,
      body: JSON.stringify({
        url,
        maxChars: 200000,  // YTV2 max
        timeoutSeconds: 45
      }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: response.statusText }));
      return res.status(response.status).json(error);
    }

    const data = await response.json();

    // Transform YTV2 response to match Jeop3's expected format
    if (data.success && data.text) {
      res.json({
        success: true,
        text: data.text,
        truncated: data.truncated,
        // Optional metadata
        title: data.title,
        source: data.source,
        sourceType: data.sourceType,
      });
    } else {
      res.status(500).json({
        success: false,
        error: data.error || data.code || 'PARSE_FAILED',
        message: data.error || 'Failed to parse source',
      });
    }
  } catch (error) {
    console.error('Source parser error:', error.message);
    res.status(502).json({
      error: 'Source parser unavailable',
      message: error.message,
    });
  }
});
```

**File:** `docker-compose.yml` (add environment variable)

```yaml
services:
  jeop3:
    # ... existing config ...
    environment:
      # ... existing vars ...
      # Source Parser Integration (optional)
      # Point to YTV2's source parse API
      - SOURCE_PARSER_BASE_URL=http://marks-macbook-pro-2.tail9e123c.ts.net:10000
      # Auth token if YTV2 requires it (YTV2_API_SECRET)
      # - SOURCE_PARSER_TOKEN=your-ytv2-api-secret
```

**Benefits of this approach:**

| Aspect | Benefit |
|--------|---------|
| **Standalone** | Jeop3 remains independently deployable |
| **Reusable** | Leverages YTV2's mature parser without coupling |
| **Multi-source** | Supports YouTube, Reddit, Wikipedia, PubMed, web articles |
| **Future-proof** | Easy to swap parser (local service, other host) |
| **GPU-ready** | Jeop3 can move to GPU machine without YTV2 dependency |
| **Graceful degradation** | Returns 501/502 if parser unavailable, doesn't crash |

---

#### Testing YTV2 Endpoint

Before using in Jeop3, verify YTV2's endpoint is available:

```bash
# Check if YTV2 container needs rebuild
curl http://localhost:6453/ | jq .

# If /api/source/parse is NOT in endpoints list, rebuild YTV2:
cd ~/16projects/ytv2/dashboard16
docker compose restart

# Test the endpoint
curl -sS -X POST http://localhost:6453/api/source/parse \
  -H 'Content-Type: application/json' \
  -d '{"url":"https://en.wikipedia.org/wiki/California","maxChars":5000}' | jq .
```

**For future GPU machine deployment:**

```yaml
# On GPU machine, docker-compose.yml might look like:
services:
  jeop3:
    environment:
      # Use local OpenAI-compatible server instead of Ollama-specific
      - OPENAI_COMPATIBLE_BASE_URL=http://local-llm:8000/v1
      # Optional: run parser service locally or keep pointing to YTV2
      - SOURCE_PARSER_BASE_URL=http://marks-macbook-pro-2.tail9e123c.ts.net:10000
```

### Phase 4: Build & Launch Scripts

**New File:** `scripts/docker-build.sh`
```bash
#!/bin/bash
# Build Docker image for Jeop3
cd "$(dirname "$0")/.."
docker compose build
```

**New File:** `scripts/docker-start.sh`
```bash
#!/bin/bash
# Start Jeop3 Docker container
cd "$(dirname "$0")/.."
docker compose up -d
echo "Jeop3 starting at http://localhost:10005"
echo "Tailscale HTTP: http://marks-macbook-pro-2.tail9e123c.ts.net:10005"
echo "HTTPS requires Tailscale Serve or another TLS proxy."
```

**New File:** `scripts/docker-stop.sh`
```bash
#!/bin/bash
# Stop Jeop3 Docker container
cd "$(dirname "$0")/.."
docker compose down
echo "Jeop3 stopped"
```

**New File:** `scripts/docker-logs.sh`
```bash
#!/bin/bash
# View Jeop3 Docker logs
docker compose logs -f jeop3
```

**Update:** Keep `launch-jeop3.command` for development, add note about Docker.

### Phase 5: Project Hub Integration

**File:** `~/16projects/hub/projects.json` (add entry)

```json
{
  "name": "Jeop3",
  "icon": "🎯",
  "description": "AI-powered Jeopardy game with wizard, trivia snake, team scoring",
  "port": 10005,
  "type": "local",
  "path": "~/16projects/jeop3",
  "https": false
}
```

If Tailscale Serve is configured later, switch `"https"` to `true` and point
the hub entry at the served HTTPS URL.

### Phase 6: Development Workflow

**Development Mode (existing):**
```bash
./launch-jeop3.command
# Uses Vite dev server + local AI server
# Hot reload, fast iteration
```

**Production/Docker Mode (new):**
```bash
./scripts/docker-start.sh
# Single container, optimized build
# Accessible via Tailscale
```

---

## File Changes Summary

| File | Action | Description |
|------|--------|-------------|
| `server/index.js` | Modify | Add static file serving, SPA fallback, runtime config, optional article route |
| `src/lib/ai/service.ts` | Modify | Ensure Docker on localhost:10005 uses `/api`, not port 7476 |
| `index.html` | Modify if needed | Load `/ai-config.js` before the Vite bundle |
| `Dockerfile` | Create | Multi-stage build for frontend + server |
| `docker-compose.yml` | Create | Container configuration |
| `.dockerignore` | Create | Exclude unnecessary files from image |
| `scripts/docker-build.sh` | Create | Build script |
| `scripts/docker-start.sh` | Create | Start script |
| `scripts/docker-stop.sh` | Create | Stop script |
| `scripts/docker-logs.sh` | Create | Log viewing script |
| `launch-jeop3.command` | Update | Add note about Docker option |
| `README.md` | Update | Add Docker section |
| `~/16projects/hub/projects.json` | Update | Add Jeop3 entry |

---

## Migration Checklist

- [ ] **Phase 1:** Modify `server/index.js` for static file serving
- [ ] **Phase 2:** Update frontend AI base URL logic for same-origin Docker
- [ ] **Phase 3:** Create `Dockerfile`, `docker-compose.yml`, `.dockerignore`
- [ ] **Phase 3.5:** Implement `/api/fetch-article` proxy to YTV2 (optional)
- [ ] **Phase 4:** Verify `server/.env` configuration without changing dev port
- [ ] **Phase 5:** Create Docker helper scripts in `scripts/`
- [ ] **Phase 6:** Test Docker build locally
- [ ] **Phase 7:** Test Tailscale HTTP access from another device
- [ ] **Phase 8:** Configure Tailscale Serve if HTTPS is required
- [ ] **Phase 9:** Add to Project Hub
- [ ] **Phase 10:** Update documentation (README.md)
- [ ] **Phase 11:** Create backup of current working state
- [ ] **Phase 12:** Commit changes to git

---

## Testing Plan

### 1. Local Container Test
```bash
# Build and start
docker compose up --build

# Verify frontend loads
curl http://localhost:10005

# Verify AI API works
curl http://localhost:10005/api/health
```

### 2. Tailscale Access Test
```bash
# From another device on Tailscale
curl http://marks-macbook-pro-2.tail9e123c.ts.net:10005/api/health

# If Tailscale Serve / TLS proxy is configured
curl https://marks-macbook-pro-2.tail9e123c.ts.net/api/health
```

### 3. AI Generation Test
- Open game in browser
- Create new game with AI
- Verify categories generate correctly
- Verify the browser is calling `/api/ai/generate`, not `localhost:7476`

### 4. Game Persistence Test
- Create a custom game
- Refresh page
- Verify game loads from localStorage

### 5. Optional Feature Tests
- If URL source import is expected, test `/api/fetch-article`
- If icons are expected, verify `/icons/size-*/meta.json` or configured `VITE_ICON_BASE_URL`
- If Ollama is enabled on a future machine, test with `OLLAMA_BASE_URL`

---

## Rollback Plan

If issues arise:

1. **Quick rollback:**
   ```bash
   ./scripts/docker-stop.sh
   ./launch-jeop3.command  # Back to original setup
   ```

2. **Git rollback:**
   ```bash
   git checkout main  # Or commit before migration
   ```

3. **Keep both options:**
   - Development: `launch-jeop3.command`
   - Production: Docker
   - Both can coexist without conflict

---

## Open Questions (Resolved)

1. ~~**URL source fetching (/api/fetch-article):**~~ ✅ **RESOLVED** — Phase 3.5 implements
   a configurable proxy to YTV2's parser. Kept standalone for GPU machine future.

2. **Ollama integration:** ✅ **DECIDED** — Use OpenRouter as default on i9 MacBook.
   Ollama is optional future config via `OLLAMA_MODELS` and `OLLAMA_BASE_URL`.

3. **Icon service:** Uses local symlink at `/icons`. Container won't have this. Options:
   - Copy icons to `public/icons/`
   - External icon service URL
   - Graceful degradation (text only) — **recommended for initial version**

4. **Build frequency:** How often to rebuild image?
   - Manual rebuild when code changes (`docker compose up --build`)
   - Could add watch mode for development later

5. **Tailscale HTTPS:** Decide whether HTTP over Tailscale is acceptable or
   configure Tailscale Serve / reverse proxy for HTTPS.

6. **Port conflict:** Port 10004 was in use, switched to 10005 (confirmed available).

---

## Future: GPU Machine Deployment

This architecture is designed to support migrating Jeop3 to a GPU machine later
without re-architecting:

```yaml
# docker-compose.yml on GPU machine
services:
  jeop3:
    image: jeop3:latest
    ports:
      - "10005:10005"
    environment:
      # Use local OpenAI-compatible server (vLLM, llama.cpp, etc.)
      - OPENAI_COMPATIBLE_BASE_URL=http://local-llm:8000/v1
      - OPENAI_COMPATIBLE_MODEL=local-model-name
      # Keep OpenRouter as fallback
      - OPENROUTER_API_KEY=${OPENROUTER_API_KEY}
      # Optional: continue using YTV2's source parser remotely
      - SOURCE_PARSER_BASE_URL=http://marks-macbook-pro-2.tail9e123c.ts.net:10000

  local-llm:
    image: vllm/vllm-openai:latest
    ports:
      - "8000:8000"
    volumes:
      - ./models:/models
    command: --model /models/your-model.gguf
```

**Migration path:**
1. Build and tag current image: `docker build -t jeop3:latest .`
2. Export: `docker save jeop3:latest | gzip > jeop3.tar.gz`
3. Transfer to GPU machine
4. Import: `docker load < jeop3.tar.gz`
5. Update `docker-compose.yml` for local LLM
6. Start: `docker compose up -d`

---

## Time Estimate

| Phase | Estimated Time |
|-------|----------------|
| Phase 1: Server mods | 30 min |
| Phase 2: Docker files | 30 min |
| Phase 3: Environment | 10 min |
| Phase 3.5: Source parser | 30 min |
| Phase 4: Scripts | 20 min |
| Phase 5: Testing | 30 min |
| Phase 6: Hub integration | 10 min |
| Phase 7: Documentation | 20 min |
| **Total** | **~3 hours** |

---

## References

- YTV2 Docker setup: `~/16projects/ytv2/dashboard16/`
- YTV2 Source Parse API: `~/16projects/ytv2/backend/ytv2_api/main.py` (line 522)
- YTV2 Source Parse Models: `~/16projects/ytv2/backend/ytv2_api/models.py` (line 78)
- Tailscale ts-serve skill: `~/.openclaw/workspace/skills/ts-serve/`
- Project Hub: `~/16projects/hub/`
