// Main compiler exports
export { parseAstro } from './parse.js';
export { buildHtml, buildHtmlToStream, createStreamingHtmlBuilder } from './html-builder.js';
export { tokenize } from './tokenizer.js';
export { build } from './cli/build.js';

// Vite plugin exports
export { astroVitePlugin } from './vite/plugin.js';
export { transformAstroToJs, extractClientScript, hasClientDirectives } from './vite/transform.js';
export { analyzeAstForHmr, handleAstroHmr, canHotReload, injectHmrCode } from './vite/hmr.js';

// Renderer exports
export {
  createReactRenderer,
  createSSRRenderer,
  createClientRenderer,
  type ReactRendererOptions,
  type RenderResult,
  type HydrationData,
  type ClientDirective,
} from './renderer/react.js';
export {
  createJSXTransformer,
  astToJSX,
  astToReactComponent,
  type JSXTransformOptions,
} from './renderer/jsx-transform.js';

// Runtime exports
export {
  createHydrationRuntime,
  autoHydrate,
  hydrate,
  type HydrationOptions,
  type HydrationContext,
} from './runtime/hydrate.js';

// Content Collections exports
export {
  createContentManager,
  initializeContentAPI,
  getContentAPI,
  collections,
  queries,
  type ContentManagerOptions,
} from './content/api.js';
export {
  createSchemaValidator,
  validateContentEntry,
  z,
  type ValidationResult,
  type ValidationError,
} from './content/schema.js';
export {
  createMarkdownLoader,
  createJsonLoader,
  createYamlLoader,
  createAutoLoader,
  parseFrontmatter,
  generateSlug,
  extractHeadings,
  calculateReadingTime,
  type LoaderOptions,
  type MarkdownRenderer,
} from './content/loader.js';
export type {
  ContentConfig,
  CollectionConfig,
  Schema,
  ContentEntry,
  RenderResult,
  Heading,
  ReadingTime,
  ContentLoader,
  ContentTransformer,
  ContentQuery,
  ContentAPI,
} from './content/types.js';

// Performance utilities
export {
  createObjectPool,
  positionPool,
  sourceSpanPool,
  attributePool,
  arrayPool,
  createStringPool,
  globalStringPool,
  getPoolStats,
  clearAllPools,
} from './utils/object-pool.js';
export {
  benchmark,
  compare,
  BenchmarkSuite,
  createBenchmarkSuite,
  MemoryTracker,
  createMemoryTracker,
  RegressionDetector,
  createRegressionDetector,
  formatResults,
  quickBench,
  measureTime,
  measureTimeAsync,
} from './utils/benchmark.js';
export {
  LazyError,
  LazyParseError,
  createLazyError,
  createLazyParseError,
  createLazyTransformError,
  createLazyParseErrorWithContext,
  createLazyTransformErrorWithContext,
  ErrorAggregator,
  createErrorAggregator,
  ErrorFactories,
} from './utils/lazy-error.js';

// Type exports
export type * from '../types/ast.js';
export type { ParseOptions } from './parse.js';
export type { HtmlBuilderOptions, StreamingOptions } from './html-builder.js';
export type { BuildOptions } from './cli/build.js';
export type { AstroVitePluginOptions } from './vite/plugin.js';
export type { TransformOptions } from './vite/transform.js';
export type { HmrUpdateContext, AstroHmrState } from './vite/hmr.js';
