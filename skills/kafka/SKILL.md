---
name: kafka
description: >
  Produce and consume messages from Apache Kafka — list topics, check
  consumer group lag, and stream data into DuckDB.
metadata:
  openclaw:
    requires:
      bins: [clawdata]
    primaryEnv: KAFKA_BOOTSTRAP_SERVERS
    tags: [streaming, kafka, messages, topics, events]
---

# Kafka

Produce and consume messages from Apache Kafka clusters.

## Commands

| Task | Command |
|------|---------|
| List topics | `clawdata kafka topics` |
| Describe topic | `clawdata kafka describe <topic>` |
| Consume messages | `clawdata kafka consume <topic> --limit 10` |
| Produce message | `clawdata kafka produce <topic> --message '{"key":"value"}'` |
| Consumer group lag | `clawdata kafka lag <group>` |
| Consume to DuckDB | `clawdata kafka ingest <topic> --table <table>` |

## Configuration

| Env Var | Description |
|---------|-------------|
| `KAFKA_BOOTSTRAP_SERVERS` | Comma-separated broker list (e.g. `localhost:9092`) |
| `KAFKA_SASL_USERNAME` | SASL username (optional) |
| `KAFKA_SASL_PASSWORD` | SASL password (optional) |
| `KAFKA_SECURITY_PROTOCOL` | `PLAINTEXT`, `SASL_SSL`, etc. |

## When to use

- User wants to check what events are flowing → `clawdata kafka consume`
- User needs to load streaming data into DuckDB → `clawdata kafka ingest`
- User asks about topic lag → `clawdata kafka lag`

## Example: Stream to DuckDB

```bash
# Consume 1000 messages from 'events' topic into DuckDB table
clawdata kafka ingest events --table raw_events --limit 1000

# Then transform with dbt
clawdata dbt run --select raw_events+
```
