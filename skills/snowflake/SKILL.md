---
name: snowflake
description: >
  Query and manage a Snowflake cloud data warehouse — run SQL, explore schemas,
  manage warehouses, and load data. Uses the SnowSQL CLI.
metadata:
  openclaw:
    requires:
      bins: [clawdata]
    primaryEnv: SNOWSQL_ACCOUNT
    tags: [database, snowflake, sql, cloud, warehouse]
---

# Snowflake

You can query and manage a Snowflake cloud warehouse using the **`snowsql`** CLI.
Use this when the user asks about cloud-hosted data, Snowflake tables, or needs to run SQL on Snowflake.

> For local DuckDB queries, use the **duckdb** skill. For dbt transformations, use the **dbt** skill.

## Commands

All commands use `snowsql`. The connection is configured via `~/.snowsql/config` or environment variables.

| Task | Command |
|------|---------|
| Run a query | `snowsql -q "SELECT …"` |
| Run from file | `snowsql -f query.sql` |
| List databases | `snowsql -q "SHOW DATABASES"` |
| List schemas | `snowsql -q "SHOW SCHEMAS IN DATABASE <db>"` |
| List tables | `snowsql -q "SHOW TABLES IN SCHEMA <db>.<schema>"` |
| Describe table | `snowsql -q "DESCRIBE TABLE <db>.<schema>.<table>"` |
| List warehouses | `snowsql -q "SHOW WAREHOUSES"` |
| Resume warehouse | `snowsql -q "ALTER WAREHOUSE <wh> RESUME"` |
| Suspend warehouse | `snowsql -q "ALTER WAREHOUSE <wh> SUSPEND"` |
| Load from stage | `snowsql -q "COPY INTO <table> FROM @<stage>"` |
| Upload to stage | `snowsql -q "PUT file://<path> @<stage>"` |

### Output options

| Flag | Effect |
|------|--------|
| `-o output_format=json` | JSON output |
| `-o output_format=csv` | CSV output |
| `-o header=false` | Suppress column headers |
| `-o friendly=false` | Machine-readable output |

## When to use

- User asks about Snowflake data → `snowsql -q "SHOW TABLES IN …"`
- User wants to query Snowflake → `snowsql -q "SELECT …"`
- User asks about warehouse costs → `snowsql -q "SHOW WAREHOUSES"` + check credits
- User wants to load data into Snowflake → `PUT` to stage, then `COPY INTO`
- User wants to check schema → `snowsql -q "DESCRIBE TABLE …"`

## Connection

SnowSQL reads credentials from `~/.snowsql/config` or these environment variables:

| Env var | Purpose |
|---------|---------|
| `SNOWSQL_ACCOUNT` | Account identifier (e.g. `xy12345.us-east-1`) |
| `SNOWSQL_USER` | Username |
| `SNOWSQL_PWD` | Password |
| `SNOWSQL_DATABASE` | Default database |
| `SNOWSQL_SCHEMA` | Default schema |
| `SNOWSQL_WAREHOUSE` | Default warehouse |
| `SNOWSQL_ROLE` | Default role |

You can also pass connection params inline:

```bash
snowsql -a <account> -u <user> -d <database> -s <schema> -w <warehouse> -q "SELECT 1"
```

## Examples

```bash
# Check connection
snowsql -q "SELECT CURRENT_USER(), CURRENT_ROLE(), CURRENT_WAREHOUSE()"

# Explore tables
snowsql -q "SHOW TABLES IN SCHEMA analytics.public"
snowsql -q "DESCRIBE TABLE analytics.public.orders"

# Query with JSON output
snowsql -q "SELECT * FROM orders LIMIT 5" -o output_format=json

# Load a local CSV
snowsql -q "PUT file://./data/sales.csv @my_stage"
snowsql -q "COPY INTO sales FROM @my_stage FILE_FORMAT=(TYPE=CSV SKIP_HEADER=1)"
```

## Error recovery

| Problem | Fix |
|---------|-----|
| `snowsql: command not found` | Install: `brew install --cask snowflake-snowsql` or [download](https://docs.snowflake.com/en/user-guide/snowsql-install-config) |
| Auth failure | Check `~/.snowsql/config` or `SNOWSQL_*` env vars |
| Warehouse suspended | `snowsql -q "ALTER WAREHOUSE <wh> RESUME"` |
| Database not found | `snowsql -q "SHOW DATABASES"` to see available databases |

## Notes

- SnowSQL exits with code 1 on failure
- Use `-o friendly=false -o header=false` for cleanest machine-parseable output
- For large queries, write SQL to a file and use `snowsql -f file.sql`
- Snowflake charges per-second for active warehouses — suspend when done
