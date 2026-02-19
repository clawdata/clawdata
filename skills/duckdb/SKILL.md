---
name: duckdb
description: >
  Query and explore a local DuckDB warehouse — list tables, inspect schemas,
  run SQL, ingest CSV/JSON/Parquet files. Uses the clawdata CLI.
metadata:
  openclaw:
    requires:
      bins: [clawdata]
    primaryEnv: DB_PATH
    tags: [database, duckdb, sql, query, data]
---

# DuckDB

You can query and explore a local DuckDB database using the **`clawdata`** CLI.
Use this whenever the user asks about data, wants to run SQL, or needs to load files.

> For data transformations, use the **dbt** skill. For Snowflake, use the **snowflake** skill.

## Commands

| Task | Command |
|------|---------|
| List data files | `clawdata data list` |
| Ingest one file | `clawdata data ingest <file> [table]` |
| Ingest all files | `clawdata data ingest-all` |
| Run SQL query | `clawdata db query "SELECT …"` |
| Execute DDL/DML | `clawdata db exec "CREATE TABLE …"` |
| Database info | `clawdata db info` |
| List all tables | `clawdata db tables` |
| Column schema | `clawdata db schema <table>` |

Append `--json` to any command for structured JSON output.

## When to use

- User asks "what data do I have?" → `clawdata db tables` then `clawdata db schema <table>`
- User asks to see sample data → `clawdata db query "SELECT * FROM <table> LIMIT 5"`
- User asks to load a file → `clawdata data ingest <file>`
- User asks a data question → write SQL and run with `clawdata db query "…"`
- User asks about row counts, aggregations, filters → write and run the SQL

## Examples

```bash
# See what's in the database
clawdata db tables
clawdata db schema sample_customers

# Sample rows
clawdata db query "SELECT * FROM sample_customers LIMIT 5"

# Aggregation
clawdata db query "SELECT country, COUNT(*) as n FROM sample_customers GROUP BY country"

# Load new data
clawdata data ingest sales_2024.csv
clawdata data ingest-all
```

## Notes

- Database: DuckDB at `data/warehouse.duckdb` (override with `DB_PATH` env var)
- DuckDB supports CSV, Parquet, and JSON natively
- All commands return plain text; add `--json` for machine-readable output
- Exit code 1 means failure — check stderr
