#!/bin/bash
set -euo pipefail

export NODE_NO_WARNINGS=1

echo "ClawData — Setup"
echo "================"
echo ""

# ── prerequisites ───────────────────────────────────────────────────

fail=0

if ! command -v node &>/dev/null; then
  echo "✗ Node.js not found — install Node.js 22+: https://nodejs.org"
  fail=1
else
  echo "✓ Node.js $(node --version)"
fi

if ! command -v openclaw &>/dev/null; then
  echo ""
  echo "✗ OpenClaw not found"
  echo ""
  echo "  OpenClaw is required — this project is a skill pack for it."
  echo ""
  echo "  To install:"
  echo "    npm install -g openclaw@latest"
  echo "    openclaw onboard --install-daemon"
  echo ""
  echo "  Then re-run ./setup.sh"
  fail=1
else
  echo "✓ OpenClaw $(openclaw --version 2>/dev/null || echo "(installed)")"
fi

if ! command -v python3 &>/dev/null; then
  echo "○ Python not found — needed for dbt and airflow skills"
else
  echo "✓ Python $(python3 --version 2>&1 | awk '{print $2}')"
fi

if [ "$fail" -ne 0 ]; then
  echo ""
  echo "Fix the issues above, then re-run ./setup.sh"
  exit 1
fi

# ── install & build ─────────────────────────────────────────────────

echo ""
if [ -d "node_modules" ] && [ -f "build/cli.js" ]; then
  echo "✓ Dependencies already installed"
else
  echo "Installing dependencies …"
  npm install --silent 2>&1 | grep -v ExperimentalWarning || true
  echo "✓ Dependencies installed"
fi

# ── ensure userdata directory exists ────────────────────────────────

mkdir -p userdata/config

echo ""
echo "You're all set! Run 'clawdata mc' to launch Mission Control."
echo ""
echo "  clawdata mc               Launch Mission Control dashboard"
echo "  clawdata setup            Configure skills interactively"
echo "  clawdata doctor           Check your setup"
echo ""
echo "To use with OpenClaw:"
echo "  openclaw tui              Start chatting — your data skills are ready"
