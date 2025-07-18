// Main compiler exports
export { parseAstro } from './parse.js';
export { buildHtml } from './html-builder.js';
export { tokenize } from './tokenizer.js';
export { build } from './cli/build.js';

// Vite plugin exports
export { astroVitePlugin } from './vite/plugin.js';
export { transformAstroToJs, extractClientScript, hasClientDirectives } from './vite/transform.js';
export { analyzeAstForHmr, handleAstroHmr, canHotReload, injectHmrCode } from './vite/hmr.js';

// Type exports
export type * from '../types/ast.js';
export type { ParseOptions } from './parse.js';
export type { HtmlBuilderOptions } from './html-builder.js';
export type { BuildOptions } from './cli/build.js';
export type { AstroVitePluginOptions } from './vite/plugin.js';
export type { TransformOptions } from './vite/transform.js';
export type { HmrUpdateContext, AstroHmrState } from './vite/hmr.js';
