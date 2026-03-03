---
name: dbt
description: "Run and manage dbt projects -- build models, run tests, generate docs, manage packages, and debug data pipelines using the dbt CLI."
metadata: {"openclaw": {"emoji": "🔺", "requires": {"bins": ["dbt"]}, "tags": ["dbt", "sql", "data", "transformation", "analytics", "modeling"]}}
---

# dbt

You help run and manage dbt projects using the **`dbt`** CLI.
Use this when the user asks about running models, testing, docs, packages, seeds, snapshots, or debugging dbt projects.

## Authentication

dbt connects to your data warehouse via `profiles.yml` (usually at `~/.dbt/profiles.yml`).

Check the current connection:

```bash
dbt debug
```

## Commands

### Project Setup

#### Initialise a new project

```bash
dbt init <project-name>
```

#### Install packages

```bash
dbt deps
```

#### Validate project and connection

```bash
dbt debug
```

#### Parse project (check for errors)

```bash
dbt parse
```

### Running Models

#### Run all models

```bash
dbt run
```

#### Run a specific model

```bash
dbt run --select <model_name>
```

#### Run models by tag

```bash
dbt run --select tag:<tag-name>
```

#### Run models in a directory

```bash
dbt run --select path:models/<directory>
```

#### Run a model and its upstream dependencies

```bash
dbt run --select +<model_name>
```

#### Run a model and its downstream dependents

```bash
dbt run --select <model_name>+
```

#### Run a model with full upstream and downstream

```bash
dbt run --select +<model_name>+
```

#### Run only changed models (state comparison)

```bash
dbt run --select state:modified --state ./target-prev
```

#### Full refresh an incremental model

```bash
dbt run --select <model_name> --full-refresh
```

#### Run with a target environment

```bash
dbt run --target <target-name>
```

#### Run with variables

```bash
dbt run --vars '{"start_date": "2026-01-01", "end_date": "2026-01-31"}'
```

### Testing

#### Run all tests

```bash
dbt test
```

#### Run tests for a specific model

```bash
dbt test --select <model_name>
```

#### Run only schema tests (YAML-defined)

```bash
dbt test --select test_type:generic
```

#### Run only data tests (SQL files)

```bash
dbt test --select test_type:singular
```

#### Run tests for a model and its parents

```bash
dbt test --select +<model_name>
```

#### Store test failures in a table

```bash
dbt test --store-failures
```

### Build (Run + Test)

#### Build all (run models then test)

```bash
dbt build
```

#### Build a specific model

```bash
dbt build --select <model_name>
```

#### Build with fail-fast (stop on first error)

```bash
dbt build --fail-fast
```

### Seeds

#### Load all seed files

```bash
dbt seed
```

#### Load a specific seed

```bash
dbt seed --select <seed_name>
```

#### Full refresh a seed

```bash
dbt seed --select <seed_name> --full-refresh
```

### Snapshots

#### Run all snapshots

```bash
dbt snapshot
```

#### Run a specific snapshot

```bash
dbt snapshot --select <snapshot_name>
```

### Documentation

#### Generate documentation

```bash
dbt docs generate
```

#### Serve documentation locally

```bash
dbt docs serve --port 8080
```

### Source Freshness

#### Check all source freshness

```bash
dbt source freshness
```

#### Check freshness for a specific source

```bash
dbt source freshness --select source:<source_name>
```

### Compilation & Debugging

#### Compile SQL (resolve Jinja without executing)

```bash
dbt compile --select <model_name>
```

#### Show compiled SQL for a model

```bash
dbt show --select <model_name> --limit 10
```

#### List all models

```bash
dbt ls --resource-type model
```

#### List all tests

```bash
dbt ls --resource-type test
```

#### List all sources

```bash
dbt ls --resource-type source
```

#### List models by selection

```bash
dbt ls --select +<model_name>+ --output path
```

#### Show the DAG lineage for a model

```bash
dbt ls --select +<model_name>+ --output json
```

### Retry

#### Retry only previously failed models

```bash
dbt retry
```

### Clean

#### Clean compiled files and target directory

```bash
dbt clean
```

### Operations (Macros)

#### Run a macro

```bash
dbt run-operation <macro_name> --args '{"param": "value"}'
```

#### Grant permissions (common macro)

```bash
dbt run-operation grant_select --args '{"schema": "<schema>", "role": "<role>"}'
```

## Node Selection Syntax

| Pattern | Description |
|---------|-------------|
| `model_name` | Single model |
| `+model_name` | Model and all upstream parents |
| `model_name+` | Model and all downstream children |
| `+model_name+` | Full upstream and downstream lineage |
| `tag:daily` | All nodes tagged `daily` |
| `source:src_name` | All nodes from a source |
| `path:models/staging` | All models in a path |
| `config.materialized:incremental` | All incremental models |
| `state:modified` | Changed since last run (requires `--state`) |
| `result:error` | Models that errored in last run |
| `model_a model_b` | Multiple selections (space-separated) |
| `model_a,model_b` | Intersection (both must match) |
| `--exclude model_name` | Exclude from selection |

## Best Practices

- Run `dbt debug` first to verify connectivity
- Use `dbt build` instead of separate `dbt run` + `dbt test` for atomic execution
- Use `--fail-fast` in CI to stop on first failure
- Use `--select state:modified` in CI to only run changed models
- Store test failures with `--store-failures` for debugging
- Run `dbt deps` after modifying `packages.yml`
- Use `dbt compile` to inspect generated SQL before running
- Use `dbt show` to preview query results without materialising
- Use `dbt source freshness` to monitor upstream data pipelines
- Use `dbt retry` to re-run only failed models instead of the full project
- Always generate docs (`dbt docs generate`) after making model changes
