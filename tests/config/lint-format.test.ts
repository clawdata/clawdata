import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

describe('linting & formatting configuration', () => {
  describe('.prettierrc', () => {
    const filePath = resolve('.prettierrc');

    it('file exists', () => {
      expect(existsSync(filePath)).toBe(true);
    });

    it('is valid JSON', () => {
      const raw = readFileSync(filePath, 'utf-8');
      expect(() => JSON.parse(raw)).not.toThrow();
    });

    it('enforces semicolons', () => {
      const cfg = JSON.parse(readFileSync(filePath, 'utf-8'));
      expect(cfg.semi).toBe(true);
    });

    it('uses double quotes (singleQuote: false)', () => {
      const cfg = JSON.parse(readFileSync(filePath, 'utf-8'));
      expect(cfg.singleQuote).toBe(false);
    });

    it('sets printWidth', () => {
      const cfg = JSON.parse(readFileSync(filePath, 'utf-8'));
      expect(cfg.printWidth).toBeGreaterThanOrEqual(80);
    });
  });

  describe('.eslintrc.json', () => {
    const filePath = resolve('.eslintrc.json');

    it('file exists', () => {
      expect(existsSync(filePath)).toBe(true);
    });

    it('is valid JSON', () => {
      const raw = readFileSync(filePath, 'utf-8');
      expect(() => JSON.parse(raw)).not.toThrow();
    });

    it('uses @typescript-eslint/parser', () => {
      const cfg = JSON.parse(readFileSync(filePath, 'utf-8'));
      expect(cfg.parser).toBe('@typescript-eslint/parser');
    });

    it('extends recommended configs', () => {
      const cfg = JSON.parse(readFileSync(filePath, 'utf-8'));
      expect(cfg.extends).toContain('eslint:recommended');
      expect(cfg.extends).toContain('plugin:@typescript-eslint/recommended');
    });

    it('ignores build/ directory', () => {
      const cfg = JSON.parse(readFileSync(filePath, 'utf-8'));
      expect(cfg.ignorePatterns).toContain('build/');
    });
  });
});
