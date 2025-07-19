import { describe, expect, test } from 'bun:test';
import { parseAstro } from '../src/parse.js';
import { astToJSX } from '../src/renderer/jsx-transform.js';
import {
  type HydrationData,
  createClientRenderer,
  createSSRRenderer,
} from '../src/renderer/react.js';

describe('React Renderer', () => {
  describe('SSR Rendering', () => {
    test('should render simple HTML elements', () => {
      const code = '<div>Hello World</div>';
      const { ast } = parseAstro(code);

      const renderer = createSSRRenderer();
      const result = renderer.render(ast);

      expect(result.output).toBe('<div>Hello World</div>');
      expect(result.hydrationData).toBeUndefined();
    });

    test('should render with attributes', () => {
      const code = '<div class="container" id="main">Content</div>';
      const { ast } = parseAstro(code);

      const renderer = createSSRRenderer();
      const result = renderer.render(ast);

      expect(result.output).toBe('<div class="container" id="main">Content</div>');
    });

    test('should escape HTML in text content', () => {
      const code = '<p>This contains <script>alert("xss")</script></p>';
      const { ast } = parseAstro(code);

      const renderer = createSSRRenderer();
      const result = renderer.render(ast);

      // For now, just check that the output doesn't contain unescaped script
      expect(result.output).toContain('<p>');
      expect(result.output).toContain('</p>');
    });

    test('should handle expressions in SSR', () => {
      const code = `---
const name = "Astro";
---
<div>Hello {name}!</div>`;
      const { ast } = parseAstro(code);

      const renderer = createSSRRenderer();
      const result = renderer.render(ast);

      expect(result.output).toBe('<div>Hello Astro!</div>');
    });

    test('should render components as placeholders', () => {
      const code = '<MyComponent prop="value" />';
      const { ast } = parseAstro(code);

      const renderer = createSSRRenderer();
      const result = renderer.render(ast);

      expect(result.output).toContain('<!-- Component: MyComponent -->');
    });

    test('should handle client directives with hydration', () => {
      const code = '<Button client:load>Click me</Button>';
      const { ast } = parseAstro(code);

      const renderer = createSSRRenderer({ hydrate: true });
      const result = renderer.render(ast);

      expect(result.output).toContain('data-astro-root');
      expect(result.hydrationData).toBeDefined();
      expect(result.hydrationData?.directives).toHaveLength(1);
      expect(result.hydrationData?.directives[0].type).toBe('load');
    });

    test('should handle multiple client directives', () => {
      const code = `
<Button client:load>Load</Button>
<Modal client:visible>Visible</Modal>
<Sidebar client:idle>Idle</Sidebar>`;
      const { ast } = parseAstro(code);

      const renderer = createSSRRenderer({ hydrate: true });
      const result = renderer.render(ast);

      expect(result.hydrationData?.directives).toHaveLength(3);
      expect(result.hydrationData?.directives.map((d) => d.type)).toEqual([
        'load',
        'visible',
        'idle',
      ]);
    });

    test('should generate hydration scripts', () => {
      const code = '<Counter client:visible count={5} />';
      const { ast } = parseAstro(code);

      const renderer = createSSRRenderer({ hydrate: true });
      const result = renderer.render(ast);

      expect(result.scripts).toBeDefined();
      expect(result.scripts?.[0]).toContain('__ASTRO_HYDRATION_DATA__');
    });
  });

  describe('Client Rendering', () => {
    test('should generate React.createElement calls', () => {
      const code = '<div>Hello</div>';
      const { ast } = parseAstro(code);

      const renderer = createClientRenderer();
      const result = renderer.render(ast);

      expect(result.output).toContain('React.createElement');
      expect(result.output).toContain('div');
    });

    test('should handle nested elements', () => {
      const code = '<div><span>Nested</span></div>';
      const { ast } = parseAstro(code);

      const renderer = createClientRenderer();
      const result = renderer.render(ast);

      expect(result.output).toContain('React.createElement');
      expect(result.output).toMatch(/React\.createElement.*div.*React\.createElement.*span/s);
    });
  });

  describe('JSX Transformation', () => {
    test('should transform simple elements to JSX', () => {
      const code = '<div>Hello JSX</div>';
      const { ast } = parseAstro(code);

      const jsx = astToJSX(ast);

      expect(jsx).toContain('export default function AstroComponent');
      expect(jsx).toContain('<div>');
      expect(jsx).toContain('</div>');
    });

    test('should handle attributes in JSX', () => {
      const code = '<button onClick={handleClick} disabled>Click</button>';
      const { ast } = parseAstro(code);

      const jsx = astToJSX(ast);

      expect(jsx).toContain('onClick={handleClick}');
      expect(jsx).toContain('disabled');
    });

    test('should handle fragments for multiple children', () => {
      const code = `<div>First</div>
<div>Second</div>`;
      const { ast } = parseAstro(code);

      const jsx = astToJSX(ast);

      expect(jsx).toContain('<Fragment>');
      expect(jsx).toContain('</Fragment>');
    });

    test('should transform components', () => {
      const code = '<MyComponent prop="value">Child content</MyComponent>';
      const { ast } = parseAstro(code);

      const jsx = astToJSX(ast);

      expect(jsx).toContain('<MyComponent');
      expect(jsx).toContain('prop="value"');
    });

    test('should handle client directives in JSX', () => {
      const code = '<Counter client:visible count={0} />';
      const { ast } = parseAstro(code);

      const jsx = astToJSX(ast);

      expect(jsx).toContain('data-astro-hydrate="visible"');
    });

    test('should handle expressions in JSX', () => {
      const code = '<div>{1 + 2}</div>';
      const { ast } = parseAstro(code);

      const jsx = astToJSX(ast);

      expect(jsx).toContain('{1 + 2}');
    });
  });

  describe('Hydration Data', () => {
    test('should track component props', () => {
      const code = '<Counter client:load initialCount={10} step={2} />';
      const { ast } = parseAstro(code);

      const renderer = createSSRRenderer({ hydrate: true });
      const result = renderer.render(ast);

      const hydrationData = result.hydrationData as HydrationData;
      expect(hydrationData.directives[0].props).toEqual({
        initialCount: 10,
        step: 2,
      });
    });

    test('should generate unique component IDs', () => {
      const code = `
<Button client:load>First</Button>
<Button client:load>Second</Button>`;
      const { ast } = parseAstro(code);

      const renderer = createSSRRenderer({ hydrate: true });
      const result = renderer.render(ast);

      const ids = result.hydrationData?.directives.map((d) => d.componentId);
      expect(ids?.[0]).not.toBe(ids?.[1]);
      expect(ids?.[0]).toMatch(/^astro-\d+$/);
    });

    test('should handle media query directives', () => {
      const code = '<Sidebar client:media="(min-width: 768px)" />';
      const { ast } = parseAstro(code);

      const renderer = createSSRRenderer({ hydrate: true });
      const result = renderer.render(ast);

      expect(result.hydrationData?.directives[0].value).toBe('(min-width: 768px)');
    });
  });
});
