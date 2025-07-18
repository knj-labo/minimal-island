/**
 * Performance benchmarking utilities for regression testing
 */

export interface BenchmarkResult {
  name: string;
  duration: number;
  memoryUsed: number;
  iterations: number;
  averageTime: number;
  minTime: number;
  maxTime: number;
  throughput?: number;
}

export interface BenchmarkOptions {
  iterations?: number;
  warmup?: number;
  timeout?: number;
  collectGC?: boolean;
  measureMemory?: boolean;
}

const DEFAULT_OPTIONS: Required<BenchmarkOptions> = {
  iterations: 100,
  warmup: 10,
  timeout: 30000,
  collectGC: true,
  measureMemory: true,
};

/**
 * Benchmark a function with detailed performance metrics
 */
export async function benchmark(
  name: string,
  fn: () => any | Promise<any>,
  options: BenchmarkOptions = {}
): Promise<BenchmarkResult> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  
  // Force garbage collection if available
  if (opts.collectGC && global.gc) {
    global.gc();
  }
  
  const memoryBefore = opts.measureMemory ? process.memoryUsage().heapUsed : 0;
  
  // Warmup runs
  for (let i = 0; i < opts.warmup; i++) {
    await fn();
  }
  
  // Force GC after warmup
  if (opts.collectGC && global.gc) {
    global.gc();
  }
  
  const times: number[] = [];
  const startTime = performance.now();
  
  // Benchmark runs
  for (let i = 0; i < opts.iterations; i++) {
    const iterStart = performance.now();
    await fn();
    const iterEnd = performance.now();
    times.push(iterEnd - iterStart);
    
    // Check timeout
    if (performance.now() - startTime > opts.timeout) {
      break;
    }
  }
  
  const endTime = performance.now();
  const memoryAfter = opts.measureMemory ? process.memoryUsage().heapUsed : 0;
  
  times.sort((a, b) => a - b);
  
  return {
    name,
    duration: endTime - startTime,
    memoryUsed: memoryAfter - memoryBefore,
    iterations: times.length,
    averageTime: times.reduce((a, b) => a + b, 0) / times.length,
    minTime: times[0],
    maxTime: times[times.length - 1],
  };
}

/**
 * Benchmark with throughput measurement
 */
export async function benchmarkThroughput(
  name: string,
  fn: () => any | Promise<any>,
  itemCount: number,
  options: BenchmarkOptions = {}
): Promise<BenchmarkResult> {
  const result = await benchmark(name, fn, options);
  
  return {
    ...result,
    throughput: itemCount / (result.averageTime / 1000), // items per second
  };
}

/**
 * Compare two functions performance
 */
export async function compare(
  name1: string,
  fn1: () => any | Promise<any>,
  name2: string,
  fn2: () => any | Promise<any>,
  options: BenchmarkOptions = {}
): Promise<{
  baseline: BenchmarkResult;
  comparison: BenchmarkResult;
  speedup: number;
  memoryImprovement: number;
}> {
  const baseline = await benchmark(name1, fn1, options);
  const comparison = await benchmark(name2, fn2, options);
  
  return {
    baseline,
    comparison,
    speedup: baseline.averageTime / comparison.averageTime,
    memoryImprovement: (baseline.memoryUsed - comparison.memoryUsed) / baseline.memoryUsed,
  };
}

/**
 * Benchmark suite for running multiple benchmarks
 */
export class BenchmarkSuite {
  private benchmarks: Array<{
    name: string;
    fn: () => any | Promise<any>;
    options?: BenchmarkOptions;
  }> = [];
  
  add(name: string, fn: () => any | Promise<any>, options?: BenchmarkOptions): this {
    this.benchmarks.push({ name, fn, options });
    return this;
  }
  
  async run(): Promise<BenchmarkResult[]> {
    const results: BenchmarkResult[] = [];
    
    for (const { name, fn, options } of this.benchmarks) {
      console.log(`Running benchmark: ${name}`);
      const result = await benchmark(name, fn, options);
      results.push(result);
    }
    
    return results;
  }
  
  clear(): this {
    this.benchmarks = [];
    return this;
  }
}

/**
 * Format benchmark results for display
 */
