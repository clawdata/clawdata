# ClawData Jupyter Notebooks

Pre-configured Jupyter environment for interactive data exploration with DuckDB.

## Quick Start

```bash
pip install -r apps/jupyter/requirements.txt
jupyter lab --notebook-dir apps/jupyter
```

## Notebooks

| Notebook | Purpose |
|----------|---------|
| `01_explore.ipynb` | Connect to DuckDB, browse tables, run ad-hoc queries |
| `02_profiling.ipynb` | Column-level statistics, distributions, null analysis |
| `03_model_dev.ipynb` | Prototype dbt models — iterate in notebook → export to SQL |

## Configuration

Set `CLAWDATA_DB_PATH` to point to your warehouse:

```bash
export CLAWDATA_DB_PATH=data/warehouse.duckdb
jupyter lab --notebook-dir apps/jupyter
```

## DuckDB Connection Helper

Each notebook uses the shared helper in `helpers.py`:

```python
from helpers import connect, query_df
con = connect()
df = query_df(con, "SELECT * FROM dim_customers LIMIT 10")
```
