#!/bin/bash
set -euo pipefail

# suppress Node.js experimental warnings
export NODE_NO_WARNINGS=1

echo "OpenClaw Data Skills — Setup"
echo "============================="
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
  echo "✓ Dependencies already installed, skipping"
else
  echo "Installing dependencies …"
  npm install --silent 2>&1 | grep -v ExperimentalWarning || true
  echo "✓ Dependencies installed"
fi
npm link --silent 2>&1 | grep -v ExperimentalWarning || true
echo "✓ clawdata CLI ready"

# ── skill selection + doctor ────────────────────────────────────────

echo ""
if [ -t 0 ]; then
  clawdata setup
else
  clawdata setup --yes
fi

echo ""
echo "You're all set! Here are some things to try:"
echo ""

# read saved skills config
CONFIG=".clawdata/skills.json"
skills=""
if [ -f "$CONFIG" ]; then
  skills=$(cat "$CONFIG")
fi

has_skill() { echo "$skills" | grep -q "\"$1\""; }

if has_skill duckdb; then
  echo "  clawdata data ingest-all     Load CSV files into DuckDB"
  echo '  clawdata db query "SELECT * FROM raw_customers LIMIT 5"'
  echo ""
fi

if has_skill dbt; then
  echo "  clawdata dbt run             Run dbt transformations"
  echo "  clawdata dbt test            Validate data with dbt tests"
  echo ""
fi

if has_skill airflow; then
  echo "  clawdata status              Check running tasks"
  echo ""
fi

echo "  clawdata doctor              Check your setup"
echo "  clawdata skills              Add or remove skills"
echo ""
echo "To use with OpenClaw:"
echo "  openclaw tui                 Start chatting — your data skills are ready"
echo "  openclaw                     List OpenClaw commands"
