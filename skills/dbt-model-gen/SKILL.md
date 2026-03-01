---
name: dbt-model-gen
description: Generate dbt models across the medallion architecture (bronze, silver, gold, semantic) from source definitions using project templates.
metadata: {"openclaw": {"always": true}}
---

# dbt Model Generator

You generate dbt models following the project's medallion architecture conventions.

## Instructions

1. **Read the source definition** — check `templates/dbt/source.yml.j2` for the expected format.
2. **Choose the right layer**:
   - `bronze` — flatten raw JSON into typed columns, 1:1 with source. Use `bronze_model.sql.j2`.
   - `silver` — normalise, deduplicate, apply SCD logic. Use `silver_scd_type1.sql.j2`, `silver_scd_type2.sql.j2`, or `silver_scd_type3.sql.j2`.
   - `gold` — build star-schema dimensions and facts. Use `gold_dimension.sql.j2` and `gold_fact.sql.j2`.
   - `semantic` — define dbt Semantic Layer models and metrics. Use `semantic_model.yml.j2` and `semantic_metric.yml.j2`.
   - `staging` — simple 1:1 source select (legacy). Use `staging_model.sql.j2`.
   - `intermediate` — joins, filters between layers. Use `intermediate_model.sql.j2`.
   - `mart` — aggregated metrics (legacy). Use `mart_model.sql.j2`.
3. **Use templates** — read from `templates/dbt/` and render with the appropriate variables.
4. **Generate schema YAML** — always create a corresponding `schema.yml` using `templates/dbt/schema.yml.j2`.
5. **Naming conventions**:
   - Bronze: `brz_<source>__<table>.sql`
   - Silver: `slv_<source>__<table>.sql`
   - Gold dimensions: `dim_<dimension>.sql`
   - Gold facts: `fct_<fact>.sql`
   - Semantic: `sem_<model_name>.yml`
   - Staging: `stg_<source>__<table>.sql`
   - Intermediate: `int_<description>.sql`
   - Mart: `fct_<fact>.sql` or `dim_<dimension>.sql`
6. **Write to the user's project** — place files in the correct dbt directory.

## Medallion Architecture

```
JSON Source → Bronze (flatten) → Silver (normalise/SCD) → Gold (dims & facts) → Semantic (metrics)
```

### Bronze Layer
Flatten raw JSON payloads into typed, columnar tables. Add metadata columns (`_dbt_loaded_at`, `_dbt_invocation_id`).

### Silver Layer
- **Type 1 SCD** — overwrite with latest value (e.g. customer email updates)
- **Type 2 SCD** — track history with `valid_from`, `valid_to`, `is_current` (e.g. address changes)
- **Type 3 SCD** — keep current + previous value columns (e.g. price changes)

### Gold Layer
- **Dimensions** — conformed descriptive entities with surrogate keys (`dim_customer`, `dim_product`)
- **Facts** — transactional grain with foreign keys to dimensions and computed measures (`fct_order_lines`)

### Semantic Layer
Define MetricFlow semantic models and metrics on top of gold tables. Joins dims and facts through entity relationships.

## Sample Data

JSON sample data for bronze flattening is available in `templates/sampledata/`:
- `sample_customers.json` — customer master data
- `sample_orders.json` — order line items
- `sample_payments.json` — payment transactions
- `sample_products.json` — product catalogue

## Example — Full Medallion Pipeline

User: "Create a medallion pipeline for customer orders"

Steps:
1. **Bronze**: Render `bronze_model.sql.j2` for each JSON source → `brz_raw__customers.sql`, `brz_raw__orders.sql`
2. **Silver**: Render `silver_scd_type1.sql.j2` for customers (overwrite) → `slv_raw__customers.sql`
3. **Gold**: Render `gold_dimension.sql.j2` → `dim_customer.sql`; render `gold_fact.sql.j2` → `fct_order_lines.sql`
4. **Semantic**: Render `semantic_model.yml.j2` → `sem_order_lines.yml` with entities, dims, measures
