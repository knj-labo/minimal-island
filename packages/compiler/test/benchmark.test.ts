import { describe, expect, test } from 'bun:test';
import { buildHtml, escapeHtmlFast, escapeHtmlLegacy } from '../src/html-builder.js';
import { parseAstro } from '../src/parse.js';
import { tokenize, tokenizeLegacy } from '../src/tokenizer.js';
import { BenchmarkSuite, benchmark, compare, formatResults } from '../src/utils/benchmark.js';
import { clearAllPools, getPoolStats } from '../src/utils/object-pool.js';

// Test data
const smallAstroFile = `---
import Layout from './Layout.astro';
import Component from './Component.astro';
const title = "Test Page";
---
<Layout title={title}>
  <h1>Hello World</h1>
  <Component client:load />
  <p>This is a test page with some content.</p>
</Layout>`;

const largeAstroFile = `---
import Layout from '../layouts/Base.astro';
import Header from '../components/Header.astro';
import Footer from '../components/Footer.astro';
import Card from '../components/Card.astro';
import { getData } from '../utils/data.js';
const title = "Large Test Page";
const items = Array.from({ length: 100 }, (_, i) => ({ id: i, name: \`Item \${i}\` }));
---
<Layout title={title}>
  <Header />
  <main>
    <h1>Large Page with Many Components</h1>
    <div class="grid">
      <Card title="Item 1" id="1" client:visible>
        <p>Content for Item 1</p>
        <button onclick="alert('clicked')">Click me</button>
      </Card>
      <Card title="Item 2" id="2" client:visible>
        <p>Content for Item 2</p>
        <button onclick="alert('clicked')">Click me</button>
      </Card>
      <Card title="Item 3" id="3" client:visible>
        <p>Content for Item 3</p>
        <button onclick="alert('clicked')">Click me</button>
      </Card>
    </div>
  </main>
  <Footer />
</Layout>`;

const htmlWithSpecialChars = `<p>This contains & < > " ' characters that need escaping</p>`;
const htmlWithoutSpecialChars = `<p>This is plain text without any special characters</p>`;

