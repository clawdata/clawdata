---
name: metabase
description: >
  BI skill for Metabase and Apache Superset — create questions,
  refresh dashboards, and export charts.
metadata:
  openclaw:
    requires:
      bins: [clawdata]
    primaryEnv: METABASE_URL
    tags: [bi, metabase, superset, dashboards, charts, reporting]
---

# Metabase / Superset

BI skill for managing dashboards and questions in Metabase or Apache Superset.

## Commands

| Task | Command |
|------|---------|
| List dashboards | `clawdata bi dashboards` |
| View dashboard | `clawdata bi dashboard <id>` |
| List questions | `clawdata bi questions` |
| Run question | `clawdata bi question <id>` |
| Refresh dashboard | `clawdata bi refresh <dashboard-id>` |
| Export chart | `clawdata bi export <question-id> --format png` |

## Configuration

### Metabase
```bash
export METABASE_URL=http://localhost:3000
export METABASE_API_KEY=your-api-key
```

### Superset
```bash
export SUPERSET_URL=http://localhost:8088
export SUPERSET_API_TOKEN=your-token
```

## When to use

- User asks about dashboards → `clawdata bi dashboards`
- User wants to refresh data in a dashboard → `clawdata bi refresh`
- User needs to export a chart → `clawdata bi export`

## Integration

Wire dashboards as dbt exposures so lineage is visible:

```yaml
# schema.yml
exposures:
  - name: revenue_dashboard
    type: dashboard
    url: http://localhost:3000/dashboard/1
    depends_on:
      - ref('gld_revenue_summary')
```
