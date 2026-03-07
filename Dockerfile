# ── Stage 1: Build ────────────────────────────────────────────────────
FROM python:3.11-slim AS builder

WORKDIR /app

# Install build deps
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    && rm -rf /var/lib/apt/lists/*

COPY pyproject.toml README.md ./
RUN pip install --no-cache-dir .

# ── Stage 2: Runtime ─────────────────────────────────────────────────
FROM python:3.11-slim

# Minimal runtime deps (OpenClaw gateway runs externally)
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy installed Python packages from builder
COPY --from=builder /usr/local/lib/python3.11/site-packages /usr/local/lib/python3.11/site-packages
COPY --from=builder /usr/local/bin /usr/local/bin

# Copy application code
COPY app/ ./app/
COPY migrations/ ./migrations/
COPY alembic.ini ./
COPY skills/ ./skills/
COPY templates/ ./templates/
COPY userdata/ ./userdata/

# Create directory for SQLite database
RUN mkdir -p /app/data

# Default environment
ENV CLAWDATA_ENV=production \
    CLAWDATA_DATABASE_URL=sqlite+aiosqlite:///./data/clawdata.db \
    CLAWDATA_OPENCLAW_GATEWAY_HOST=host.docker.internal \
    CLAWDATA_OPENCLAW_GATEWAY_PORT=18789

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD curl -f http://localhost:8000/health || exit 1

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