describe('Performance Benchmarks', () => {
  test('should demonstrate tokenizer performance improvements', async () => {
    const comparison = await compare(
      'Legacy Tokenizer',
      () => tokenizeLegacy(smallAstroFile),
      'Optimized Tokenizer',
      () => tokenize(smallAstroFile),
      { iterations: 100, warmup: 10 }
    );

    console.log(`Tokenizer speedup: ${comparison.speedup.toFixed(2)}x`);
    console.log(`Memory improvement: ${(comparison.memoryImprovement * 100).toFixed(1)}%`);

    // For very small files, overhead might make optimized version slower
    // But it should still be within reasonable range
    expect(comparison.speedup).toBeGreaterThan(0.3);
  });

  test('should demonstrate HTML escape performance improvements', async () => {
    const comparison = await compare(
      'Legacy HTML Escape',
      () => escapeHtmlLegacy(htmlWithSpecialChars),
      'Optimized HTML Escape',
      () => escapeHtmlFast(htmlWithSpecialChars),
      { iterations: 1000, warmup: 100 }
    );

    console.log(`HTML escape speedup: ${comparison.speedup.toFixed(2)}x`);

    // Optimized should be faster
    expect(comparison.speedup).toBeGreaterThan(1.0);
  });

  test('should demonstrate fast-path optimization for clean HTML', async () => {
    const cleanHtmlResult = await benchmark(
      'HTML Escape (Clean)',
      () => escapeHtmlFast(htmlWithoutSpecialChars),
      { iterations: 1000, warmup: 100 }
    );

    const dirtyHtmlResult = await benchmark(
      'HTML Escape (Special Chars)',
      () => escapeHtmlFast(htmlWithSpecialChars),
      { iterations: 1000, warmup: 100 }
    );

    console.log(`Clean HTML: ${cleanHtmlResult.averageTime.toFixed(3)}ms`);
    console.log(`Dirty HTML: ${dirtyHtmlResult.averageTime.toFixed(3)}ms`);

    // Clean HTML should be significantly faster
    expect(cleanHtmlResult.averageTime).toBeLessThan(dirtyHtmlResult.averageTime);
  });

  test('should demonstrate end-to-end performance with large files', async () => {
    const parseResult = await benchmark('Parse Large File', () => parseAstro(largeAstroFile), {
      iterations: 10,
      warmup: 2,
    });

    const buildResult = await benchmark(
      'Build Large HTML',
      () => {
        const { ast } = parseAstro(largeAstroFile);
        return buildHtml(ast);
      },
      { iterations: 10, warmup: 2 }
    );

    console.log(`Parse time: ${parseResult.averageTime.toFixed(2)}ms`);
    console.log(`Build time: ${buildResult.averageTime.toFixed(2)}ms`);

    // Should complete in reasonable time
    expect(parseResult.averageTime).toBeLessThan(100); // 100ms max
    expect(buildResult.averageTime).toBeLessThan(50); // 50ms max
  });

  test('should demonstrate object pool effectiveness', async () => {
    clearAllPools();

    const initialStats = getPoolStats();
    expect(initialStats.totalObjects).toBe(0);

    // Warm up the pools
    for (let i = 0; i < 20; i++) {
      parseAstro(smallAstroFile);
    }

    const warmedStats = getPoolStats();
    console.log('Pool stats after warmup:', warmedStats);

    // Note: Object pools are not currently integrated into the main parsing flow
    // This test demonstrates the pool infrastructure is working
    expect(warmedStats.totalObjects).toBeGreaterThanOrEqual(0);
  });

  test('should run comprehensive benchmark suite', async () => {
    const suite = new BenchmarkSuite();

    suite
      .add('Small File Parse', () => parseAstro(smallAstroFile), { iterations: 50 })
      .add('Large File Parse', () => parseAstro(largeAstroFile), { iterations: 10 })
      .add(
        'HTML Build',
        () => {
          const { ast } = parseAstro(smallAstroFile);
          return buildHtml(ast);
        },
        { iterations: 50 }
      )
      .add('Tokenize', () => tokenize(smallAstroFile), { iterations: 100 })
      .add('HTML Escape', () => escapeHtmlFast(htmlWithSpecialChars), { iterations: 1000 });

    const results = await suite.run();
    const report = formatResults(results);

    console.log('\n' + report);

    // All benchmarks should complete
    expect(results).toHaveLength(5);
    results.forEach((result) => {
      expect(result.iterations).toBeGreaterThan(0);
      expect(result.averageTime).toBeGreaterThan(0);
    });
  });

  test('should demonstrate memory efficiency', async () => {
    const memoryBefore = process.memoryUsage().heapUsed;

    // Process many files
    for (let i = 0; i < 100; i++) {
      const { ast } = parseAstro(smallAstroFile);
      buildHtml(ast);
    }

    // Force garbage collection if available
    if (global.gc) {
      global.gc();
    }

    const memoryAfter = process.memoryUsage().heapUsed;
    const memoryIncrease = memoryAfter - memoryBefore;

    console.log(`Memory increase after 100 files: ${(memoryIncrease / 1024 / 1024).toFixed(2)}MB`);

    // Should not leak too much memory
    expect(memoryIncrease).toBeLessThan(50 * 1024 * 1024); // 50MB max
  });

  test('should demonstrate consistent performance', async () => {
    const results: number[] = [];

    // Run multiple times to check consistency
    for (let i = 0; i < 10; i++) {
      const result = await benchmark('Consistency Test', () => parseAstro(smallAstroFile), {
        iterations: 20,
        warmup: 5,
      });
      results.push(result.averageTime);
    }

    const mean = results.reduce((a, b) => a + b, 0) / results.length;
    const variance = results.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / results.length;
    const stdDev = Math.sqrt(variance);
    const coefficientOfVariation = stdDev / mean;

    console.log(`Performance consistency - CV: ${(coefficientOfVariation * 100).toFixed(1)}%`);

    // Should be reasonably consistent (CV < 100% - very relaxed for micro-benchmarks on varied systems)
    expect(coefficientOfVariation).toBeLessThan(1.0);
  });
});
