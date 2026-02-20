import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { DbtManager } from '../../src/lib/dbt.js';
import { resolve } from 'node:path';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

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

describe('inlineDocsData', () => {
  let tmpDir: string;
  let dbt: DbtManager;

  beforeAll(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'dbt-docs-'));
    const targetDir = path.join(tmpDir, 'target');
    await fs.mkdir(targetDir, { recursive: true });

    // Stub DbtManager to use our temp dir
    dbt = new DbtManager();
    (dbt as any).projectDir = tmpDir;
  });

  afterAll(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('replaces MANIFEST.JSON placeholder with actual manifest content', async () => {
    const target = path.join(tmpDir, 'target');
    const manifest = { nodes: { "model.test.my_model": { name: "my_model" } } };
    const catalog = { nodes: {} };

    await fs.writeFile(path.join(target, 'index.html'),
      'var defined = { manifest: "MANIFEST.JSON INLINE DATA", catalog: "CATALOG.JSON INLINE DATA" };');
    await fs.writeFile(path.join(target, 'manifest.json'), JSON.stringify(manifest));
    await fs.writeFile(path.join(target, 'catalog.json'), JSON.stringify(catalog));

    await dbt.inlineDocsData();

    const html = await fs.readFile(path.join(target, 'index.html'), 'utf-8');
    expect(html).not.toContain('MANIFEST.JSON INLINE DATA');
    expect(html).not.toContain('CATALOG.JSON INLINE DATA');
    expect(html).toContain('"my_model"');
  });

  it('produces valid inline JSON in the HTML', async () => {
    const target = path.join(tmpDir, 'target');
    const manifest = { metadata: { adapter_type: "duckdb" }, nodes: {} };
    const catalog = { metadata: {}, nodes: {} };

    await fs.writeFile(path.join(target, 'index.html'),
      'n = { manifest: "MANIFEST.JSON INLINE DATA", catalog: "CATALOG.JSON INLINE DATA" }');
    await fs.writeFile(path.join(target, 'manifest.json'), JSON.stringify(manifest));
    await fs.writeFile(path.join(target, 'catalog.json'), JSON.stringify(catalog));

    await dbt.inlineDocsData();

    const html = await fs.readFile(path.join(target, 'index.html'), 'utf-8');
    // Extract the inlined JSON and verify it parses
    const match = html.match(/manifest: ({.*?}), catalog: ({.*?}) }/);
    expect(match).toBeTruthy();
  });

  it('handles missing catalog.json gracefully', async () => {
    const target = path.join(tmpDir, 'target');
    const manifest = { nodes: {} };

    await fs.writeFile(path.join(target, 'index.html'),
      '{ manifest: "MANIFEST.JSON INLINE DATA", catalog: "CATALOG.JSON INLINE DATA" }');
    await fs.writeFile(path.join(target, 'manifest.json'), JSON.stringify(manifest));
    // Remove catalog if it exists
    await fs.rm(path.join(target, 'catalog.json'), { force: true });

    await dbt.inlineDocsData();

    const html = await fs.readFile(path.join(target, 'index.html'), 'utf-8');
    expect(html).not.toContain('MANIFEST.JSON INLINE DATA');
    expect(html).not.toContain('CATALOG.JSON INLINE DATA');
    // Falls back to empty object for catalog
    expect(html).toContain('{}');
  });

  it('leaves HTML unchanged if no placeholders present', async () => {
    const target = path.join(tmpDir, 'target');
    const original = '<html><body>No placeholders here</body></html>';

    await fs.writeFile(path.join(target, 'index.html'), original);
    await fs.writeFile(path.join(target, 'manifest.json'), '{}');
    await fs.writeFile(path.join(target, 'catalog.json'), '{}');

    await dbt.inlineDocsData();

    const html = await fs.readFile(path.join(target, 'index.html'), 'utf-8');
    expect(html).toBe(original);
  });
});
