import type { Plugin } from 'vite';
import { parseAstro } from '../parse.js';
import { type AstroHmrState, analyzeAstForHmr, handleAstroHmr } from './hmr.js';
import { transformAstroToJs } from './transform.js';

export interface AstroVitePluginOptions {
  /**
   * Enable development mode features
   */
  dev?: boolean;

  /**
   * Enable pretty printing for HTML output
   */
  prettyPrint?: boolean;

  /**
   * Custom file extensions to handle
   */
  extensions?: string[];
}

const DEFAULT_OPTIONS: Required<AstroVitePluginOptions> = {
  dev: false,
  prettyPrint: true,
  extensions: ['.astro'],
};

/**
 * Vite plugin for processing .astro files
 */
export function astroVitePlugin(options: AstroVitePluginOptions = {}): Plugin {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  // Store HMR state for each file
  const hmrStateMap = new Map<string, AstroHmrState>();

  return {
    name: 'astro-lite',

    // Handle .astro files
    load(id) {
      if (opts.extensions.some((ext) => id.endsWith(ext))) {
        // Let Vite handle the file reading, we'll transform in transform hook
        return null;
      }
      return null;
    },

    transform(code, id) {
      if (!opts.extensions.some((ext) => id.endsWith(ext))) {
        return null;
      }

      try {
        // Parse the .astro file
        const parseResult = parseAstro(code, {
          filename: id,
        });

        // Report any parsing errors
        if (parseResult.diagnostics.length > 0) {
          const errors = parseResult.diagnostics.filter((d) => d.severity === 'error');
          if (errors.length > 0) {
            const error = errors[0];
            throw new Error(
              `${error.code}: ${error.message} at ${id}:${error.loc.start.line}:${error.loc.start.column}`
            );
          }
        }

        // Analyze AST for HMR
        const hmrState = analyzeAstForHmr(parseResult.ast, id);

        // Store HMR state for later comparison
        if (opts.dev) {
          hmrStateMap.set(id, hmrState);
        }

        // Transform to JavaScript module
        const transformed = transformAstroToJs(parseResult.ast, {
          filename: id,
          dev: opts.dev,
          prettyPrint: opts.prettyPrint,
        });

        return {
          code: transformed,
          map: null, // TODO: Add source maps
        };
      } catch (error) {
        // Re-throw with better error context
        throw new Error(
          `Failed to transform ${id}: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    },

    // Handle HMR for .astro files
    async handleHotUpdate(ctx) {
      if (!opts.extensions.some((ext) => ctx.file.endsWith(ext))) {
        return undefined;
      }

      if (!opts.dev) {
        return [];
      }

      try {
        // Read and parse the updated file
        const content = await ctx.read();
        const parseResult = parseAstro(content, { filename: ctx.file });

        // Analyze new HMR state
        const newHmrState = analyzeAstForHmr(parseResult.ast, ctx.file);
        const oldHmrState = hmrStateMap.get(ctx.file);

        // Handle HMR update
        if (oldHmrState) {
          const affectedModules = handleAstroHmr(
            {
              file: ctx.file,
              modules: ctx.modules,
              server: ctx.server,
              read: ctx.read,
            },
            oldHmrState,
            newHmrState
          );

          // Update stored state
          hmrStateMap.set(ctx.file, newHmrState);

          return affectedModules;
        }

        // First time seeing this file, store state and do full reload
        hmrStateMap.set(ctx.file, newHmrState);
        ctx.server.ws.send({
          type: 'full-reload',
        });
        return Array.from(ctx.modules);
      } catch (error) {
        // If parsing fails, do a full reload
        console.error(`[astro-lite] HMR error for ${ctx.file}:`, error);
        ctx.server.ws.send({
          type: 'full-reload',
        });
        return Array.from(ctx.modules);
      }
    },
  };
}
