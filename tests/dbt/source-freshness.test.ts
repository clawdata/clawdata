import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { DbtManager } from '../../src/lib/dbt.js';

const sourcesRaw = readFileSync(resolve('apps/dbt/models/sample/_sources.yml'), 'utf-8');

describe('source freshness checks', () => {
  describe('_sources.yml configuration', () => {
    it('defines loaded_at_field at source level', () => {
      expect(sourcesRaw).toContain('loaded_at_field:');
    });

    it('defines freshness warn_after', () => {
      expect(sourcesRaw).toMatch(/warn_after:.*count:\s*24/);
    });

    it('defines freshness error_after', () => {
      expect(sourcesRaw).toMatch(/error_after:.*count:\s*48/);
    });

    it('freshness period is hour', () => {
      expect(sourcesRaw).toMatch(/period:\s*hour/);
    });

    it('still lists all four source tables', () => {
      expect(sourcesRaw).toContain('sample_customers');
      expect(sourcesRaw).toContain('sample_products');
      expect(sourcesRaw).toContain('sample_orders');
      expect(sourcesRaw).toContain('sample_payments');
    });
  });

  describe('DbtManager.sourceFreshness()', () => {
    it('method exists on DbtManager', () => {
      const dbt = new DbtManager();
      expect(typeof dbt.sourceFreshness).toBe('function');
    });
  });
});
