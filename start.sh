#!/usr/bin/env bash
# One-command launcher. Auto-detects Docker; falls back to host mode if not
# running. Installs deps on first run. Stops cleanly with Ctrl-C.
set -euo pipefail
cd "$(dirname "$0")"

# Use bundled Node if system node is missing (Playwright's cached binary
# works fine as a standalone runtime — no system install required).
if ! command -v node >/dev/null 2>&1; then
  PLAYWRIGHT_NODE="/Users/naramalawar36/Library/Caches/ms-playwright-go/1.50.1"
  if [[ -x "$PLAYWRIGHT_NODE/node" ]]; then
    export PATH="$PLAYWRIGHT_NODE:$PATH"
  else
    echo "❌ Node.js not installed. Install from https://nodejs.org or run: brew install node"
    exit 1
  fi
fi

# Install deps on first run
if [[ ! -d node_modules ]]; then
  echo "📦 First run — installing dependencies…"
  if command -v npm >/dev/null 2>&1; then
    npm install --no-audit --no-fund --silent
  else
    node /tmp/npm-bootstrap/package/bin/npm-cli.js install --no-audit --no-fund --silent
  fi
fi

export PATH="$PWD/node_modules/.bin:$PATH"

# Pick execution mode: Docker if daemon is up, otherwise host mode
if docker info >/dev/null 2>&1; then
  echo "🐳 Docker detected — secure mode"
  if ! docker image inspect sandbox-runner:latest >/dev/null 2>&1; then
    echo "🔨 Building sandbox-runner image (one-time, ~2 min)…"
    docker build -t sandbox-runner:latest .
  fi
  unset SANDBOX_MODE
else
  echo "⚠️  Docker not running — falling back to HOST mode (dev only, unsafe for untrusted code)"
  export SANDBOX_MODE=host
fi

echo "🚀 Starting on http://localhost:4000 — Ctrl-C to stop"
exec node server.js
