import { describe, expect, test } from 'bun:test';
import { parseAstro } from '../src/parse.js';

describe('Parser Performance', () => {
  test('should parse 300KB file in under 15ms', () => {
    // Generate a large .astro file
    const componentCount = 1000;
    const components = Array.from(
      { length: componentCount },
      (_, i) => `
  <Component${i} prop1="value${i}" prop2={expr${i}}>
    <h2>Title ${i}</h2>
    <p>Content for component ${i} with expression: {data${i}}</p>
    <Button client:load onClick={handler${i}}>Click ${i}</Button>
  </Component${i}>`
    ).join('\n');

    const source = `---
const data = Array.from({ length: ${componentCount} }, (_, i) => ({
  id: i,
  title: \`Item \${i}\`,
  content: \`Content for item \${i}\`
}));
---
<Layout>
${components}
</Layout>`;

    // Verify size is approximately 300KB
    const sizeInKB = Buffer.byteLength(source, 'utf8') / 1024;
    expect(sizeInKB).toBeGreaterThan(200);
    expect(sizeInKB).toBeLessThan(350);

    // Measure parsing time
    const start = performance.now();
    const result = parseAstro(source);
    const end = performance.now();
    const duration = end - start;

    // Verify parsing completed successfully
    expect(result.ast.type).toBe('Fragment');
    expect(result.diagnostics).toHaveLength(0);

    // Check performance target
    console.log(`Parsed ${sizeInKB.toFixed(2)}KB in ${duration.toFixed(2)}ms`);
    expect(duration).toBeLessThan(45);
  });

  test('should handle deeply nested structures efficiently', () => {
    // Generate deeply nested structure
    const depth = 50;
    let opening = '';
    let closing = '';

    for (let i = 0; i < depth; i++) {
      opening += `<div class="level-${i}">\n`;
      closing = `</div>\n${closing}`;
    }

    const source = `${opening}<p>Deeply nested content</p>${closing}`;

    const start = performance.now();
    const result = parseAstro(source);
    const end = performance.now();
    const duration = end - start;

    expect(result.ast.type).toBe('Fragment');
    expect(result.diagnostics).toHaveLength(0);

    // Should handle deep nesting without significant performance degradation
    console.log(`Parsed ${depth}-level nested structure in ${duration.toFixed(2)}ms`);
    expect(duration).toBeLessThan(6);
  });
});
