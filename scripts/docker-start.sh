#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

docker compose up -d

echo "Jeop3 Docker is starting:"
echo "  Local:     http://localhost:10005"
echo "  Tailscale: http://marks-macbook-pro-2.tail9e123c.ts.net:10005"
echo ""
echo "HTTPS requires Tailscale Serve or another TLS proxy."
