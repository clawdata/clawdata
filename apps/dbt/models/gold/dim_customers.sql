-- Gold layer: customer dimension
-- Enriched with first/last order dates, lifetime value, and segment

WITH order_stats AS (
    SELECT
        customer_id,
        COUNT(DISTINCT order_id)           AS total_orders,
        SUM(total_amount)                  AS lifetime_value,
        MIN(order_date)                    AS first_order_date,
        MAX(order_date)                    AS last_order_date,
        AVG(total_amount)                  AS avg_order_value
    FROM {{ ref('slv_orders') }}
    GROUP BY customer_id
)

SELECT
    c.customer_id,
    c.first_name,
    c.last_name,
    c.first_name || ' ' || c.last_name    AS full_name,
    c.email,
    c.phone,
    c.city,
    c.state,
    c.country_code,
    c.registered_at,
    c.acquisition_source,
    COALESCE(o.total_orders, 0)            AS total_orders,
    COALESCE(o.lifetime_value, 0)          AS lifetime_value,
    ROUND(COALESCE(o.avg_order_value, 0), 2)  AS avg_order_value,
    o.first_order_date,
    o.last_order_date,
    -- Days between registration and first order
    CASE WHEN o.first_order_date IS NOT NULL
        THEN DATE_DIFF('day', c.registered_at::DATE, o.first_order_date)
    END                                    AS days_to_first_order,
    -- Customer segment
    CASE
        WHEN COALESCE(o.total_orders, 0) = 0           THEN 'Prospect'
        WHEN o.lifetime_value >= 1000 AND o.total_orders >= 3 THEN 'VIP'
        WHEN o.total_orders >= 3                        THEN 'Loyal'
        WHEN o.total_orders >= 1                        THEN 'Active'
        ELSE 'New'
    END                                    AS customer_segment,
    -- Recency bucket
    CASE
        WHEN o.last_order_date IS NULL                             THEN 'Never Ordered'
        WHEN DATE_DIFF('day', o.last_order_date, CURRENT_DATE) <= 30  THEN 'Current'
        WHEN DATE_DIFF('day', o.last_order_date, CURRENT_DATE) <= 90  THEN 'Recent'
        WHEN DATE_DIFF('day', o.last_order_date, CURRENT_DATE) <= 180 THEN 'Lapsed'
        ELSE 'Dormant'
    END                                    AS recency_segment
FROM {{ ref('slv_customers') }} c
LEFT JOIN order_stats o ON c.customer_id = o.customer_id
