"""
ClawData Streamlit Data Explorer
================================

Interactive data exploration UI that connects to the ClawData DuckDB warehouse.

Features:
  - Browse tables and views
  - Run ad-hoc SQL queries
  - Preview row samples with pagination
  - Column-level profiling stats
  - Quick chart generation

Usage:
    pip install streamlit duckdb
    streamlit run apps/streamlit/app.py
"""

import os
import streamlit as st

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
DB_PATH = os.environ.get("CLAWDATA_DB_PATH", "data/warehouse.duckdb")

st.set_page_config(
    page_title="ClawData Explorer",
    page_icon="🦀",
    layout="wide",
)


@st.cache_resource
def get_connection():
    """Create a shared DuckDB connection (cached across reruns)."""
    import duckdb

    return duckdb.connect(DB_PATH, read_only=True)


def list_tables(con) -> list[dict]:
    """Return all user tables in the main schema."""
    df = con.execute(
        """
        SELECT table_name, table_type
        FROM information_schema.tables
        WHERE table_schema = 'main'
        ORDER BY table_name
        """
    ).fetchdf()
    return df.to_dict("records")


def run_query(con, sql: str):
    """Execute SQL and return a pandas DataFrame."""
    return con.execute(sql).fetchdf()


def profile_column(con, table: str, column: str) -> dict:
    """Return basic profiling stats for a column."""
    sql = f"""
        SELECT
            COUNT(*)            AS total_rows,
            COUNT("{column}")   AS non_null,
            COUNT(*) - COUNT("{column}") AS null_count,
            COUNT(DISTINCT "{column}")   AS distinct_count,
            MIN("{column}")::VARCHAR     AS min_value,
            MAX("{column}")::VARCHAR     AS max_value
        FROM "{table}"
    """
    row = con.execute(sql).fetchdf().iloc[0]
    return row.to_dict()


# ---------------------------------------------------------------------------
# Sidebar
# ---------------------------------------------------------------------------
st.sidebar.title("🦀 ClawData Explorer")
st.sidebar.caption(f"Database: `{DB_PATH}`")

try:
    con = get_connection()
    tables = list_tables(con)
except Exception as e:
    st.error(f"Could not connect to DuckDB at `{DB_PATH}`: {e}")
    st.stop()

table_names = [t["table_name"] for t in tables]

mode = st.sidebar.radio("Mode", ["Browse Tables", "SQL Query", "Column Profile"])

# ---------------------------------------------------------------------------
# Browse Tables
# ---------------------------------------------------------------------------
if mode == "Browse Tables":
    st.header("📋 Tables")

    if not table_names:
        st.info("No tables found. Run `clawdata data ingest-all` first.")
    else:
        selected = st.selectbox("Select a table", table_names)
        limit = st.slider("Row limit", 5, 500, 50)
        df = run_query(con, f'SELECT * FROM "{selected}" LIMIT {limit}')
        st.write(f"**{selected}** — showing {len(df)} rows")
        st.dataframe(df, use_container_width=True)

        with st.expander("Quick chart"):
            numeric_cols = df.select_dtypes(include="number").columns.tolist()
            if numeric_cols:
                chart_col = st.selectbox("Column", numeric_cols)
                st.bar_chart(df[chart_col])
            else:
                st.info("No numeric columns available for charting.")

# ---------------------------------------------------------------------------
# SQL Query
# ---------------------------------------------------------------------------
elif mode == "SQL Query":
    st.header("🔍 SQL Query")
    sql = st.text_area("Enter SQL", value="SELECT 1 AS hello", height=120)
    if st.button("Run"):
        try:
            df = run_query(con, sql)
            st.write(f"{len(df)} rows returned")
            st.dataframe(df, use_container_width=True)
        except Exception as e:
            st.error(str(e))

# ---------------------------------------------------------------------------
# Column Profile
# ---------------------------------------------------------------------------
elif mode == "Column Profile":
    st.header("📊 Column Profile")

    if not table_names:
        st.info("No tables found.")
    else:
        tbl = st.selectbox("Table", table_names, key="profile_table")
        cols_df = run_query(
            con,
            f"""
            SELECT column_name, data_type
            FROM information_schema.columns
            WHERE table_name = '{tbl}' AND table_schema = 'main'
            ORDER BY ordinal_position
            """,
        )
        col_names = cols_df["column_name"].tolist()
        if col_names:
            col = st.selectbox("Column", col_names)
            stats = profile_column(con, tbl, col)
            st.json(stats)
        else:
            st.warning("No columns found.")
