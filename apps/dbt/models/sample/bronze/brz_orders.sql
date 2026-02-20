-- Bronze layer: raw orders data passthrough
-- Unmodified ingestion from source — preserves all columns as-is

SELECT *
FROM {{ source('raw', 'sample_orders') }}
