---
name: databricks
description: "Work with Databricks -- run SQL via curl, manage clusters, warehouses, Unity Catalog, jobs, and pipelines."
metadata: {"openclaw": {"emoji": "🧱", "requires": {"bins": ["databricks"]}, "tags": ["databricks", "spark", "sql", "cloud", "data", "lakehouse", "delta", "unity-catalog"]}}
---

# Databricks Skill

## RULES -- You MUST follow these

1. Run `source ~/.zshrc` as the FIRST line in EVERY shell command
2. Environment variables `DATABRICKS_HOST`, `DATABRICKS_TOKEN`, `DATABRICKS_WAREHOUSE_ID` are set in `~/.zshrc` -- use them directly
3. NEVER ask the user for credentials, host, token, or warehouse ID
4. NEVER use placeholders like `<your-token>` -- always use `${DATABRICKS_HOST}` etc.
5. To run SQL: use `curl` with the SQL Statement API (pattern below). Do NOT use `databricks sql` -- it does not work.
6. Execute commands immediately. Do not ask "would you like me to run this?"
7. If the user says "create a table" or "run SQL" -- build the curl command and run it right away
8. If the user does not specify a schema, use `default`

## How to Run SQL -- Use This Exact Pattern

```bash
source ~/.zshrc
curl -s -X POST "${DATABRICKS_HOST}/api/2.0/sql/statements" \
  -H "Authorization: Bearer ${DATABRICKS_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "warehouse_id": "'"${DATABRICKS_WAREHOUSE_ID}"'",
    "statement": "YOUR_SQL_HERE",
    "wait_timeout": "30s",
    "disposition": "INLINE"
  }' | jq '{state: .status.state, data: .result.data_array}'
```

Replace `YOUR_SQL_HERE` with the actual SQL. Always pipe through `jq`.

## Example: "Create a dummy table"

Step 1 -- create table:
```bash
source ~/.zshrc
curl -s -X POST "${DATABRICKS_HOST}/api/2.0/sql/statements" \
  -H "Authorization: Bearer ${DATABRICKS_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{"warehouse_id":"'"${DATABRICKS_WAREHOUSE_ID}"'","statement":"CREATE TABLE IF NOT EXISTS default.test_customers (id INT, name STRING, email STRING, created_at TIMESTAMP) USING DELTA","wait_timeout":"30s","disposition":"INLINE"}' | jq '.status.state'
```

Step 2 -- insert data:
```bash
source ~/.zshrc
curl -s -X POST "${DATABRICKS_HOST}/api/2.0/sql/statements" \
  -H "Authorization: Bearer ${DATABRICKS_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{"warehouse_id":"'"${DATABRICKS_WAREHOUSE_ID}"'","statement":"INSERT INTO default.test_customers VALUES (1, '"'"'Alice'"'"', '"'"'alice@test.com'"'"', current_timestamp()), (2, '"'"'Bob'"'"', '"'"'bob@test.com'"'"', current_timestamp()), (3, '"'"'Carol'"'"', '"'"'carol@test.com'"'"', current_timestamp())","wait_timeout":"30s","disposition":"INLINE"}' | jq '.status.state'
```

Step 3 -- verify:
```bash
source ~/.zshrc
curl -s -X POST "${DATABRICKS_HOST}/api/2.0/sql/statements" \
  -H "Authorization: Bearer ${DATABRICKS_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{"warehouse_id":"'"${DATABRICKS_WAREHOUSE_ID}"'","statement":"SELECT * FROM default.test_customers","wait_timeout":"30s","disposition":"INLINE"}' | jq '.result.data_array'
```

## Useful SQL Patterns

- Show tables: `"statement": "SHOW TABLES IN default"`
- Describe table: `"statement": "DESCRIBE TABLE default.my_table"`
- Row count: `"statement": "SELECT COUNT(*) FROM default.my_table"` then `| jq '.result.data_array[0][0]'`
- Column names: `| jq '[.manifest.schema.columns[].name]'`

## Verify Environment

```bash
source ~/.zshrc
echo "HOST=${DATABRICKS_HOST} WAREHOUSE=${DATABRICKS_WAREHOUSE_ID} TOKEN=$([ -n \"${DATABRICKS_TOKEN}\" ] && echo set || echo MISSING)"
```

## Databricks CLI Reference

- Clusters: `databricks clusters list --output JSON` / `start --cluster-id ID` / `delete --cluster-id ID`
- Warehouses: `databricks sql warehouses list --output JSON` / `start $DATABRICKS_WAREHOUSE_ID` / `stop $DATABRICKS_WAREHOUSE_ID`
- Workspace: `databricks workspace ls /path` / `import local remote --language PYTHON`
- Unity Catalog: `databricks unity-catalog catalogs list` / `schemas list --catalog-name CAT` / `tables list --catalog-name CAT --schema-name SCH`
- Jobs: `databricks jobs list --output JSON` / `run-now --job-id ID` / `create --json @file.json`
- Pipelines: `databricks pipelines list --output JSON` / `start-update --pipeline-id ID`
- Secrets: `databricks secrets list-scopes` / `put-secret --scope S --key K --string-value V`
- Volumes: `databricks fs ls dbfs:/Volumes/catalog/schema/volume/` / `cp local dbfs:/path`

## Best Practices

- Always `source ~/.zshrc` first -- never skip this
- Use curl + SQL Statement API for all SQL (not `databricks sql`)
- Use Delta format, default schema, jq for output
- Check warehouse state: `databricks sql warehouses get $DATABRICKS_WAREHOUSE_ID --output JSON | jq -r '.state'`
