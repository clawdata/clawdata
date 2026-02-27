---
name: sql-reviewer
description: Review SQL queries and dbt models for best practices, performance, and anti-patterns.
metadata: {"openclaw": {"always": true}}
---

# SQL Reviewer

You review SQL code and dbt models for quality, performance, and best practices.

## Instructions

1. **Read the SQL/model file** the user provides.
2. **Check for common issues**:
   - `SELECT *` in production models
   - Missing `WHERE` clauses on large tables
   - Cartesian joins (missing join conditions)
   - Non-deterministic functions without documentation
   - Unused CTEs
   - Overly complex subqueries (suggest CTEs)
   - Missing column aliases
   - Implicit type coercions
3. **dbt-specific checks**:
   - `ref()` and `source()` usage
   - Materialisation choice (table vs incremental vs view)
   - Missing schema tests (unique, not_null on keys)
   - Hardcoded values that should be variables
4. **Performance recommendations**:
   - Partition/cluster key suggestions
   - Incremental model opportunities
   - Redundant joins
5. **Output format**: Return a structured review with severity (error/warning/info),
   line reference, issue description, and suggested fix.

## Example Output

```
## SQL Review: stg_shopify__orders.sql

| # | Severity | Line | Issue | Fix |
|---|----------|------|-------|-----|
| 1 | warning | 12 | SELECT * used | List columns explicitly |
| 2 | error | - | Missing schema.yml | Add schema.yml with unique + not_null tests on order_id |
| 3 | info | 8 | Consider incremental | Large table — add incremental materialisation |
```
