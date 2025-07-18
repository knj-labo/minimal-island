import { describe, expect, test } from 'bun:test';
import { parseAstro } from '../src/parse.js';
import { analyzeAstForHmr, canHotReload, injectHmrCode } from '../src/vite/hmr.js';

describe('HMR (Hot Module Replacement)', () => {
  describe('analyzeAstForHmr', () => {
    test('should detect client directives', () => {
      const source = `---
import Component from './Component.astro';
---
<div>
  <Component client:load />
</div>`;
      const { ast } = parseAstro(source);
      const state = analyzeAstForHmr(ast, '/test.astro');

      expect(state.hasClientDirectives).toBe(true);
      expect(state.imports).toContain('./Component.astro');
    });

    test('should extract imports from frontmatter', () => {
      const source = `---
import Layout from '../layouts/Base.astro';
import { getData } from '../utils/data.js';
import type { Props } from '../types.ts';
---
<Layout><h1>Hello</h1></Layout>`;
      const { ast } = parseAstro(source);
      const state = analyzeAstForHmr(ast, '/test.astro');

      expect(state.imports).toContain('../layouts/Base.astro');
      expect(state.imports).toContain('../utils/data.js');
      expect(state.imports).toContain('../types.ts');
    });

    test('should handle components without imports', () => {
      const source = '<div>No imports here</div>';
      const { ast } = parseAstro(source);
      const state = analyzeAstForHmr(ast, '/test.astro');

      expect(state.hasClientDirectives).toBe(false);
      expect(state.imports).toHaveLength(0);
    });
  });

  describe('canHotReload', () => {
    test('should allow hot reload when only template changes', () => {
      const oldState = {
        hasClientDirectives: false,
        imports: ['./Component.astro'],
        exports: [],
        cssModules: [],
      };

      const newState = {
        hasClientDirectives: false,
        imports: ['./Component.astro'],
        exports: [],
        cssModules: [],
      };

      expect(canHotReload(oldState, newState)).toBe(true);
    });

    test('should require full reload when client directives change', () => {
      const oldState = {
        hasClientDirectives: false,
        imports: ['./Component.astro'],
        exports: [],
        cssModules: [],
      };

      const newState = {
        hasClientDirectives: true,
        imports: ['./Component.astro'],
        exports: [],
        cssModules: [],
      };

      expect(canHotReload(oldState, newState)).toBe(false);
    });

    test('should require full reload when imports change', () => {
      const oldState = {
        hasClientDirectives: false,
        imports: ['./Component.astro'],
        exports: [],
        cssModules: [],
      };

      const newState = {
        hasClientDirectives: false,
        imports: ['./Component.astro', './NewComponent.astro'],
        exports: [],
        cssModules: [],
      };

      expect(canHotReload(oldState, newState)).toBe(false);
    });

    test('should require full reload when exports change', () => {
      const oldState = {
        hasClientDirectives: false,
        imports: [],
        exports: ['myFunction'],
        cssModules: [],
      };

      const newState = {
        hasClientDirectives: false,
        imports: [],
        exports: ['myFunction', 'anotherFunction'],
        cssModules: [],
      };

      expect(canHotReload(oldState, newState)).toBe(false);
    });
  });

  describe('injectHmrCode', () => {
    test('should inject HMR code in development mode', () => {
      const jsCode = `
export async function render() {
  return '<div>Hello</div>';
}
export const metadata = { filename: '/test.astro' };
`;
      const filePath = '/test.astro';
      const result = injectHmrCode(jsCode, filePath, true);

      expect(result).toContain('import.meta.hot');
      expect(result).toContain('import.meta.hot.accept');
      expect(result).toContain('astro-update');
      expect(result).toContain(filePath);
    });

    test('should not inject HMR code in production mode', () => {
      const jsCode = `
export async function render() {
  return '<div>Hello</div>';
}
export const metadata = { filename: '/test.astro' };
`;
      const filePath = '/test.astro';
      const result = injectHmrCode(jsCode, filePath, false);

      expect(result).not.toContain('import.meta.hot');
      expect(result).toBe(jsCode);
    });

    test('should include file path in HMR code', () => {
      const jsCode = 'export const test = true;';
      const filePath = '/components/Header.astro';
      const result = injectHmrCode(jsCode, filePath, true);

      expect(result).toContain('"/components/Header.astro"');
    });
  });
});