export function formatResults(results: BenchmarkResult[]): string {
  if (results.length === 0) return 'No benchmark results';
  
  const lines: string[] = [];
  lines.push('Benchmark Results:');
  lines.push('='.repeat(50));
  
  for (const result of results) {
    lines.push(`${result.name}:`);
    lines.push(`  Iterations: ${result.iterations}`);
    lines.push(`  Average time: ${result.averageTime.toFixed(2)}ms`);
    lines.push(`  Min time: ${result.minTime.toFixed(2)}ms`);
    lines.push(`  Max time: ${result.maxTime.toFixed(2)}ms`);
    lines.push(`  Memory used: ${(result.memoryUsed / 1024 / 1024).toFixed(2)}MB`);
    
    if (result.throughput) {
      lines.push(`  Throughput: ${result.throughput.toFixed(0)} items/sec`);
    }
    
    lines.push('');
  }
  
  return lines.join('\n');
}

/**
 * Memory usage tracker
 */
export class MemoryTracker {
  private snapshots: Array<{ label: string; memory: NodeJS.MemoryUsage; timestamp: number }> = [];
  
  snapshot(label: string): void {
    this.snapshots.push({
      label,
      memory: process.memoryUsage(),
      timestamp: Date.now(),
    });
  }
  
  getReport(): string {
    if (this.snapshots.length === 0) return 'No memory snapshots';
    
    const lines: string[] = [];
    lines.push('Memory Usage Report:');
    lines.push('='.repeat(50));
    
    for (let i = 0; i < this.snapshots.length; i++) {
      const snapshot = this.snapshots[i];
      const { heapUsed, heapTotal, external, rss } = snapshot.memory;
      
      lines.push(`${snapshot.label} (${new Date(snapshot.timestamp).toISOString()}):`);
      lines.push(`  RSS: ${(rss / 1024 / 1024).toFixed(2)}MB`);
      lines.push(`  Heap Used: ${(heapUsed / 1024 / 1024).toFixed(2)}MB`);
      lines.push(`  Heap Total: ${(heapTotal / 1024 / 1024).toFixed(2)}MB`);
      lines.push(`  External: ${(external / 1024 / 1024).toFixed(2)}MB`);
      
      if (i > 0) {
        const prev = this.snapshots[i - 1];
        const heapDiff = heapUsed - prev.memory.heapUsed;
        const timeDiff = snapshot.timestamp - prev.timestamp;
        
        lines.push(`  Heap Diff: ${(heapDiff / 1024 / 1024).toFixed(2)}MB`);
        lines.push(`  Time Diff: ${timeDiff}ms`);
      }
      
      lines.push('');
    }
    
    return lines.join('\n');
  }
  
  clear(): void {
    this.snapshots = [];
  }
}

/**
 * Performance regression detector
 */
export class RegressionDetector {
  private baselines = new Map<string, BenchmarkResult>();
  
  setBaseline(name: string, result: BenchmarkResult): void {
    this.baselines.set(name, result);
  }
  
  checkRegression(
    name: string,
    result: BenchmarkResult,
    threshold = 0.1 // 10% slower is considered regression
  ): {
    isRegression: boolean;
    slowdown: number;
    baseline?: BenchmarkResult;
  } {
    const baseline = this.baselines.get(name);
    
    if (!baseline) {
      return { isRegression: false, slowdown: 0 };
    }
    
    const slowdown = (result.averageTime - baseline.averageTime) / baseline.averageTime;
    
    return {
      isRegression: slowdown > threshold,
      slowdown,
      baseline,
    };
  }
  
  saveBaselines(filepath: string): void {
    const data = JSON.stringify(Array.from(this.baselines.entries()), null, 2);
    // In a real implementation, you'd write to the filesystem
    console.log(`Saving baselines to ${filepath}:`, data);
  }
  
  loadBaselines(filepath: string): void {
    // In a real implementation, you'd read from the filesystem
    console.log(`Loading baselines from ${filepath}`);
  }
}

/**
 * Quick performance test utility
 */
export async function quickBench(
  name: string,
  fn: () => any | Promise<any>,
  iterations = 10
): Promise<number> {
  const start = performance.now();
  
  for (let i = 0; i < iterations; i++) {
    await fn();
  }
  
  const end = performance.now();
  const avgTime = (end - start) / iterations;
  
  console.log(`${name}: ${avgTime.toFixed(2)}ms avg (${iterations} iterations)`);
  
  return avgTime;
}

/**
 * Utility to measure function execution time
 */
export function measureTime<T>(fn: () => T): { result: T; time: number } {
  const start = performance.now();
  const result = fn();
  const end = performance.now();
  
  return { result, time: end - start };
}

/**
 * Async version of measureTime
 */
export async function measureTimeAsync<T>(fn: () => Promise<T>): Promise<{ result: T; time: number }> {
  const start = performance.now();
  const result = await fn();
  const end = performance.now();
  
  return { result, time: end - start };
}