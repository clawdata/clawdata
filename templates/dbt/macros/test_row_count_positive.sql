{% test row_count_positive(model) %}
{#
  Generic test: asserts that the model has at least one row.
  Usage in schema.yml:
    tests:
      - row_count_positive
#}
SELECT 1
WHERE (SELECT COUNT(*) FROM {{ model }}) = 0
{% endtest %}
