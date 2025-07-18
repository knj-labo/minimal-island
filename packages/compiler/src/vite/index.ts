export { astroVitePlugin } from './plugin.js';
export type { AstroVitePluginOptions } from './plugin.js';
export { transformAstroToJs, extractClientScript, hasClientDirectives } from './transform.js';
export type { TransformOptions } from './transform.js';
export { analyzeAstForHmr, handleAstroHmr, canHotReload, injectHmrCode } from './hmr.js';
export type { HmrUpdateContext, AstroHmrState } from './hmr.js';
