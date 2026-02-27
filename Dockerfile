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

# Node.js is required for the OpenClaw gateway
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl git lsof unzip \
    && curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && rm -rf /var/lib/apt/lists/*

# Install DuckDB CLI (required by the duckdb skill)
RUN ARCH=$(dpkg --print-architecture) && \
    curl -fsSL "https://github.com/duckdb/duckdb/releases/download/v1.4.4/duckdb_cli-linux-${ARCH}.zip" \
      -o /tmp/duckdb.zip && \
    unzip /tmp/duckdb.zip -d /usr/local/bin && \
    chmod +x /usr/local/bin/duckdb && \
    rm /tmp/duckdb.zip

# Pre-install OpenClaw (onboard runs at container startup since it needs a gateway)
RUN npm install -g openclaw

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
    CLAWDATA_OPENCLAW_GATEWAY_HOST=0.0.0.0 \
    CLAWDATA_OPENCLAW_GATEWAY_PORT=18789 \
    CLAWDATA_OPENCLAW_AUTO_START=true \
    CLAWDATA_OPENCLAW_AUTO_STOP=false \
    CLAWDATA_OPENCLAW_AUTO_INSTALL=true

EXPOSE 8000
EXPOSE 18789

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD curl -f http://localhost:8000/health || exit 1

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
