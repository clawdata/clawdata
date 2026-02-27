#!/bin/bash
set -e

# Run onboarding if not already done (creates ~/.openclaw/openclaw.json)
if [ ! -f /root/.openclaw/openclaw.json ]; then
    echo "Running OpenClaw onboarding..."
    openclaw onboard --non-interactive --accept-risk || true
fi

# Start the FastAPI server
exec uvicorn app.main:app --host 0.0.0.0 --port 8000
