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
// Cache interfaces for performance optimization
interface CacheEntry<T> {
  value: T;
  hash: string;
  timestamp: number;
}

interface TransformCache {
  code: string;
  map: any;
}

interface ParseCache {
  ast: any;
  diagnostics: any[];
}

// Fast hash function for cache keys
function quickHash(str: string): string {
  let hash = 2166136261;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash.toString(36);
}

// Cache manager factory function
function createPluginCache(maxAge = 5 * 60 * 1000) {
  const astCache = new Map<string, CacheEntry<ParseCache>>();
  const transformCache = new Map<string, CacheEntry<TransformCache>>();
  const dependencyGraph = new Map<string, Set<string>>();

  const isExpired = (entry: CacheEntry<any>): boolean => {
    return Date.now() - entry.timestamp > maxAge;
  };

  return {
    getAst(id: string, code: string): ParseCache | null {
      const hash = quickHash(code);
      const entry = astCache.get(id);

      if (entry && entry.hash === hash && !isExpired(entry)) {
        return entry.value;
      }

      return null;
    },

    setAst(id: string, code: string, ast: any, diagnostics: any[]): void {
      const hash = quickHash(code);
      astCache.set(id, {
        value: { ast, diagnostics },
        hash,
        timestamp: Date.now(),
      });
    },

    getTransform(id: string, code: string): TransformCache | null {
      const hash = quickHash(code);
      const entry = transformCache.get(id);

      if (entry && entry.hash === hash && !isExpired(entry)) {
        return entry.value;
      }

      return null;
    },

    setTransform(id: string, code: string, result: TransformCache): void {
      const hash = quickHash(code);
      transformCache.set(id, {
        value: result,
        hash,
        timestamp: Date.now(),
      });
    },

    setDependencies(id: string, dependencies: string[]): void {
      dependencyGraph.set(id, new Set(dependencies));
    },

    getDependents(id: string): string[] {
      const dependents: string[] = [];
      for (const [file, deps] of dependencyGraph.entries()) {
        if (deps.has(id)) {
          dependents.push(file);
        }
      }
      return dependents;
    },

    invalidate(id: string): void {
      astCache.delete(id);
      transformCache.delete(id);
      dependencyGraph.delete(id);
    },

    invalidateAll(): void {
      astCache.clear();
      transformCache.clear();
      dependencyGraph.clear();
    },

    cleanup(): void {
      const now = Date.now();

      for (const [id, entry] of astCache.entries()) {
        if (now - entry.timestamp > maxAge) {
          astCache.delete(id);
        }
      }

      for (const [id, entry] of transformCache.entries()) {
        if (now - entry.timestamp > maxAge) {
          transformCache.delete(id);
        }
      }
    },
  };
}

