import { describe, it, expect } from 'vitest';
import { listTemplates, getTemplate, renderSourcesYml, TEMPLATES } from '../../src/lib/templates.js';

describe('project templates', () => {
  it('lists at least 3 templates', () => {
    expect(listTemplates().length).toBeGreaterThanOrEqual(3);
  });

  it('includes ecommerce, saas, and financial', () => {
    const names = listTemplates();
    expect(names).toContain('ecommerce');
    expect(names).toContain('saas');
    expect(names).toContain('financial');
  });

  it('getTemplate returns undefined for unknown name', () => {
    expect(getTemplate('nonexistent')).toBeUndefined();
  });

  it('getTemplate is case-insensitive', () => {
    expect(getTemplate('SaaS')).toBeDefined();
    expect(getTemplate('FINANCIAL')).toBeDefined();
  });

  describe('each template', () => {
    for (const [key, tpl] of Object.entries(TEMPLATES)) {
      it(`${key}: has name, description, sourceTables, bronzeModels`, () => {
        expect(tpl.name).toBe(key);
        expect(tpl.description.length).toBeGreaterThan(0);
        expect(tpl.sourceTables.length).toBeGreaterThanOrEqual(3);
        expect(Object.keys(tpl.bronzeModels).length).toBeGreaterThanOrEqual(3);
      });

      it(`${key}: every source table has a name and description`, () => {
        for (const t of tpl.sourceTables) {
          expect(t.name.length).toBeGreaterThan(0);
          expect(t.description.length).toBeGreaterThan(0);
        }
      });

      it(`${key}: bronze models reference {{ source('raw', ...) }}`, () => {
        for (const sql of Object.values(tpl.bronzeModels)) {
          expect(sql).toContain("source('raw'");
        }
      });
    }
  });

  describe('renderSourcesYml', () => {
    it('generates valid YAML with version: 2', () => {
      const yml = renderSourcesYml(TEMPLATES.ecommerce);
      expect(yml).toContain('version: 2');
    });

    it('includes all source table names', () => {
      const tpl = TEMPLATES.saas;
      const yml = renderSourcesYml(tpl);
      for (const t of tpl.sourceTables) {
        expect(yml).toContain(t.name);
      }
    });

    it('includes table descriptions', () => {
      const tpl = TEMPLATES.financial;
      const yml = renderSourcesYml(tpl);
      for (const t of tpl.sourceTables) {
        expect(yml).toContain(t.description);
      }
    });
  });
});
