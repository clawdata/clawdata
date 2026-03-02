#!/bin/bash
# ──────────────────────────────────────────────────────────────────────
# start-tui.sh — Launch the OpenClaw TUI connected to the ClawData gateway
# ──────────────────────────────────────────────────────────────────────
set -euo pipefail

GATEWAY_HOST="${CLAWDATA_OPENCLAW_GATEWAY_HOST:-127.0.0.1}"
GATEWAY_PORT="${CLAWDATA_OPENCLAW_GATEWAY_PORT:-18789}"
GATEWAY_URL="ws://${GATEWAY_HOST}:${GATEWAY_PORT}"
CONFIG_FILE="${HOME}/.openclaw/openclaw.json"

# ── Resolve gateway token ───────────────────────────────────────────
# Priority: env var → .env file → openclaw.json config
resolve_token() {
    # 1. From environment variable
    if [[ -n "${CLAWDATA_OPENCLAW_GATEWAY_TOKEN:-}" ]]; then
        echo "$CLAWDATA_OPENCLAW_GATEWAY_TOKEN"
        return
    fi

    # 2. From .env file in project root
    SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
    ENV_FILE="${SCRIPT_DIR}/.env"
    if [[ -f "$ENV_FILE" ]]; then
        token=$(grep -E '^CLAWDATA_OPENCLAW_GATEWAY_TOKEN=' "$ENV_FILE" | cut -d'=' -f2- | tr -d '[:space:]')
        if [[ -n "$token" ]]; then
            echo "$token"
            return
        fi
    fi

    # 3. From openclaw.json config
    if [[ -f "$CONFIG_FILE" ]]; then
        token=$(python3 -c "
import json, sys
try:
    cfg = json.load(open('$CONFIG_FILE'))
    print(cfg.get('gateway',{}).get('auth',{}).get('token',''))
except Exception:
    pass
" 2>/dev/null)
        if [[ -n "$token" ]]; then
            echo "$token"
            return
        fi
    fi

    echo ""
}

# ── Ensure gateway is running ───────────────────────────────────────
if ! lsof -i ":${GATEWAY_PORT}" -sTCP:LISTEN >/dev/null 2>&1; then
    echo "⚠  Gateway not listening on port ${GATEWAY_PORT}."
    echo "   Starting gateway..."
    openclaw gateway --port "$GATEWAY_PORT" &
    GATEWAY_PID=$!

    # Wait for gateway to become ready
    for i in $(seq 1 15); do
        if lsof -i ":${GATEWAY_PORT}" -sTCP:LISTEN >/dev/null 2>&1; then
            echo "✓  Gateway started (pid=${GATEWAY_PID})"
            break
        fi
        sleep 1
    done

    if ! lsof -i ":${GATEWAY_PORT}" -sTCP:LISTEN >/dev/null 2>&1; then
        echo "✗  Gateway failed to start within 15s. Check logs: ~/.openclaw/gateway.log"
        exit 1
    fi
else
    echo "✓  Gateway already running on port ${GATEWAY_PORT}"
fi

# ── Resolve token and launch TUI ────────────────────────────────────
TOKEN=$(resolve_token)
AUTH_ARGS=()
if [[ -n "$TOKEN" ]]; then
    AUTH_ARGS+=(--token "$TOKEN")
fi

# ── Ensure device is paired ─────────────────────────────────────────
# The gateway requires device pairing even with a valid token.
# Auto-approve any pending request for this CLI so the TUI can connect.
if ! openclaw health "${AUTH_ARGS[@]}" >/dev/null 2>&1; then
    echo "⚠  Gateway returned pairing-required — approving this device..."
    openclaw devices approve --latest "${AUTH_ARGS[@]}" 2>/dev/null || true
    sleep 1
    if openclaw health "${AUTH_ARGS[@]}" >/dev/null 2>&1; then
        echo "✓  Device paired successfully"
    else
        echo "✗  Could not pair device. Run manually:"
        echo "   openclaw devices approve --latest ${AUTH_ARGS[*]}"
        exit 1
    fi
else
    echo "✓  Device paired and gateway healthy"
fi

# ── Launch TUI ──────────────────────────────────────────────────────
TUI_ARGS=(--url "$GATEWAY_URL" "${AUTH_ARGS[@]}")

# Use a fresh session by default to avoid loading stale heartbeat history.
# Override with: ./start-tui.sh --session main  (to rejoin the default session)
if [[ ! " $* " =~ " --session " ]]; then
    SESSION_KEY="tui-$(date +%Y%m%d-%H%M%S)"
    TUI_ARGS+=(--session "$SESSION_KEY")
    echo "📋 Session: ${SESSION_KEY}"
fi

# Pass through any extra arguments (e.g., --session, --message, --deliver)
TUI_ARGS+=("$@")

echo "🦞 Launching OpenClaw TUI → ${GATEWAY_URL}"
exec openclaw tui "${TUI_ARGS[@]}"
