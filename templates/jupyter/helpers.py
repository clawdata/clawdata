"""
ClawData Jupyter helper — shared DuckDB connection and utility functions.

Usage:
    from helpers import connect, query_df, list_tables, profile_table
"""

import os
import duckdb
import pandas as pd


DB_PATH = os.environ.get("CLAWDATA_DB_PATH", "../../data/warehouse.duckdb")


def connect(path: str | None = None, read_only: bool = True) -> duckdb.DuckDBPyConnection:
    """Return a DuckDB connection to the ClawData warehouse."""
    return duckdb.connect(path or DB_PATH, read_only=read_only)


def query_df(con: duckdb.DuckDBPyConnection, sql: str) -> pd.DataFrame:
    """Execute SQL and return a pandas DataFrame."""
    return con.execute(sql).fetchdf()


def list_tables(con: duckdb.DuckDBPyConnection) -> pd.DataFrame:
    """List all user tables in the main schema."""
    return query_df(
        con,
        """
        SELECT table_name, table_type
        FROM information_schema.tables
        WHERE table_schema = 'main'
        ORDER BY table_name
        """,
    )


def profile_table(con: duckdb.DuckDBPyConnection, table: str) -> pd.DataFrame:
    """Return column-level profiling stats for a table."""
    cols = query_df(
        con,
        f"""
        SELECT column_name, data_type
        FROM information_schema.columns
        WHERE table_name = '{table}' AND table_schema = 'main'
        ORDER BY ordinal_position
        """,
    )

    stats = []
    for _, row in cols.iterrows():
        col = row["column_name"]
        s = query_df(
            con,
            f"""
            SELECT
                '{col}' AS column_name,
                '{row["data_type"]}' AS data_type,
                COUNT(*) AS total_rows,
                COUNT("{col}") AS non_null,
                COUNT(*) - COUNT("{col}") AS null_count,
                COUNT(DISTINCT "{col}") AS distinct_count,
                MIN("{col}")::VARCHAR AS min_value,
                MAX("{col}")::VARCHAR AS max_value
            FROM "{table}"
            """,
        )
        stats.append(s)

    return pd.concat(stats, ignore_index=True) if stats else pd.DataFrame()


def sample(con: duckdb.DuckDBPyConnection, table: str, n: int = 10) -> pd.DataFrame:
    """Return a sample of rows from a table."""
    return query_df(con, f'SELECT * FROM "{table}" LIMIT {n}')
