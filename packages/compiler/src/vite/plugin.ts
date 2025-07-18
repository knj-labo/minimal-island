import type { Plugin } from 'vite';
import { parseAstro } from '../parse.js';
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
    handleHotUpdate(ctx) {
      if (opts.extensions.some((ext) => ctx.file.endsWith(ext))) {
        // Force reload the module
        ctx.server.ws.send({
          type: 'full-reload',
        });
        return [];
      }
      return undefined;
    },
  };
}
