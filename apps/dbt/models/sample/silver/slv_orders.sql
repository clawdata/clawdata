-- Silver layer: normalised order headers (one row per order)
-- Extracted from denormalised orders source; excludes cancelled orders

WITH order_lines AS (
    SELECT
        order_id,
        customer_id,
        order_date::DATE                   AS order_date,
        order_status,
        discount_pct,
        shipping_amount,
        tax_rate,
        shipping_city,
        shipping_country,
        created_at::TIMESTAMP              AS created_at,
        SUM(line_total)                    AS subtotal,
        COUNT(*)                           AS line_count
    FROM {{ ref('brz_orders') }}
    WHERE order_status NOT IN ('cancelled')
    GROUP BY
        order_id, customer_id, order_date, order_status,
        discount_pct, shipping_amount, tax_rate,
        shipping_city, shipping_country, created_at
)

SELECT
    order_id,
    customer_id,
    order_date,
    order_status,
    line_count,
    subtotal,
    ROUND(subtotal * (discount_pct / 100.0), 2)                         AS discount_amount,
    ROUND(subtotal * (1 - discount_pct / 100.0), 2)                     AS net_amount,
    ROUND(subtotal * (1 - discount_pct / 100.0) * tax_rate, 2)          AS tax_amount,
    shipping_amount,
    ROUND(
        subtotal * (1 - discount_pct / 100.0)
        + subtotal * (1 - discount_pct / 100.0) * tax_rate
        + shipping_amount, 2
    )                                                                     AS total_amount,
    discount_pct,
    tax_rate,
    shipping_city,
    shipping_country,
    created_at
FROM order_lines
