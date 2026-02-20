import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, readFileSync, rmSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { generateSampleData } from '../../src/lib/generator.js';

const tmpDir = join('tmp', 'test-generate');

beforeEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});
afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('generateSampleData', () => {
  it('creates 4 CSV files', () => {
    const { files } = generateSampleData({ rows: 10, outputDir: tmpDir });
    expect(files).toHaveLength(4);
    for (const f of files) {
      expect(existsSync(f)).toBe(true);
    }
  });

  it('generates the expected file names', () => {
    const { files } = generateSampleData({ rows: 5, outputDir: tmpDir });
    const names = files.map(f => f.split('/').pop());
    expect(names).toContain('sample_customers.csv');
    expect(names).toContain('sample_products.csv');
    expect(names).toContain('sample_orders.csv');
    expect(names).toContain('sample_payments.csv');
  });

  it('customers CSV has header + correct row count', () => {
    generateSampleData({ rows: 20, outputDir: tmpDir });
    const csv = readFileSync(join(tmpDir, 'sample_customers.csv'), 'utf-8');
    const lines = csv.trim().split('\n');
    // header + ceil(20 * 0.2) = 4 rows
    expect(lines[0]).toContain('customer_id');
    expect(lines.length).toBe(1 + Math.ceil(20 * 0.2));
  });

  it('products CSV has header + correct row count', () => {
    generateSampleData({ rows: 50, outputDir: tmpDir });
    const csv = readFileSync(join(tmpDir, 'sample_products.csv'), 'utf-8');
    const lines = csv.trim().split('\n');
    expect(lines[0]).toContain('product_sku');
    expect(lines.length).toBe(1 + Math.ceil(50 * 0.1));
  });

  it('orders CSV has header + rows equal to requested count', () => {
    generateSampleData({ rows: 30, outputDir: tmpDir });
    const csv = readFileSync(join(tmpDir, 'sample_orders.csv'), 'utf-8');
    const lines = csv.trim().split('\n');
    expect(lines[0]).toContain('order_id');
    expect(lines.length).toBe(1 + 30);
  });

  it('payments CSV has same row count as orders', () => {
    generateSampleData({ rows: 15, outputDir: tmpDir });
    const orders = readFileSync(join(tmpDir, 'sample_orders.csv'), 'utf-8').trim().split('\n');
    const payments = readFileSync(join(tmpDir, 'sample_payments.csv'), 'utf-8').trim().split('\n');
    expect(payments.length).toBe(orders.length);
  });

  it('is deterministic with the same seed', () => {
    generateSampleData({ rows: 10, outputDir: tmpDir, seed: 123 });
    const first = readFileSync(join(tmpDir, 'sample_orders.csv'), 'utf-8');
    rmSync(tmpDir, { recursive: true, force: true });
    generateSampleData({ rows: 10, outputDir: tmpDir, seed: 123 });
    const second = readFileSync(join(tmpDir, 'sample_orders.csv'), 'utf-8');
    expect(first).toBe(second);
  });

  it('produces different output with different seeds', () => {
    generateSampleData({ rows: 10, outputDir: tmpDir, seed: 1 });
    const a = readFileSync(join(tmpDir, 'sample_orders.csv'), 'utf-8');
    rmSync(tmpDir, { recursive: true, force: true });
    generateSampleData({ rows: 10, outputDir: tmpDir, seed: 999 });
    const b = readFileSync(join(tmpDir, 'sample_orders.csv'), 'utf-8');
    expect(a).not.toBe(b);
  });

  it('handles minimum rows = 1', () => {
    const { files } = generateSampleData({ rows: 1, outputDir: tmpDir });
    expect(files).toHaveLength(4);
    for (const f of files) {
      const lines = readFileSync(f, 'utf-8').trim().split('\n');
      expect(lines.length).toBeGreaterThanOrEqual(2); // header + at least 1 row
    }
  });
});
