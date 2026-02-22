#!/usr/bin/env python3
"""Generate Jupyter notebook files for ClawData."""
import json, os

DIR = os.path.dirname(os.path.abspath(__file__))

nb1 = {
    "cells": [
        {"cell_type": "markdown", "metadata": {}, "source": ["# 01 Explore the ClawData Warehouse\n", "\n", "Connect to DuckDB and browse available tables."]},
        {"cell_type": "code", "metadata": {}, "source": ["from helpers import connect, query_df, list_tables, sample\n", "\n", "con = connect()\n", "print('Connected to DuckDB')"], "execution_count": None, "outputs": []},
        {"cell_type": "markdown", "metadata": {}, "source": ["## List Tables"]},
        {"cell_type": "code", "metadata": {}, "source": ["list_tables(con)"], "execution_count": None, "outputs": []},
        {"cell_type": "markdown", "metadata": {}, "source": ["## Sample Data"]},
        {"cell_type": "code", "metadata": {}, "source": ["sample(con, 'dim_customers', n=10)"], "execution_count": None, "outputs": []},
        {"cell_type": "markdown", "metadata": {}, "source": ["## Ad-hoc SQL"]},
        {"cell_type": "code", "metadata": {}, "source": ["query_df(con, 'SELECT COUNT(*) AS total_orders, SUM(amount) AS total_revenue FROM fct_orders')"], "execution_count": None, "outputs": []},
    ],
    "metadata": {"kernelspec": {"display_name": "Python 3", "language": "python", "name": "python3"}, "language_info": {"name": "python", "version": "3.11.0"}},
    "nbformat": 4,
    "nbformat_minor": 5,
}

nb2 = {
    "cells": [
        {"cell_type": "markdown", "metadata": {}, "source": ["# 02 Data Profiling\n", "\n", "Column-level statistics, distributions, and null analysis."]},
        {"cell_type": "code", "metadata": {}, "source": ["from helpers import connect, query_df, profile_table\n", "\n", "con = connect()"], "execution_count": None, "outputs": []},
        {"cell_type": "markdown", "metadata": {}, "source": ["## Profile a Table"]},
        {"cell_type": "code", "metadata": {}, "source": ["profile_table(con, 'dim_customers')"], "execution_count": None, "outputs": []},
        {"cell_type": "markdown", "metadata": {}, "source": ["## Value Distribution"]},
        {"cell_type": "code", "metadata": {}, "source": ["import matplotlib.pyplot as plt\n", "\n", "df = query_df(con, \"SELECT country, COUNT(*) AS cnt FROM dim_customers GROUP BY country ORDER BY cnt DESC\")\n", "df.plot.bar(x='country', y='cnt', title='Customers by Country')\n", "plt.tight_layout()\n", "plt.show()"], "execution_count": None, "outputs": []},
        {"cell_type": "markdown", "metadata": {}, "source": ["## Null Analysis"]},
        {"cell_type": "code", "metadata": {}, "source": ["profile = profile_table(con, 'fct_orders')\n", "profile[['column_name', 'null_count', 'distinct_count']]"], "execution_count": None, "outputs": []},
    ],
    "metadata": {"kernelspec": {"display_name": "Python 3", "language": "python", "name": "python3"}, "language_info": {"name": "python", "version": "3.11.0"}},
    "nbformat": 4,
    "nbformat_minor": 5,
}

nb3 = {
    "cells": [
        {"cell_type": "markdown", "metadata": {}, "source": ["# 03 Model Development\n", "\n", "Prototype dbt models interactively."]},
        {"cell_type": "code", "metadata": {}, "source": ["from helpers import connect, query_df\n", "\n", "con = connect()"], "execution_count": None, "outputs": []},
        {"cell_type": "markdown", "metadata": {}, "source": ["## Draft a New Model"]},
        {"cell_type": "code", "metadata": {}, "source": ["model_sql = \"SELECT DATE_TRUNC('week', order_date) AS order_week, COUNT(DISTINCT order_id) AS orders, SUM(amount) AS revenue FROM fct_orders GROUP BY 1 ORDER BY 1\"\n", "\n", "df = query_df(con, model_sql)\n", "df.head(20)"], "execution_count": None, "outputs": []},
        {"cell_type": "markdown", "metadata": {}, "source": ["## Validate"]},
        {"cell_type": "code", "metadata": {}, "source": ["assert len(df) > 0, 'Model returned no rows'\n", "print(f'OK: {len(df)} rows')"], "execution_count": None, "outputs": []},
        {"cell_type": "markdown", "metadata": {}, "source": ["## Export to dbt"]},
        {"cell_type": "code", "metadata": {}, "source": ["import pathlib\n", "\n", "model_path = pathlib.Path('../../apps/dbt/models/sample/gold/gld_weekly_orders.sql')\n", "dbt_sql = \"SELECT DATE_TRUNC('week', order_date) AS order_week, COUNT(DISTINCT order_id) AS orders, SUM(amount) AS revenue FROM {{ ref('fct_orders') }} GROUP BY 1\"\n", "\n", "# Uncomment to write:\n", "# model_path.write_text(dbt_sql)\n", "print(f'Would save to {model_path}')"], "execution_count": None, "outputs": []},
    ],
    "metadata": {"kernelspec": {"display_name": "Python 3", "language": "python", "name": "python3"}, "language_info": {"name": "python", "version": "3.11.0"}},
    "nbformat": 4,
    "nbformat_minor": 5,
}

for name, data in [("01_explore.ipynb", nb1), ("02_profiling.ipynb", nb2), ("03_model_dev.ipynb", nb3)]:
    path = os.path.join(DIR, name)
    with open(path, "w") as f:
        json.dump(data, f, indent=1)
    print(f"Wrote {path}")
