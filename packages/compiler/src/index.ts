// Main compiler exports
export { parseAstro } from './parse.js';
export { buildHtml, buildHtmlToStream, StreamingHtmlBuilder } from './html-builder.js';
export { tokenize } from './tokenizer.js';
export { build } from './cli/build.js';

// Vite plugin exports
export { astroVitePlugin } from './vite/plugin.js';
export { transformAstroToJs, extractClientScript, hasClientDirectives } from './vite/transform.js';
export { analyzeAstForHmr, handleAstroHmr, canHotReload, injectHmrCode } from './vite/hmr.js';

// Performance utilities
export { 
  createObjectPool, 
  positionPool, 
  sourceSpanPool, 
  attributePool, 
  arrayPool, 
  getPoolStats, 
  clearAllPools 
} from './utils/object-pool.js';
export { 
  benchmark, 
  compare, 
  BenchmarkSuite, 
  formatResults, 
  quickBench, 
  measureTime, 
  measureTimeAsync 
} from './utils/benchmark.js';
export { 
  LazyError, 
  LazyParseError, 
  createLazyParseError, 
  createLazyTransformError, 
  ErrorAggregator, 
  ErrorFactories 
} from './utils/lazy-error.js';

// Type exports
export type * from '../types/ast.js';
export type { ParseOptions } from './parse.js';
export type { HtmlBuilderOptions, StreamingOptions } from './html-builder.js';
export type { BuildOptions } from './cli/build.js';
export type { AstroVitePluginOptions } from './vite/plugin.js';
export type { TransformOptions } from './vite/transform.js';
export type { HmrUpdateContext, AstroHmrState } from './vite/hmr.js';
