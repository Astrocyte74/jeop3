#!/bin/bash

# Jeop3 Launcher
# Double-click this file to start the Jeop3 game (with AI server)

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

WEB_PORT=8345
AI_PORT=7476

echo "============================================"
echo "  Jeop3 - Jeopardy Game"
echo "============================================"
echo ""

# ============================================
# Startup Mode Selection
# ============================================
#
# This prompt lets you choose between two startup modes:
#
# 1. NORMAL MODE (default) - No prompt/timeout
#    - Uses local Node.js AI server (no auth required)
#    - Best for daily development and quick testing
#    - Just wait 3 seconds or press Enter
#
# 2. AUTH TEST MODE - Press 'A' within 3 seconds
#    - Uses Python backend with Clerk auth (same as Render)
#    - Tests the full authentication flow
#    - Requires: Python backend running on port 7476
#    - Requires: SKIP_AUTH setting in .env (controls auth bypass)
#
# To start in AUTH TEST MODE:
#   - Press 'A' or 'a' within 3 seconds
#   - Make sure Python backend is running first:
#     cd /Users/markdarby/projects/YTV2-Dashboard && python server.py
#   - Frontend will connect to Python backend instead of Node.js
#
# ============================================

USE_AUTH_MODE=""
echo "Startup Mode Selection (3 seconds):"
echo "  Press 'A' for Auth Test Mode (Python backend + Clerk)"
echo "  Or wait for Normal Mode (Node.js server, no auth)"
echo ""

# Read with timeout (bash 4+)
if read -t 3 -n 1 -r response 2>/dev/null; then
    if [[ "$response" =~ [Aa] ]]; then
        USE_AUTH_MODE="true"
        echo ""
        echo "✓ AUTH TEST MODE selected"
        echo "  Make sure Python backend is running on port $AI_PORT"
        echo "  (cd /Users/markdarby/projects/YTV2-Dashboard && python server.py)"
        echo ""
        sleep 2
    else
        echo ""
        echo "✓ NORMAL MODE selected (Node.js server)"
        echo ""
    fi
else
    echo ""
    echo "✓ NORMAL MODE selected (timeout - Node.js server)"
    echo ""
fi

# ============================================
# Check for Node.js
# ============================================

if ! command -v node &> /dev/null; then
    echo "ERROR: Node.js is required but not found."
    echo "Please install Node.js from https://nodejs.org and try again."
    read -p "Press Enter to exit..."
    exit 1
fi

echo "Using Node.js: $(node --version)"
echo ""

# ============================================
# Install dependencies if needed
# ============================================

if [ ! -d "node_modules" ]; then
    echo "First time setup - installing dependencies..."
    npm install
    if [ $? -ne 0 ]; then
        echo "ERROR: npm install failed"
        read -p "Press Enter to exit..."
        exit 1
    fi
    echo ""
fi

# ============================================
# Check for server dependencies
# ============================================

if [ ! -d "server/node_modules" ]; then
    echo "Installing AI server dependencies..."
    (cd server && npm install)
    if [ $? -ne 0 ]; then
        echo "ERROR: Server npm install failed"
        read -p "Press Enter to exit..."
        exit 1
    fi
    echo ""
fi

# ============================================
# Function to cleanup processes on exit
# ============================================

cleanup() {
    echo ""
    echo "Stopping Jeop3..."

    # Kill AI server
    if [ -n "$AI_PID" ]; then
        kill $AI_PID 2>/dev/null
        wait $AI_PID 2>/dev/null
    fi

    # Kill dev server
    if [ -n "$WEB_PID" ]; then
        kill $WEB_PID 2>/dev/null
        wait $WEB_PID 2>/dev/null
    fi

    exit 0
}

trap cleanup INT TERM EXIT

# ============================================
# Start AI Server
# ============================================
#
# In NORMAL MODE: Starts local Node.js AI server
# In AUTH TEST MODE: Skips server startup (Python backend handles it)
# ============================================

if [ "$USE_AUTH_MODE" != "true" ]; then
    echo "============================================"
    echo "  Starting AI Server (port $AI_PORT)"
    echo "============================================"
    echo ""

    # Kill any existing AI server
    echo "Checking for existing AI server on port $AI_PORT..."
    ai_pid=$(lsof -ti:$AI_PORT 2>/dev/null)
    if [ -n "$ai_pid" ]; then
        echo "  Stopping existing AI server (PID: $ai_pid)..."
        kill $ai_pid 2>/dev/null
        sleep 0.5
        if lsof -ti:$AI_PORT >/dev/null 2>&1; then
            kill -9 $ai_pid 2>/dev/null
        fi
        echo "  Port $AI_PORT cleared."
        sleep 1
    else
        echo "  Port $AI_PORT is available."
    fi
    echo ""

    # Start AI server in background
    cd server
    node index.js > ../ai-server.log 2>&1 &
    AI_PID=$!
    cd ..

    # Wait a moment for AI server to start
    sleep 2

    # Check if AI server started successfully
    if ! kill -0 $AI_PID 2>/dev/null; then
        echo "ERROR: AI server failed to start. Check ai-server.log for details."
        read -p "Press Enter to exit..."
        exit 1
    fi

    echo "  AI Server started (PID: $AI_PID)"
    echo ""
else
    # Auth Test Mode - Skip Node.js server startup
    echo "============================================"
    echo "  AUTH TEST MODE"
    echo "============================================"
    echo ""
    echo "  Node.js AI server skipped (using Python backend)"
    echo ""
    echo "  Make sure Python backend is running:"
    echo "    cd /Users/markdarby/projects/YTV2-Dashboard"
    echo "    python server.py"
    echo ""
    echo "  And check your .env for SKIP_AUTH setting:"
    echo "    SKIP_AUTH=true   # Auth disabled (dev mode)"
    echo "    # SKIP_AUTH=true  # Auth enabled (test flow)"
    echo ""
    AI_PID=""  # No Node.js server to manage
fi

# ============================================
# Start Web Dev Server
# ============================================

echo "============================================"
echo "  Starting Web Server (port $WEB_PORT)"
echo "============================================"
echo ""

# Kill any existing web server
echo "Checking for existing web server on port $WEB_PORT..."
web_pid=$(lsof -ti:$WEB_PORT 2>/dev/null)
if [ -n "$web_pid" ]; then
    echo "  Stopping existing web server (PID: $web_pid)..."
    kill $web_pid 2>/dev/null
    sleep 0.5
    if lsof -ti:$WEB_PORT >/dev/null 2>&1; then
        kill -9 $web_pid 2>/dev/null
    fi
    echo "  Port $WEB_PORT cleared."
    sleep 1
else
    echo "  Port $WEB_PORT is available."
fi
echo ""

echo "============================================"
echo "  Jeop3 is Running!"
echo "============================================"
echo ""
echo "  🌐 Web:  http://localhost:${WEB_PORT}"
echo "  🪄 AI:   http://localhost:${AI_PORT}"
echo ""
echo "(Close this window or press Ctrl+C to stop both servers)"
echo ""

# Start dev server in foreground (this keeps script alive)
npm run dev &
WEB_PID=$!

# Wait for web server process
wait $WEB_PID 2>/dev/null
