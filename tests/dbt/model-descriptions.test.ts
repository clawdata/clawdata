import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const schemaRaw = readFileSync(resolve('apps/dbt/models/sample/schema.yml'), 'utf-8');

/**
 * Extract the block for a model from schema.yml.
 */
function modelBlock(name: string): string {
  const re = new RegExp(`- name: ${name}\\b[\\s\\S]*?(?=\\n  - name: |\\nexposures:|$)`);
  return schemaRaw.match(re)?.[0] ?? '';
}

/**
 * Extract column names + whether they have a description from a model block.
 */
function columnsWithDescription(model: string): { name: string; hasDescription: boolean }[] {
  const block = modelBlock(model);
  const colRe = /- name: (\S+)\n([\s\S]*?)(?=\n      - name:|\n  - name:|\nexposures:|$)/g;
  const results: { name: string; hasDescription: boolean }[] = [];
  let m: RegExpExecArray | null;
  while ((m = colRe.exec(block)) !== null) {
    results.push({
      name: m[1],
      hasDescription: m[2].includes('description:'),
    });
  }
  return results;
}

// Models that should have all columns described
const modelsToCheck = [
  'slv_customers',
  'slv_orders',
  'slv_order_items',
  'slv_products',
  'slv_payments',
  'dim_customers',
  'dim_products',
  'fct_orders',
  'gld_customer_analytics',
  'gld_revenue_summary',
];

describe('complete model descriptions', () => {
  it('all silver and gold models have a model-level description', () => {
    for (const model of modelsToCheck) {
      const block = modelBlock(model);
      expect(block, `${model} should have description`).toContain('description:');
    }
  });

  for (const model of modelsToCheck) {
    it(`${model}: every column has a description`, () => {
      const cols = columnsWithDescription(model);
      expect(cols.length, `${model} should have columns defined`).toBeGreaterThan(0);
      const missing = cols.filter(c => !c.hasDescription).map(c => c.name);
      expect(missing, `${model} columns missing descriptions`).toEqual([]);
    });
  }
});
