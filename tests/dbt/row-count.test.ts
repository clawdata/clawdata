import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const schemaRaw = readFileSync(resolve('apps/dbt/models/sample/schema.yml'), 'utf-8');
const macroPath = resolve('apps/dbt/macros/test_row_count_positive.sql');

describe('row-count assertions', () => {
  describe('custom macro', () => {
    it('test_row_count_positive.sql macro exists', () => {
      expect(existsSync(macroPath)).toBe(true);
    });

    it('macro defines {% test row_count_positive %}', () => {
      const content = readFileSync(macroPath, 'utf-8');
      expect(content).toContain('{% test row_count_positive(model) %}');
    });

    it('macro checks COUNT(*) = 0', () => {
      const content = readFileSync(macroPath, 'utf-8');
      expect(content).toMatch(/COUNT\(\*\).*=\s*0/i);
    });
  });

  describe('gold models have row_count_positive test', () => {
    const goldModels = [
      'dim_customers',
      'dim_products',
      'fct_orders',
      'gld_customer_analytics',
      'gld_revenue_summary',
    ];

    for (const model of goldModels) {
      it(`${model} has row_count_positive model-level test`, () => {
        // Extract the model block
        const re = new RegExp(`- name: ${model}\\b[\\s\\S]*?(?=\\n  - name: |\\nexposures:|$)`);
        const block = schemaRaw.match(re)?.[0] ?? '';
        // Check for model-level tests (not column-level)
        expect(block).toContain('row_count_positive');
        // Ensure it appears in a tests: block before columns:
        const testsBeforeColumns = block.indexOf('row_count_positive') < block.indexOf('columns:');
        expect(testsBeforeColumns).toBe(true);
      });
    }
  });
});
