import { describe, expect, test } from 'bun:test';
import { buildHtml } from '../src/html-builder';
import { parseAstro } from '../src/parse';
import type { FragmentNode } from '../types/ast.js';

describe('buildHtml', () => {
  describe('basic HTML elements', () => {
    test('should render simple HTML elements', () => {
      const source = '<div><p>Hello World</p></div>';
      const { ast } = parseAstro(source);
      const html = buildHtml(ast);

      expect(html).toBe('<div><p>Hello World</p></div>');
    });

    test('should render void elements correctly', () => {
      const source = '<div><img src="test.jpg"><br><hr></div>';
      const { ast } = parseAstro(source);
      const html = buildHtml(ast);

      expect(html).toBe('<div><img src="test.jpg"><br><hr></div>');
    });

    test('should render self-closing elements', () => {
      const source = '<div><img src="test.jpg" /><Component /></div>';
      const { ast } = parseAstro(source);
      const html = buildHtml(ast);

      expect(html).toBe('<div><img src="test.jpg"><!-- Component: Component --></div>');
    });
  });

  describe('attributes', () => {
    test('should render attributes correctly', () => {
      const source = '<div class="container" id="main"><p title="tooltip">Content</p></div>';
      const { ast } = parseAstro(source);
      const html = buildHtml(ast);

      expect(html).toBe('<div class="container" id="main"><p title="tooltip">Content</p></div>');
    });

    test('should render boolean attributes', () => {
      const source = '<input type="checkbox" checked disabled>';
      const { ast } = parseAstro(source);
      const html = buildHtml(ast);

      expect(html).toBe('<input type="checkbox" checked disabled>');
    });

    test('should escape attribute values', () => {
      const source = '<div title="Test &quot;quoted&quot; content">Text</div>';
      const { ast } = parseAstro(source);
      const html = buildHtml(ast);

      expect(html).toBe('<div title="Test &amp;quot;quoted&amp;quot; content">Text</div>');
    });
  });

  describe('text content', () => {
    test('should escape HTML in text content', () => {
      const source = '<p>This is &lt;script&gt; &amp; dangerous</p>';
      const { ast } = parseAstro(source);
      const html = buildHtml(ast);

      expect(html).toBe('<p>This is &amp;lt;script&amp;gt; &amp;amp; dangerous</p>');
    });

    test('should handle whitespace correctly', () => {
      const source = '<div>  <p>  Text with spaces  </p>  </div>';
      const { ast } = parseAstro(source);
      const html = buildHtml(ast);

      expect(html).toBe('<div>  <p>  Text with spaces  </p>  </div>');
    });
  });

  describe('expressions', () => {
    test('should render expressions as comments', () => {
      const source = '<div>{message}</div>';
      const { ast } = parseAstro(source);
      const html = buildHtml(ast);

      expect(html).toBe('<div><!-- Expression: message --></div>');
    });

    test('should handle complex expressions', () => {
      const source = '<div>{user.name || "Guest"}</div>';
      const { ast } = parseAstro(source);
      const html = buildHtml(ast);

      expect(html).toBe('<div><!-- Expression: user.name || "Guest" --></div>');
    });
  });

  describe('components', () => {
    test('should render components as comments', () => {
      const source = '<Layout><Header title="Test" /></Layout>';
      const { ast } = parseAstro(source);
      const html = buildHtml(ast);

      expect(html).toBe('<!-- Component: Layout -->');
    });

    test('should handle client directives', () => {
      const source = '<Counter client:load count={5} />';
      const { ast } = parseAstro(source);
      const html = buildHtml(ast);

      expect(html).toBe('<!-- Component: Counter -->');
    });
  });

  describe('frontmatter', () => {
    test('should not render frontmatter in HTML output', () => {
      const source = `---
const title = 'Hello';
---
<div>{title}</div>`;
      const { ast } = parseAstro(source);
      const html = buildHtml(ast);

      expect(html.trim()).toBe('<div><!-- Expression: title --></div>');
    });
  });

  describe('pretty printing', () => {
    test('should format HTML with proper indentation', () => {
      const source = '<div><p>Hello</p><span>World</span></div>';
      const { ast } = parseAstro(source);
      const html = buildHtml(ast, { prettyPrint: true });

      expect(html).toBe(`<div>
  <p>Hello</p>
  <span>World</span>
</div>
`);
    });

    test('should keep inline content on same line', () => {
      const source = '<p>Simple text content</p>';
      const { ast } = parseAstro(source);
      const html = buildHtml(ast, { prettyPrint: true });

      expect(html).toBe('<p>Simple text content</p>\n');
    });

    test('should use custom indentation', () => {
      const source = '<div><p>Test</p></div>';
      const { ast } = parseAstro(source);
      const html = buildHtml(ast, { prettyPrint: true, indent: '    ' });

      expect(html).toBe(`<div>
    <p>Test</p>
</div>
`);
    });
  });

  describe('complex structures', () => {
    test('should handle nested elements correctly', () => {
      const source = `<article>
        <header>
          <h1>Title</h1>
          <p>Subtitle</p>
        </header>
        <main>
          <p>Content</p>
        </main>
      </article>`;
      const { ast } = parseAstro(source);
      const html = buildHtml(ast);

      expect(html).toContain('<article>');
      expect(html).toContain('<header>');
      expect(html).toContain('<h1>Title</h1>');
      expect(html).toContain('</article>');
    });

    test('should handle mixed content types', () => {
      const source = `<div>
        Text content
        <Component prop="value" />
        {expression}
        <p>More text</p>
      </div>`;
      const { ast } = parseAstro(source);
      const html = buildHtml(ast);

      expect(html).toContain('<div>');
      expect(html).toContain('Text content');
      expect(html).toContain('<!-- Component: Component -->');
      expect(html).toContain('<!-- Expression: expression -->');
      expect(html).toContain('<p>More text</p>');
      expect(html).toContain('</div>');
    });
  });
});
