---
name: spark
description: >
  Submit and monitor Apache Spark jobs — manage clusters, read logs,
  and run Spark SQL queries.
metadata:
  openclaw:
    requires:
      bins: [spark-submit, clawdata]
      env: [SPARK_MASTER]
    primaryEnv: SPARK_MASTER
    tags: [compute, spark, big-data, clusters, sql]
---

# Apache Spark

Submit and monitor Spark jobs, manage clusters, and run Spark SQL.

## Commands

| Task | Command |
|------|---------|
| Submit job | `clawdata spark submit app.py --master <url>` |
| Spark SQL | `clawdata spark sql "SELECT ..."` |
| List applications | `clawdata spark apps` |
| Application status | `clawdata spark status <app-id>` |
| View logs | `clawdata spark logs <app-id>` |
| Kill application | `clawdata spark kill <app-id>` |

## Configuration

| Env Var | Default | Description |
|---------|---------|-------------|
| `SPARK_MASTER` | `local[*]` | Spark master URL |
| `SPARK_HOME` | auto-detect | Spark installation directory |

## When to use

- User needs distributed processing for large datasets → Spark
- User wants to run PySpark scripts → `clawdata spark submit`
- User asks about cluster utilisation → `clawdata spark apps`
