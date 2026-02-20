---
title: ClawData Analytics Dashboard
---

# Welcome to ClawData Analytics

This Evidence app provides markdown-based analytics dashboards
powered by the ClawData DuckDB warehouse.

## Quick Overview

```sql overview
SELECT
  (SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'main') AS total_tables
```

<BigValue data={overview} value=total_tables title="Tables in Warehouse" />

## Navigation

- [Revenue Summary](/revenue)
- [Customer Analytics](/customers)

---

> Built with [Evidence](https://evidence.dev) + [ClawData](https://github.com/clawdata/clawdata)
