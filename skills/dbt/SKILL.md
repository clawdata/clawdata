---
name: dbt
description: >
  Transform and model data with dbt — run models, execute tests,
  compile SQL, manage seeds, and generate docs. Uses the clawdata CLI.
metadata:
  openclaw:
    requires:
      bins: [clawdata]
    primaryEnv: DBT_PROJECT_DIR
    tags: [dbt, transformation, etl, data-engineering, modeling]
---

# dbt

You can build and manage dbt data transformations using the **`clawdata`** CLI.
Use this when the user wants to create, run, or test data models — not for ad-hoc queries.

> For querying the database directly, use the **duckdb** skill. For orchestration, use the **airflow** skill.

## Commands

| Task | Command |
|------|---------|
| Run all models | `clawdata dbt run` |
| Run specific models | `clawdata dbt run --models slv_customers gld_customer_analytics` |
| Run data quality tests | `clawdata dbt test` |
| Test specific models | `clawdata dbt test --models slv_orders` |
| Compile SQL (no run) | `clawdata dbt compile` |
| Load seed CSVs | `clawdata dbt seed` |
| Generate documentation | `clawdata dbt docs` |
| Debug dbt connection | `clawdata dbt debug` |
| List available models | `clawdata dbt models` |
| Health check | `clawdata doctor` |
| Task status | `clawdata status` |

Append `--json` to any command for structured JSON output.

## When to use

- User wants to transform data → `clawdata dbt run`
- User wants to validate data quality → `clawdata dbt test`
- User wants to create a new model → write the `.sql` file, then `clawdata dbt run`
- User asks about model lineage or available models → `clawdata dbt models`
- Something isn't working → `clawdata dbt debug`

## Creating new models

- **Bronze** models → `dbt/models/bronze/` (materialised as views — raw ingestion)
- **Silver** models → `dbt/models/silver/` (materialised as views — cleaned & validated)
- **Gold** models → `dbt/models/gold/` (materialised as tables — business aggregates)
- Update `dbt/models/schema.yml` to add tests and docs

Example silver model (`dbt/models/silver/slv_sales.sql`):

```sql
SELECT
    order_id,
    customer_id,
    amount::DECIMAL(10,2) AS amount,
    order_date::DATE      AS order_date
FROM {{ ref('brz_orders') }}
WHERE amount > 0
```

After creating models, run `clawdata dbt run` to build them.

## Typical workflow

1. Check existing models:
   ```bash
   clawdata dbt models
   ```

2. Run transformations:
   ```bash
   clawdata dbt run
   ```

3. Validate with tests:
   ```bash
   clawdata dbt test
   ```

4. If something fails, debug:
   ```bash
   clawdata dbt compile    # see the generated SQL
   clawdata dbt debug      # check connection
   ```

## Error recovery

| Problem | Fix |
|---------|-----|
| `dbt: command not found` | `pip install dbt-core dbt-duckdb` |
| `clawdata: command not found` | Rebuild: `cd clawdata && npm run build && npm link` |
| Connection error | `clawdata dbt debug` |
| Model compile error | `clawdata dbt compile` to see the SQL error, then fix the `.sql` file |

## Project structure

```
dbt/
├── dbt_project.yml    ← project config
├── profiles.yml       ← connection config (DuckDB default)
└── models/
    ├── schema.yml     ← tests & documentation
    ├── bronze/        ← views (raw data ingestion)
    ├── silver/        ← views (cleaned & validated)
    └── gold/          ← tables (business-ready aggregates)
```

## Notes

- dbt writes to the same DuckDB warehouse at `data/warehouse.duckdb`
- Staging models are views; mart models are tables
- After `dbt run`, query results via the **duckdb** skill
