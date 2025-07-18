import { describe, expect, test } from 'bun:test';
import { parseAstro } from '../src/parse.js';
import { astroVitePlugin } from '../src/vite/plugin.js';
import { hasClientDirectives, transformAstroToJs } from '../src/vite/transform.js';

describe('Vite Plugin', () => {
  describe('astroVitePlugin', () => {
    test('should create a Vite plugin with correct name', () => {
      const plugin = astroVitePlugin();

      expect(plugin.name).toBe('astro-lite');
      expect(typeof plugin.transform).toBe('function');
      expect(typeof plugin.handleHotUpdate).toBe('function');
    });

    test('should handle .astro file extensions', () => {
      const plugin = astroVitePlugin();

      // Test transform function
      const result = plugin.transform?.(
        '---\\nconst title = "Hello";\\n---\\n<h1>{title}</h1>',
        '/test.astro'
      );
      expect(result).toBeTruthy();
      expect(typeof result).toBe('object');
      expect(result?.code).toContain('export async function render');
    });

    test('should ignore non-.astro files', () => {
      const plugin = astroVitePlugin();

      const result = plugin.transform?.('console.log("hello");', '/test.js');
      expect(result).toBeNull();
    });

    test('should handle custom extensions', () => {
      const plugin = astroVitePlugin({ extensions: ['.custom'] });

      const result = plugin.transform?.(
        '---\\nconst x = 1;\\n---\\n<div>Test</div>',
        '/test.custom'
      );
      expect(result).toBeTruthy();
      expect(result?.code).toContain('export async function render');
    });
  });

  describe('transformAstroToJs', () => {
    test('should transform simple Astro component to JavaScript', () => {
      const source = `---
const title = "Hello World";
---
<h1>{title}</h1>`;
      const { ast } = parseAstro(source);

      const js = transformAstroToJs(ast, { filename: '/test.astro' });

      expect(js).toContain('const title = "Hello World";');
      expect(js).toContain('export async function render');
      expect(js).toContain('export const metadata');
      expect(js).toContain('export default { render, metadata }');
      expect(js).toContain('<!-- Expression: title -->');
    });

    test('should handle components without frontmatter', () => {
      const source = '<div>Hello World</div>';
      const { ast } = parseAstro(source);

      const js = transformAstroToJs(ast, { filename: '/test.astro' });

      expect(js).toContain('export async function render');
      expect(js).toContain('<div>Hello World</div>');
      expect(js).not.toContain('// Frontmatter');
    });

    test('should include metadata with filename', () => {
      const source = '<div>Test</div>';
      const { ast } = parseAstro(source);

      const js = transformAstroToJs(ast, { filename: '/components/Test.astro' });

      expect(js).toContain('"/components/Test.astro"');
      expect(js).toContain('dev: false');
    });

    test('should handle dev mode flag', () => {
      const source = '<div>Test</div>';
      const { ast } = parseAstro(source);

      const js = transformAstroToJs(ast, { filename: '/test.astro', dev: true });

      expect(js).toContain('dev: true');
    });
  });

  describe('hasClientDirectives', () => {
    test('should detect client directives in components', () => {
      const source = '<Counter client:load />';
      const { ast } = parseAstro(source);

      const result = hasClientDirectives(ast);
      expect(result).toBe(true);
    });

    test('should detect client directives in elements', () => {
      const source = '<div client:visible>Content</div>';
      const { ast } = parseAstro(source);

      const result = hasClientDirectives(ast);
      expect(result).toBe(true);
    });

    test('should return false for components without client directives', () => {
      const source = '<div>No client directives</div>';
      const { ast } = parseAstro(source);

      const result = hasClientDirectives(ast);
      expect(result).toBe(false);
    });

    test('should detect nested client directives', () => {
      const source = '<div><Counter client:load /></div>';
      const { ast } = parseAstro(source);

      const result = hasClientDirectives(ast);
      expect(result).toBe(true);
    });
  });
});
