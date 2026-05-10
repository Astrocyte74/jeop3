#!/usr/bin/env bash
set -euo pipefail

# Add Docker to PATH (for macOS Docker Desktop)
export PATH="/Applications/Docker.app/Contents/Resources/bin:$PATH"

cd "$(dirname "$0")/.."

echo "Stopping Docker container..."
docker compose down

echo "Rebuilding Docker image..."
docker compose build

echo "Starting Docker container..."
docker compose up -d

echo "Waiting for server to be healthy..."
sleep 5

echo "✅ Jeop3 restarted with auth fix!"
echo "  Local:     http://localhost:10005"
echo "  Tailscale: http://marks-macbook-pro-2.tail9e123c.ts.net:10005"
