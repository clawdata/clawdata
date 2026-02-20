---
name: great-expectations
description: >
  Data quality validation with Great Expectations — define expectations,
  run validation suites, and review results.
metadata:
  openclaw:
    requires:
      bins: [clawdata]
    primaryEnv: GE_HOME
    tags: [quality, validation, testing, expectations, data-quality]
---

# Great Expectations

Data quality validation as a standalone skill. Define expectations for your
data, run validation suites, and review results.

## Commands

| Task | Command |
|------|---------|
| Initialise GE project | `clawdata ge init` |
| Create expectation suite | `clawdata ge suite create <name>` |
| Run validation | `clawdata ge validate <suite> --table <table>` |
| List suites | `clawdata ge suite list` |
| View results | `clawdata ge results` |
| Generate docs | `clawdata ge docs` |

## Example Expectations

```yaml
# expectations/orders_suite.yml
expectations:
  - expect_column_to_exist:
      column: order_id
  - expect_column_values_to_not_be_null:
      column: order_id
  - expect_column_values_to_be_between:
      column: amount
      min_value: 0
      max_value: 100000
  - expect_table_row_count_to_be_between:
      min_value: 1
      max_value: 1000000
```

## When to use

- User needs data validation beyond dbt tests → `clawdata ge validate`
- User wants to profile data quality trends → `clawdata ge results`
- User asks about data quality → run `clawdata ge validate` then show results

## Integration with dbt

Great Expectations can validate the output of dbt models:

1. `clawdata dbt run` — transform data
2. `clawdata ge validate orders_suite --table fct_orders` — validate results
3. Report results in CI pipeline
