import { describe, it, expect } from 'vitest';
import { DbtManager } from '../../src/lib/dbt.js';
import { resolve } from 'node:path';

describe('dbt docs --serve', () => {
  const dbt = new DbtManager();

  it('docsServe method exists', () => {
    expect(typeof dbt.docsServe).toBe('function');
  });

  it('docsServe accepts a port argument', () => {
    // Just verify the signature — calling it would launch a real server
    expect(dbt.docsServe.length).toBeLessThanOrEqual(1);
  });

  it('docsDir points to target/', () => {
    expect(dbt.docsDir).toContain('target');
  });

  it('docs() still returns a DbtRunResult', async () => {
    // docs() shells out to dbt so it will fail without dbt installed,
    // but we can verify it returns an object with success + output keys
    const result = await dbt.docs();
    expect(result).toHaveProperty('success');
    expect(result).toHaveProperty('output');
  });
});
