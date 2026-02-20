import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const schemaRaw = readFileSync(resolve('apps/dbt/models/sample/schema.yml'), 'utf-8');
const packagesRaw = readFileSync(resolve('apps/dbt/packages.yml'), 'utf-8');

/**
 * Extract the YAML block for a given model (from `- name: X` to the next model
 * or end of models section).
 */
function modelBlock(modelName: string): string {
  const re = new RegExp(`- name: ${modelName}\\b[\\s\\S]*?(?=\\n  - name: |\\nexposures:|$)`);
  const m = schemaRaw.match(re);
  return m ? m[0] : '';
}

/**
 * Extract the sub-block for a column within a model block.
 */
function columnBlock(model: string, column: string): string {
  const block = modelBlock(model);
  const re = new RegExp(`- name: ${column}\\b[\\s\\S]*?(?=\\n      - name: |$)`);
  const m = block.match(re);
  return m ? m[0] : '';
}

/** Check that a column block contains a specific dbt_utils test */
function hasTest(model: string, column: string, test: string): boolean {
  const block = columnBlock(model, column);
  return block.includes(test);
}

describe('dbt-utils integration tests in schema.yml', () => {
  // ── expression_is_true ───────────────────────────────────────────
  describe('expression_is_true', () => {
    const testName = 'dbt_utils.expression_is_true';

    it('slv_orders.total_amount >= 0', () => {
      expect(hasTest('slv_orders', 'total_amount', testName)).toBe(true);
    });
    it('slv_products.margin_pct between 0 and 100', () => {
      expect(hasTest('slv_products', 'margin_pct', testName)).toBe(true);
    });
    it('dim_products.total_revenue >= 0', () => {
      expect(hasTest('dim_products', 'total_revenue', testName)).toBe(true);
    });
    it('fct_orders.total_amount > 0', () => {
      expect(hasTest('fct_orders', 'total_amount', testName)).toBe(true);
    });
    it('gld_customer_analytics.total_spend >= 0', () => {
      expect(hasTest('gld_customer_analytics', 'total_spend', testName)).toBe(true);
    });
    it('gld_revenue_summary.total_collected >= 0', () => {
      expect(hasTest('gld_revenue_summary', 'total_collected', testName)).toBe(true);
    });
    it('gld_revenue_summary.order_count > 0', () => {
      expect(hasTest('gld_revenue_summary', 'order_count', testName)).toBe(true);
    });
  });

  // ── at_least_one ────────────────────────────────────────────────
  describe('at_least_one', () => {
    const testName = 'dbt_utils.at_least_one';

    it('slv_products.product_sku', () => {
      expect(hasTest('slv_products', 'product_sku', testName)).toBe(true);
    });
    it('slv_products.category', () => {
      expect(hasTest('slv_products', 'category', testName)).toBe(true);
    });
    it('dim_customers.customer_segment', () => {
      expect(hasTest('dim_customers', 'customer_segment', testName)).toBe(true);
    });
    it('dim_products.product_sku', () => {
      expect(hasTest('dim_products', 'product_sku', testName)).toBe(true);
    });
    it('fct_orders.order_id', () => {
      expect(hasTest('fct_orders', 'order_id', testName)).toBe(true);
    });
    it('gld_customer_analytics.customer_id', () => {
      expect(hasTest('gld_customer_analytics', 'customer_id', testName)).toBe(true);
    });
    it('gld_revenue_summary.order_date', () => {
      expect(hasTest('gld_revenue_summary', 'order_date', testName)).toBe(true);
    });
  });

  // ── not_constant ────────────────────────────────────────────────
  describe('not_constant', () => {
    const testName = 'dbt_utils.not_constant';

    it('slv_orders.order_status', () => {
      expect(hasTest('slv_orders', 'order_status', testName)).toBe(true);
    });
    it('slv_products.product_name', () => {
      expect(hasTest('slv_products', 'product_name', testName)).toBe(true);
    });
    it('dim_products.product_name', () => {
      expect(hasTest('dim_products', 'product_name', testName)).toBe(true);
    });
  });

  // ── packages.yml includes dbt-utils ────────────────────────────
  it('packages.yml references dbt-utils', () => {
    expect(packagesRaw).toContain('dbt-labs/dbt_utils');
  });
});
