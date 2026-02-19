-- Silver layer: individual order line items
-- One row per product per order, linked to order header and product

SELECT
    order_id || '-' || line_id             AS order_item_id,
    order_id,
    line_id,
    customer_id,
    product_sku,
    quantity,
    unit_price,
    line_total,
    ROUND(line_total * (discount_pct / 100.0), 2)  AS line_discount,
    order_date::DATE                       AS order_date,
    order_status
FROM {{ source('raw', 'sample_orders') }}
WHERE order_status NOT IN ('cancelled')
  AND quantity > 0
