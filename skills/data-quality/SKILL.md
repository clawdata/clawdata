---
name: data-quality
description: Add data quality checks and tests to dbt models and pipelines.
metadata: {"openclaw": {"always": true}}
---

# Data Quality

You help add data quality checks to dbt models and data pipelines.

## Instructions

1. **Analyse the model** — read the SQL and understand the grain and business keys.
2. **Recommend tests** based on column type:
   - Primary keys: `unique`, `not_null`
   - Foreign keys: `relationships`
   - Enums/status fields: `accepted_values`
   - Dates: `not_null`, range checks
   - Amounts: `not_null`, non-negative checks
3. **Generate schema YAML** using `templates/dbt/schema.yml.j2` with tests.
4. **Custom tests**: When generic tests are insufficient, write singular tests
   (SQL files in `tests/`) or custom generic tests (macros).
5. **dbt expectations**: Suggest `dbt_expectations` or `dbt_utils` tests where
   appropriate (row count, expression checks, etc.).
6. **Freshness**: Add source freshness checks to `source.yml` for critical
   sources (`loaded_at_field`, `warn_after`, `error_after`).

## Common Patterns

- Every staging model should have `unique` + `not_null` on the primary key
- Mart models should have referential integrity tests
- Incremental models should test for duplicate records after merge
- Add `dbt_utils.expression_is_true` for business rule validation
