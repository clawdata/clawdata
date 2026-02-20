-- Bronze layer: raw products data passthrough
-- Unmodified ingestion from source — preserves all columns as-is

SELECT *
FROM {{ source('raw', 'sample_products') }}
