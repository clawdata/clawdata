---
name: dbt-model-gen
description: Generate dbt models (staging, intermediate, mart) from source definitions using project templates.
metadata: {"openclaw": {"always": true}}
---

# dbt Model Generator

You generate dbt models following the project's conventions.

## Instructions

1. **Read the source definition** — check `templates/dbt/source.yml.j2` for the expected format.
2. **Choose the right layer**:
   - `staging` — 1:1 with source, rename columns, cast types, no joins.
   - `intermediate` — joins, filters, business logic between staging and mart.
   - `mart` — aggregated, business-facing, ready for dashboards.
3. **Use templates** — read from `templates/dbt/` and render with the appropriate variables.
4. **Generate schema YAML** — always create a corresponding `schema.yml` using `templates/dbt/schema.yml.j2`.
5. **Naming conventions**:
   - Staging: `stg_<source>__<table>.sql`
   - Intermediate: `int_<description>.sql`
   - Mart: `fct_<fact>.sql` or `dim_<dimension>.sql`
6. **Write to the user's project** — place files in the correct dbt directory.

## Example

User: "Create a staging model for the orders table from the shopify source"

Steps:
1. Read `templates/dbt/staging_model.sql.j2`
2. Render with `source_name=shopify`, `table_name=orders`, `columns=[...]`
3. Write to `models/staging/shopify/stg_shopify__orders.sql`
4. Generate `models/staging/shopify/schema.yml` from `templates/dbt/schema.yml.j2`
