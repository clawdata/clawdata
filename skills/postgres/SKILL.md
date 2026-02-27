---
name: postgres
description: "Query and manage PostgreSQL databases — run SQL, inspect schemas, manage tables, and perform database administration."
metadata: {"openclaw": {"emoji": "🐘", "requires": {"bins": ["psql"]}, "tags": ["database", "postgres", "sql", "query", "data"]}}
---

# PostgreSQL

You can query and manage PostgreSQL databases using the **`psql`** CLI.
Use this when the user asks about PostgreSQL tables, schemas, queries, or database administration.

## Connection

Connect using a connection string or individual parameters:

```bash
psql "postgresql://<user>:<password>@<host>:<port>/<database>"
```

Or use environment variables: `PGHOST`, `PGPORT`, `PGUSER`, `PGPASSWORD`, `PGDATABASE`.

## Commands

### List databases

```bash
psql -c "\l"
```

### List schemas

```bash
psql -d <database> -c "\dn"
```

### List tables in a schema

```bash
psql -d <database> -c "\dt <schema>.*"
```

### Describe a table

```bash
psql -d <database> -c "\d+ <schema>.<table>"
```

### Run a query

```bash
psql -d <database> -c "SELECT * FROM <schema>.<table> LIMIT 10;"
```

### Row count

```bash
psql -d <database> -c "SELECT COUNT(*) FROM <schema>.<table>;"
```

### Table sizes

```bash
psql -d <database> -c "SELECT schemaname, tablename, pg_size_pretty(pg_total_relation_size(schemaname || '.' || tablename)) AS size FROM pg_tables WHERE schemaname NOT IN ('pg_catalog', 'information_schema') ORDER BY pg_total_relation_size(schemaname || '.' || tablename) DESC LIMIT 20;"
```

### Active connections

```bash
psql -d <database> -c "SELECT pid, usename, application_name, state, query_start, query FROM pg_stat_activity WHERE state != 'idle' ORDER BY query_start;"
```

### Running queries

```bash
psql -d <database> -c "SELECT pid, now() - query_start AS duration, state, query FROM pg_stat_activity WHERE state = 'active' ORDER BY duration DESC;"
```

### Index usage

```bash
psql -d <database> -c "SELECT schemaname, tablename, indexname, idx_scan, idx_tup_read FROM pg_stat_user_indexes ORDER BY idx_scan DESC LIMIT 20;"
```

### Export query to CSV

```bash
psql -d <database> -c "\COPY (SELECT * FROM <table>) TO '<path/to/file.csv>' WITH CSV HEADER"
```

### Import CSV

```bash
psql -d <database> -c "\COPY <table> FROM '<path/to/file.csv>' WITH CSV HEADER"
```

## Best Practices

- Always specify a schema (avoid relying on `search_path`)
- Use `EXPLAIN ANALYZE` to understand query performance
- Create indexes on frequently filtered and joined columns
- Use connection pooling (PgBouncer) for production applications
- Set `statement_timeout` to prevent long-running queries
- Use `pg_dump` for backups: `pg_dump -Fc <database> > backup.dump`