export function astroVitePlugin(options: AstroVitePluginOptions = {}): Plugin {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  // Store HMR state for each file
  const hmrStateMap = new Map<string, AstroHmrState>();

  // Initialize cache
  const cache = createPluginCache();

  // Cleanup interval
  const cleanupInterval = setInterval(() => {
    cache.cleanup();
  }, 60000); // Every minute

  // Extract dependencies from AST
  function extractDependencies(ast: any): string[] {
    const dependencies: string[] = [];

    function walkNode(node: any) {
      if (!node) return;

      if (node.type === 'Component' && node.tag) {
        // Component imports (e.g., <ComponentName />)
        dependencies.push(node.tag);
      }

      // Recursively walk children
      if (node.children) {
        node.children.forEach(walkNode);
      }
    }

    // Extract from frontmatter
    if (ast.children) {
      const frontmatter = ast.children.find((child: any) => child.type === 'Frontmatter');
      if (frontmatter && frontmatter.code) {
        const importMatches = frontmatter.code.match(/import\s+[^'"]+['"]([^'"]+)['"];?/g);
        if (importMatches) {
          importMatches.forEach((match: string) => {
            const pathMatch = match.match(/['"]([^'"]+)['"];?/);
            if (pathMatch) {
              dependencies.push(pathMatch[1]);
            }
          });
        }
      }
    }

    walkNode(ast);

    return [...new Set(dependencies)]; // Remove duplicates
  }

  return {
    name: 'minimal-astro',

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
        // Check transform cache first
        const cachedTransform = cache.getTransform(id, code);
        if (cachedTransform) {
          return cachedTransform;
        }

        // Check AST cache
        let parseResult;
        const cachedAst = cache.getAst(id, code);
        if (cachedAst) {
          parseResult = cachedAst;
        } else {
          // Parse the .astro file
          parseResult = parseAstro(code, {
            filename: id,
          });

          // Cache the AST
          cache.setAst(id, code, parseResult.ast, parseResult.diagnostics);
        }

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

        // Analyze AST for HMR and extract dependencies
        const hmrState = analyzeAstForHmr(parseResult.ast, id);
        const dependencies = extractDependencies(parseResult.ast);

        // Store HMR state and dependencies for later comparison
        if (opts.dev) {
          hmrStateMap.set(id, hmrState);
          cache.setDependencies(id, dependencies);
        }

        // Transform to JavaScript module
        const transformed = transformAstroToJs(parseResult.ast, {
          filename: id,
          dev: opts.dev,
          prettyPrint: opts.prettyPrint,
        });

        const result = {
          code: transformed,
          map: null, // TODO: Add source maps
        };

        // Cache the transform result
        cache.setTransform(id, code, result);

        return result;
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
        // Invalidate cache for this file
        cache.invalidate(ctx.file);

        // Find all files that depend on this file
        const dependents = cache.getDependents(ctx.file);
        const allAffected = [ctx.file, ...dependents];

        // Invalidate cache for all affected files
        allAffected.forEach((file) => cache.invalidate(file));

        // Read and parse the updated file
        const content = await ctx.read();
        const parseResult = parseAstro(content, { filename: ctx.file });

        // Analyze new HMR state and dependencies
        const newHmrState = analyzeAstForHmr(parseResult.ast, ctx.file);
        const newDependencies = extractDependencies(parseResult.ast);
        const oldHmrState = hmrStateMap.get(ctx.file);

        // Update dependencies in cache
        cache.setDependencies(ctx.file, newDependencies);

        // Get all affected modules from Vite
        const affectedModules = new Set<any>();

        // Add the changed file's modules
        ctx.modules.forEach((mod) => affectedModules.add(mod));

        // Add modules for dependent files
        for (const depFile of dependents) {
          const depModule = ctx.server.moduleGraph.getModuleById(depFile);
          if (depModule) {
            affectedModules.add(depModule);
          }
        }

        // Handle HMR update
        if (oldHmrState) {
          const hmrResult = handleAstroHmr(
            {
              file: ctx.file,
              modules: Array.from(affectedModules),
              server: ctx.server,
              read: ctx.read,
            },
            oldHmrState,
            newHmrState
          );

          // Update stored state
          hmrStateMap.set(ctx.file, newHmrState);

          return hmrResult;
        }

        // First time seeing this file, store state and do full reload
        hmrStateMap.set(ctx.file, newHmrState);
        ctx.server.ws.send({
          type: 'full-reload',
        });
        return Array.from(affectedModules);
      } catch (error) {
        // If parsing fails, do a full reload
        console.error(`[minimal-astro] HMR error for ${ctx.file}:`, error);

        // Invalidate cache for this file
        cache.invalidate(ctx.file);

        ctx.server.ws.send({
          type: 'full-reload',
        });
        return Array.from(ctx.modules);
      }
    },

    // Cleanup when plugin is destroyed
    buildEnd() {
      if (cleanupInterval) {
        clearInterval(cleanupInterval);
      }
      cache.invalidateAll();
    },
  };
}
