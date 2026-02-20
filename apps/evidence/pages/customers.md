---
title: Customer Analytics
---

# Customer Analytics

```sql customer_segments
SELECT
  CASE
    WHEN total_orders >= 10 THEN 'Power'
    WHEN total_orders >= 5  THEN 'Regular'
    WHEN total_orders >= 2  THEN 'Occasional'
    ELSE 'One-time'
  END AS segment,
  COUNT(*) AS customers,
  ROUND(AVG(lifetime_value), 2) AS avg_spent
FROM clawdata.dim_customers
GROUP BY 1
ORDER BY 2 DESC
```

<BarChart data={customer_segments} x=segment y=customers title="Customer Segments" />

<DataTable data={customer_segments} />

## Top Customers

```sql top_customers
SELECT
  full_name,
  total_orders,
  lifetime_value
FROM clawdata.dim_customers
ORDER BY lifetime_value DESC
LIMIT 20
```

<DataTable data={top_customers} />
