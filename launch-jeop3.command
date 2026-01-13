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
