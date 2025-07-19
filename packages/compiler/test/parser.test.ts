import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseAstro } from '../src/parse.js';
import type {
  ComponentNode,
  ElementNode,
  ExpressionNode,
  FrontmatterNode,
  TextNode,
} from '../types/ast.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadFixture(name: string): string {
  return readFileSync(join(__dirname, 'fixtures', name), 'utf-8');
}

describe('parseAstro', () => {
  describe('basic parsing', () => {
    test('should parse basic astro file with frontmatter and components', () => {
      const source = loadFixture('basic.astro');
      const result = parseAstro(source);

      expect(result.diagnostics).toHaveLength(0);
      expect(result.ast.type).toBe('Fragment');
      expect(result.ast.children).toHaveLength(3);

      // Check frontmatter
      const frontmatter = result.ast.children[0] as FrontmatterNode;
      expect(frontmatter.type).toBe('Frontmatter');
      expect(frontmatter.code).toContain('import Layout');
      expect(frontmatter.code).toContain("const _title = 'Hello'");

      // Check Layout component
      const layout = result.ast.children[2] as ComponentNode;
      expect(layout.type).toBe('Component');
      expect(layout.tag).toBe('Layout');
      expect(layout.children).toHaveLength(7); // Includes whitespace text nodes

      // Find h1 element
      const h1 = layout.children.find(
        (child) => child.type === 'Element' && (child as ElementNode).tag === 'h1'
      ) as ElementNode;
      expect(h1).toBeDefined();
      expect(h1.children).toHaveLength(1);
      expect(h1.children[0].type).toBe('Expression');
      expect((h1.children[0] as ExpressionNode).code).toBe('_title');

      // Find p element with client:visible
      const p = layout.children.find(
        (child) => child.type === 'Element' && (child as ElementNode).tag === 'p'
      ) as ElementNode;
      expect(p).toBeDefined();
      expect(p.attrs).toHaveLength(1);
      expect(p.attrs[0].name).toBe('client:visible');
      expect(p.attrs[0].value).toBe(true);

      // Find Counter component
      const counter = layout.children.find(
        (child) => child.type === 'Component' && (child as ComponentNode).tag === 'Counter'
      ) as ComponentNode;
      expect(counter).toBeDefined();
      expect(counter.attrs).toHaveLength(2);
      expect(counter.attrs[0].name).toBe('client:load');
      expect(counter.attrs[0].value).toBe(true);
      expect(counter.attrs[1].name).toBe('count');
      expect(counter.attrs[1].value).toBe('{5}');
    });
  });

  describe('self-closing tags', () => {
    test('should handle HTML void elements and component self-closing tags', () => {
      const source = loadFixture('self-closing.astro');
      const result = parseAstro(source);

      expect(result.diagnostics).toHaveLength(0);

      const div = result.ast.children[0] as ElementNode;
      expect(div.type).toBe('Element');
      expect(div.tag).toBe('div');

      // Find img (void element)
      const img = div.children.find(
        (child) => child.type === 'Element' && (child as ElementNode).tag === 'img'
      ) as ElementNode;
      expect(img).toBeDefined();
      expect(img.selfClosing).toBe(true);
      expect(img.attrs[0].name).toBe('src');
      expect(img.attrs[0].value).toBe('/logo.svg');

      // Find Chart component
      const chart = div.children.find(
        (child) => child.type === 'Component' && (child as ComponentNode).tag === 'Chart'
      ) as ComponentNode;
      expect(chart).toBeDefined();
      expect(chart.selfClosing).toBe(true);
      expect(chart.attrs[0].name).toBe('client:idle');
    });
  });

  describe('error recovery', () => {
    test('should recover from unclosed expressions', () => {
      const source = loadFixture('unclosed-braces.astro');
      const result = parseAstro(source);

      expect(result.diagnostics).toHaveLength(2);
      expect(result.diagnostics[0].code).toBe('unclosed-expression');
      expect(result.diagnostics[1].code).toBe('unclosed-expression');

      const div = result.ast.children[0] as ElementNode;
      const p = div.children.find(
        (child) => child.type === 'Element' && (child as ElementNode).tag === 'p'
      ) as ElementNode;

      // Should still parse the expression, even if unclosed
      const expr = p.children.find((child) => child.type === 'Expression') as ExpressionNode;
      expect(expr).toBeDefined();
      expect(expr.code).toBe('message');
      expect(expr.incomplete).toBe(true);
    });

    test('should handle unbalanced tags with implicit closing', () => {
      const source = loadFixture('unbalanced-tags.astro');
      const result = parseAstro(source);

      // Should have diagnostics for unclosed tags
      const unclosedDiagnostics = result.diagnostics.filter((d) => d.code === 'unclosed-tag');
      expect(unclosedDiagnostics.length).toBeGreaterThan(0);

      const ul = result.ast.children.find(
        (child) => child.type === 'Element' && (child as ElementNode).tag === 'ul'
      ) as ElementNode;

      // Should have parsed all three li elements
      const liElements = ul.children.filter(
        (child) => child.type === 'Element' && (child as ElementNode).tag === 'li'
      );
      expect(liElements).toHaveLength(3);
    });
  });

  describe('duplicate directives', () => {
    test('should warn about duplicate client directives', () => {
      const source = loadFixture('nested-directives.astro');
      const result = parseAstro(source);

      const duplicateWarnings = result.diagnostics.filter(
        (d) => d.code === 'duplicate-directive' && d.severity === 'warning'
      );
      expect(duplicateWarnings).toHaveLength(1);

      // First component with duplicate directives
      const island = result.ast.children.find(
        (child) => child.type === 'Component' && (child as ComponentNode).tag === 'Island'
      ) as ComponentNode;
      expect(island.attrs).toHaveLength(2);
      expect(island.attrs[0].name).toBe('client:load');
      expect(island.attrs[1].name).toBe('client:visible');
    });
  });

  describe('location tracking', () => {
    test('should track accurate positions for all nodes', () => {
      const source = `<div>
  <p>Hello</p>
</div>`;
      const result = parseAstro(source);

      const div = result.ast.children[0] as ElementNode;
      expect(div.loc.start.line).toBe(1);
      expect(div.loc.start.column).toBe(1);

      const p = div.children.find(
        (child) => child.type === 'Element' && (child as ElementNode).tag === 'p'
      ) as ElementNode;
      expect(p.loc.start.line).toBe(2);
      expect(p.loc.start.column).toBe(3);

      const text = p.children.find((child) => child.type === 'Text') as TextNode;
      expect(text.value).toBe('Hello');
    });
  });

  describe('component detection', () => {
    test('should distinguish between HTML elements and components', () => {
      const source = `<div>
  <Button>Click me</Button>
  <button>HTML button</button>
  <MyComponent />
  <my-element />
</div>`;
      const result = parseAstro(source);

      const div = result.ast.children[0] as ElementNode;
      const children = div.children.filter(
        (child) => child.type === 'Element' || child.type === 'Component'
      );

      expect(children[0].type).toBe('Component');
      expect((children[0] as ComponentNode).tag).toBe('Button');

      expect(children[1].type).toBe('Element');
      expect((children[1] as ElementNode).tag).toBe('button');

      expect(children[2].type).toBe('Component');
      expect((children[2] as ComponentNode).tag).toBe('MyComponent');

      expect(children[3].type).toBe('Element');
      expect((children[3] as ElementNode).tag).toBe('my-element');
    });
  });
});
