---
name: snowflake
description: "Query and manage Snowflake data warehouses — run SQL, manage warehouses, inspect schemas, and control access."
metadata: {"openclaw": {"emoji": "❄️", "requires": {"bins": ["snow"]}, "tags": ["database", "snowflake", "sql", "cloud", "data", "warehouse"]}}
---

# Snowflake

You help query and manage Snowflake data warehouses using the **`snow`** (Snowflake CLI) or SQL commands.
Use this when the user asks about Snowflake tables, queries, warehouses, or administration.

## Authentication

Configure the Snowflake CLI:

```bash
snow connection add
```

Or set environment variables: `SNOWFLAKE_ACCOUNT`, `SNOWFLAKE_USER`, `SNOWFLAKE_PASSWORD`, `SNOWFLAKE_WAREHOUSE`, `SNOWFLAKE_DATABASE`, `SNOWFLAKE_SCHEMA`.

## Commands

### Execute SQL

```bash
snow sql -q "SELECT * FROM <database>.<schema>.<table> LIMIT 10"
```

### List databases

```bash
snow sql -q "SHOW DATABASES"
```

### List schemas

```bash
snow sql -q "SHOW SCHEMAS IN DATABASE <database>"
```

### List tables

```bash
snow sql -q "SHOW TABLES IN <database>.<schema>"
```

### Describe a table

```bash
snow sql -q "DESCRIBE TABLE <database>.<schema>.<table>"
```

### Row count

```bash
snow sql -q "SELECT COUNT(*) FROM <database>.<schema>.<table>"
```

### Warehouse management

#### List warehouses

```bash
snow sql -q "SHOW WAREHOUSES"
```

#### Resume a warehouse

```bash
snow sql -q "ALTER WAREHOUSE <warehouse> RESUME"
```

#### Suspend a warehouse

```bash
snow sql -q "ALTER WAREHOUSE <warehouse> SUSPEND"
```

#### Resize a warehouse

```bash
snow sql -q "ALTER WAREHOUSE <warehouse> SET WAREHOUSE_SIZE = 'MEDIUM'"
```

### Query history

```bash
snow sql -q "SELECT query_id, query_text, execution_status, total_elapsed_time/1000 AS seconds FROM TABLE(information_schema.query_history(dateadd('hours', -24, current_timestamp()), current_timestamp())) ORDER BY start_time DESC LIMIT 20"
```

### Storage usage

```bash
snow sql -q "SELECT table_catalog, table_schema, table_name, row_count, bytes/1024/1024 AS mb FROM information_schema.tables WHERE table_schema NOT IN ('INFORMATION_SCHEMA') ORDER BY bytes DESC NULLS LAST LIMIT 20"
```

### Load data from stage

```bash
snow sql -q "COPY INTO <table> FROM @<stage>/<path> FILE_FORMAT = (TYPE = 'CSV' SKIP_HEADER = 1)"
```

### Create a file format

```bash
snow sql -q "CREATE FILE FORMAT IF NOT EXISTS my_csv_format TYPE = 'CSV' FIELD_DELIMITER = ',' SKIP_HEADER = 1 FIELD_OPTIONALLY_ENCLOSED_BY = '\"'"
```

## Best Practices

- Always set `AUTO_SUSPEND` on warehouses to avoid idle costs
- Use appropriate warehouse sizes — start small, scale up as needed
- Prefer `TRANSIENT` tables for staging/temporary data
- Use clustering keys on large tables filtered by specific columns
- Leverage Time Travel for recovering data (`AT`/`BEFORE` clauses)
- Use roles and grants for access control, not individual user permissions
- Monitor costs via `SNOWFLAKE.ACCOUNT_USAGE.WAREHOUSE_METERING_HISTORY`
