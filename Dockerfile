FROM node:22-slim AS base

# Install Python for dbt
RUN apt-get update && \
    apt-get install -y --no-install-recommends python3 python3-pip python3-venv && \
    rm -rf /var/lib/apt/lists/*

# Create a venv for dbt to avoid PEP 668 issues
RUN python3 -m venv /opt/dbt-venv
ENV PATH="/opt/dbt-venv/bin:$PATH"
RUN pip install --no-cache-dir dbt-core dbt-duckdb

WORKDIR /app

# Install Node.js dependencies
COPY package.json package-lock.json* ./
RUN npm ci --production=false

# Copy source and build
COPY tsconfig.json ./
COPY src/ src/
RUN npm run build

# Copy project files
COPY apps/ apps/
COPY data/ data/
COPY skills/ skills/

# Make CLI globally available inside container
RUN npm link

ENV NODE_NO_WARNINGS=1
ENV DB_PATH=/app/data/warehouse.duckdb
ENV DATA_FOLDER=/app/data/sample
ENV DBT_PROJECT_DIR=/app/apps/dbt
ENV DBT_PROFILES_DIR=/app/apps/dbt

ENTRYPOINT ["clawdata"]
CMD ["help"]
