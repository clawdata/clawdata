---
name: postgres
description: >
  Query and manage PostgreSQL databases — run SQL, inspect schemas,
  load data, and manage connections.
metadata:
  openclaw:
    requires:
      bins: [clawdata]
    primaryEnv: POSTGRES_CONNECTION_STRING
    tags: [database, postgres, postgresql, sql, query]
---

# PostgreSQL

Query and manage PostgreSQL databases through the ClawData adapter.

## Commands

| Task | Command |
|------|---------|
| Connect | `clawdata connect add pg --type postgres --connection-string postgresql://...` |
| Query | `clawdata db query "SELECT ..." --profile pg` |
| List tables | `clawdata db tables --profile pg` |
| Schema | `clawdata db schema <table> --profile pg` |
| Export | `clawdata db export "SELECT ..." --profile pg -o data.csv` |

## Connection

```bash
# Add a Postgres connection profile
clawdata connect add prod-pg \
  --type postgres \
  --connection-string "postgresql://user:pass@host:5432/dbname"

# Use it
clawdata db tables --profile prod-pg
```

## When to use

- User asks to query a Postgres database → use `--profile` flag with postgres connection
- User wants to move data from Postgres to DuckDB → query + export + ingest
- User needs to inspect a remote database schema → `clawdata db schema --profile`

## Cross-database Workflows

```bash
# Export from Postgres
clawdata db export "SELECT * FROM users" --profile pg -o users.csv

# Load into DuckDB
clawdata data ingest users.csv users
```
