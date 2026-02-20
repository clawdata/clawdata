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
  ROUND(AVG(total_spent), 2) AS avg_spent
FROM dim_customers
GROUP BY 1
ORDER BY 2 DESC
```

<BarChart data={customer_segments} x=segment y=customers title="Customer Segments" />

<DataTable data={customer_segments} />

## Top Customers

```sql top_customers
SELECT
  customer_name,
  total_orders,
  total_spent
FROM dim_customers
ORDER BY total_spent DESC
LIMIT 20
```

<DataTable data={top_customers} />
