{% snapshot snp_products %}

{{
    config(
      target_schema='snapshots',
      unique_key='product_sku',
      strategy='check',
      check_cols=['product_name', 'category', 'unit_price', 'margin_pct'],
    )
}}

SELECT * FROM {{ ref('slv_products') }}

{% endsnapshot %}
