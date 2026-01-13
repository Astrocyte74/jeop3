#!/bin/bash

# Jeop3 Launcher
# Double-click this file to start the Jeop3 game

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

PORT=8345

echo "============================================"
echo "  Jeop3 - Jeopardy Game"
echo "============================================"
echo ""

# Kill any existing process on our port
echo "Checking for existing service on port $PORT..."
pid=$(lsof -ti:$PORT 2>/dev/null)
if [ -n "$pid" ]; then
    echo "  Stopping existing process (PID: $pid)..."
    kill $pid 2>/dev/null
    sleep 0.5
    # Force kill if still running
    if lsof -ti:$PORT >/dev/null 2>&1; then
        kill -9 $pid 2>/dev/null
    fi
    echo "  Port $PORT cleared."
    sleep 1
else
    echo "  Port $PORT is available."
fi
echo ""

# Check for Node.js
if ! command -v node &> /dev/null; then
    echo "ERROR: Node.js is required but not found."
    echo "Please install Node.js from https://nodejs.org and try again."
    read -p "Press Enter to exit..."
    exit 1
fi

echo "Using Node.js: $(node --version)"
echo ""

# Install dependencies if needed
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
# Start Dev Server
# ============================================

echo "============================================"
echo "  Starting Jeop3"
echo "============================================"
echo ""
echo "  Opening http://localhost:${PORT}"
echo ""
echo "(Close this window or press Ctrl+C to stop the server)"
echo ""

# Trap to clean up on exit
trap 'echo ""; echo "Stopping Jeop3..."; exit 0' INT TERM

# Start the dev server
npm run dev

# This line won't be reached due to trap, but keeps script alive
wait
