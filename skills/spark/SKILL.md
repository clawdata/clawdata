---
name: spark
description: "Build and run Apache Spark jobs — submit applications, run interactive queries, manage data processing pipelines."
metadata: {"openclaw": {"emoji": "⚡", "requires": {"bins": ["spark-submit"]}, "tags": ["processing", "spark", "big-data", "etl", "data"]}}
---

# Apache Spark

You help build and run Apache Spark data processing jobs.
Use this when the user asks about Spark applications, DataFrame operations, SQL queries on Spark, or cluster management.

## Commands

### Submit a Spark application

```bash
spark-submit --master local[*] <script.py>
```

### Submit with dependencies

```bash
spark-submit --master local[*] --packages org.apache.spark:spark-avro_2.12:3.5.0 <script.py>
```

### Start PySpark shell

```bash
pyspark --master local[*]
```

### Start Spark SQL shell

```bash
spark-sql --master local[*]
```

## PySpark Patterns

### Read and write data

```python
from pyspark.sql import SparkSession

spark = SparkSession.builder.appName("my_app").getOrCreate()

# Read
df = spark.read.parquet("s3a://bucket/path/")
df = spark.read.csv("data/input.csv", header=True, inferSchema=True)
df = spark.read.json("data/events.json")

# Write
df.write.parquet("output/", mode="overwrite")
df.write.format("delta").save("output/delta/")
```

### Basic transformations

```python
from pyspark.sql import functions as F

result = (
    df
    .filter(F.col("status") == "active")
    .withColumn("year", F.year("created_at"))
    .groupBy("year", "category")
    .agg(
        F.count("*").alias("total"),
        F.sum("amount").alias("revenue"),
    )
    .orderBy(F.desc("revenue"))
)
```

### Window functions

```python
from pyspark.sql.window import Window

window = Window.partitionBy("customer_id").orderBy(F.desc("order_date"))
df = df.withColumn("rank", F.row_number().over(window))
```

### Spark SQL

```python
df.createOrReplaceTempView("orders")
result = spark.sql("""
    SELECT customer_id, COUNT(*) AS order_count, SUM(amount) AS total
    FROM orders
    WHERE status = 'completed'
    GROUP BY customer_id
    HAVING total > 1000
""")
```

### Delta Lake

```python
# Read Delta
df = spark.read.format("delta").load("path/to/delta")

# Write Delta with merge
from delta.tables import DeltaTable

delta_table = DeltaTable.forPath(spark, "path/to/delta")
delta_table.alias("target").merge(
    new_data.alias("source"),
    "target.id = source.id"
).whenMatchedUpdateAll().whenNotMatchedInsertAll().execute()
```

## Configuration

### Common Spark configs

```python
spark = (
    SparkSession.builder
    .appName("my_app")
    .config("spark.sql.shuffle.partitions", 200)
    .config("spark.sql.adaptive.enabled", True)
    .config("spark.serializer", "org.apache.spark.serializer.KryoSerializer")
    .getOrCreate()
)
```

## Best Practices

- Enable Adaptive Query Execution (AQE) for automatic optimisation
- Use `repartition()` or `coalesce()` to control output file count
- Avoid `collect()` on large datasets — use `show()`, `take()`, or write to storage
- Cache intermediate DataFrames only when reused multiple times
- Use Delta Lake for ACID transactions and time travel
- Broadcast small tables in joins: `F.broadcast(small_df)`
- Monitor via Spark UI (default port 4040)
- Prefer DataFrame API over RDD for performance
