-- Silver layer: cleaned product catalogue
-- Filters to active products, standardises naming

SELECT
    sku                                    AS product_sku,
    TRIM(product_name)                     AS product_name,
    CONCAT(UPPER(SUBSTR(TRIM(category),1,1)), LOWER(SUBSTR(TRIM(category),2)))          AS category,
    CONCAT(UPPER(SUBSTR(TRIM(subcategory),1,1)), LOWER(SUBSTR(TRIM(subcategory),2)))  AS subcategory,
    unit_price,
    cost_price,
    ROUND(unit_price - cost_price, 2)      AS margin,
    ROUND((unit_price - cost_price) / NULLIF(unit_price, 0) * 100, 1)
                                           AS margin_pct,
    weight_kg,
    created_date::DATE                     AS created_date,
    is_active
FROM {{ source('raw', 'sample_products') }}
WHERE is_active = true
