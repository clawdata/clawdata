# Example OpenClaw/Claude Desktop Interaction

## 🎯 Getting Started

Once the server is installed and running, you can interact with it through OpenClaw or Claude Desktop using natural language.

## 💬 Example Conversations

### 1. Initial Setup - Load Sample Data

**You:**
> "Load the sample data files into the database"

**OpenClaw:**
> I'll load the sample data for you.
> - ✅ Loaded sample_customers.csv into table sample_customers (10 rows)
> - ✅ Loaded sample_orders.csv into table sample_orders (10 rows)

---

### 2. Run dbt Transformations

**You:**
> "Run the dbt models to create analytics tables"

**OpenClaw:**
> Running dbt transformations...
> - ✅ Created bronze view: brz_customers
> - ✅ Created bronze view: brz_orders
> - ✅ Created silver view: slv_customers
> - ✅ Created silver view: slv_orders
> - ✅ Created gold table: gld_customer_analytics
> All models ran successfully!

---

### 3. Query the Data

**You:**
> "Show me the top 5 customers by total spending"

**OpenClaw:**
> Here are the top 5 customers:
> 
> | Customer Name | Total Spent | Total Orders | Segment |
> |--------------|-------------|--------------|---------|
> | Alice Johnson | $279.97 | 3 | VIP |
> | Emma Davis | $299.99 | 1 | Active |
> | David Brown | $199.99 | 1 | Active |
> | Bob Smith | $239.49 | 2 | Active |
> | Grace Lee | $179.99 | 1 | Active |

---

### 4. Check Task Status

**You:**
> "What tasks are currently running?"

**OpenClaw:**
> Task Summary:
> - ✅ 5 completed tasks
> - 🔄 0 active tasks
> - ❌ 0 failed tasks
> 
> Recent completions:
> 1. SQL Query - "Show top customers" (completed in 0.3s)
> 2. dbt run - All models (completed in 2.1s)
> 3. Ingest sample_orders.csv (completed in 0.5s)

---

### 5. Data Quality Testing

**You:**
> "Run all dbt tests to check data quality"

**OpenClaw:**
> Running data quality tests...
> - ✅ All 6 tests passed!
> - brz_customers.customer_id: unique ✓
> - brz_orders.order_id: unique ✓
> - slv_customers.customer_id: unique ✓
> - slv_customers.email: not_null ✓
> - slv_orders.order_id: unique ✓
> - slv_orders.amount: not_null ✓
> - gld_customer_analytics.customer_id: unique ✓

---

### 6. Custom Analysis

**You:**
> "Calculate the average order value by country"

**OpenClaw:**
> Here's the analysis by country:
> 
> | Country | Avg Order Value | Total Orders |
> |---------|----------------|--------------|
> | USA | $94.99 | 5 |
> | UK | $139.75 | 2 |
> | Canada | $199.99 | 1 |
> | Australia | $299.99 | 1 |
> | Singapore | $179.99 | 1 |

---

### 7. Add New Data

**You:**
> "I just placed a new CSV file called new_products.csv in the data folder. Can you load it?"

**OpenClaw:**
> Loading new_products.csv...
> ✅ Successfully loaded into table new_products (25 rows)
> The data is now available for querying and transformation.

---

### 8. View Database Schema

**You:**
> "What tables are in the database?"

**OpenClaw:**
> Current database tables:
> 
> 1. sample_customers (source data)
> 2. sample_orders (source data)
> 3. brz_customers (bronze view)
> 4. brz_orders (bronze view)
> 5. slv_customers (silver view)
> 6. slv_orders (silver view)
> 7. gld_customer_analytics (gold table)
> 
> Total: 7 tables/views

---

### 9. Documentation

**You:**
> "Generate documentation for the dbt models"

**OpenClaw:**
> Generating dbt documentation...
> ✅ Documentation created at: dbt/target/index.html
> You can open this file in a browser to explore your data lineage and model documentation.

---

### 10. Multi-Step Workflow

**You:**
> "I need a complete ETL pipeline: load today's sales data, transform it with dbt, run tests, and give me a revenue summary"

**OpenClaw:**
> I'll run the complete pipeline:
> 
> Step 1: Loading sales data...
> ✅ Loaded today_sales.csv (1,247 rows)
> 
> Step 2: Running dbt transformations...
> ✅ Models executed successfully
> 
> Step 3: Running data quality tests...
> ✅ All tests passed
> 
> Step 4: Revenue summary:
> - Total Revenue: $45,892.34
> - Orders: 1,247
> - Avg Order Value: $36.79
> - Top Product: Widget A ($12,450 in sales)
> 
> Pipeline completed successfully in 4.2 seconds!

---

## 🎨 Advanced Examples

### Complex SQL Queries

**You:**
> "Find customers who haven't ordered in the last 30 days but were previously active"

### Data Pipeline Scheduling

**You:**
> "Set up a daily pipeline to load new orders, transform them, and alert me if tests fail"

### Cross-Database Analysis

**You:**
> "Compare sales data between DuckDB and our Snowflake warehouse"

---

## 🔧 Tips for Best Results

1. **Be specific** - "Load sales.csv into a table called daily_sales"
2. **Chain operations** - "Load data, run dbt, then show me the results"
3. **Ask for status** - "What's currently running?" or "Show me recent tasks"
4. **Request explanations** - "Explain what the customer_analytics model does"
5. **Iterate** - "Now filter that to only show VIP customers"

---

## 🆘 Troubleshooting Questions

**You:**
> "Why did the last dbt run fail?"

**You:**
> "Show me the exact SQL that was generated for the customer_analytics model"

**You:**
> "What's the schema of the orders table?"

---

**The connector handles all the technical details while you focus on your data questions! 🎉**
