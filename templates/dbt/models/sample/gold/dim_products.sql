-- Gold layer: product dimension
-- Enriched with sales volume and revenue metrics

WITH product_stats AS (
    SELECT
        product_sku,
        COUNT(DISTINCT order_id)           AS times_ordered,
        SUM(quantity)                      AS total_units_sold,
        SUM(line_total)                    AS total_revenue
    FROM {{ ref('slv_order_items') }}
    GROUP BY product_sku
)

SELECT
    p.product_sku,
    p.product_name,
    p.category,
    p.subcategory,
    p.unit_price,
    p.cost_price,
    p.margin,
    p.margin_pct,
    p.weight_kg,
    COALESCE(s.times_ordered, 0)           AS times_ordered,
    COALESCE(s.total_units_sold, 0)        AS total_units_sold,
    ROUND(COALESCE(s.total_revenue, 0), 2) AS total_revenue,
    ROUND(COALESCE(s.total_units_sold, 0) * p.cost_price, 2) AS total_cost,
    ROUND(COALESCE(s.total_revenue, 0)
          - COALESCE(s.total_units_sold, 0) * p.cost_price, 2)
                                           AS total_profit
FROM {{ ref('slv_products') }} p
LEFT JOIN product_stats s ON p.product_sku = s.product_sku
