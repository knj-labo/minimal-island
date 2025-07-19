import type { HmrContext, ModuleNode } from 'vite';
import type { FragmentNode } from '../../types/ast.js';
import { createContextualLogger } from '../utils/logger.js';
import { hasClientDirectives } from './transform.js';

export interface HmrUpdateContext {
  file: string;
  modules: Array<ModuleNode>;
  server: HmrContext['server'];
  read: HmrContext['read'];
}

export interface AstroHmrState {
  hasClientDirectives: boolean;
  imports: string[];
  exports: string[];
  cssModules: string[];
}

/**
 * Analyzes an AST to determine HMR boundaries and dependencies
 */
export function analyzeAstForHmr(ast: FragmentNode, _filePath: string): AstroHmrState {
  const state: AstroHmrState = {
    hasClientDirectives: hasClientDirectives(ast),
    imports: [],
    exports: [],
    cssModules: [],
  };

  // Extract imports from frontmatter
  const frontmatter = ast.children.find((child) => child.type === 'Frontmatter');
  if (frontmatter && 'code' in frontmatter) {
    state.imports = extractImportsFromCode(frontmatter.code);
  }

  // Check for CSS imports or style blocks
  // TODO: Implement CSS module detection when we add CSS support

  return state;
}

/**
 * Determines if a component can be hot-reloaded or needs a full page reload
 */
export function canHotReload(oldState: AstroHmrState, newState: AstroHmrState): boolean {
  // If client directives changed, we need a full reload
  if (oldState.hasClientDirectives !== newState.hasClientDirectives) {
    return false;
  }

  // If imports changed, we need a full reload
  if (!arraysEqual(oldState.imports, newState.imports)) {
    return false;
  }

  // If exports changed, we need a full reload
  if (!arraysEqual(oldState.exports, newState.exports)) {
    return false;
  }

  // If CSS modules changed, we need a full reload
  if (!arraysEqual(oldState.cssModules, newState.cssModules)) {
    return false;
  }

  return true;
}

/**
 * Handles HMR updates for .astro files
 */
export function handleAstroHmr(
  ctx: HmrUpdateContext,
  oldState: AstroHmrState,
  newState: AstroHmrState
): ModuleNode[] {
  const { file, modules, server } = ctx;
  const affectedModules: ModuleNode[] = [];

  // If we can't hot reload, trigger a full page reload
  if (!canHotReload(oldState, newState)) {
    server.ws.send({
      type: 'full-reload',
      path: '*',
    });
    return modules;
  }

  // For now, we'll do a simple module update
  // In a more advanced implementation, we could:
  // 1. Update only the changed parts of the DOM
  // 2. Preserve component state where possible
  // 3. Handle CSS updates separately

  for (const mod of modules) {
    if (mod.file === file) {
      server.reloadModule(mod);
      affectedModules.push(mod);
    }
  }

  // Send custom HMR update message
  server.ws.send({
    type: 'custom',
    event: 'astro-update',
    data: {
      file,
      timestamp: Date.now(),
      hasClientDirectives: newState.hasClientDirectives,
    },
  });

  return affectedModules;
}

/**
 * Extracts import statements from frontmatter code
 */
function extractImportsFromCode(code: string): string[] {
  const imports: string[] = [];
  const importRegex = /import\s+(?:[\w\s{},*]+\s+from\s+)?['"]([^'"]+)['"];?/g;

  let match: RegExpExecArray | null;
  match = importRegex.exec(code);
  while (match !== null) {
    imports.push(match[1]);
    match = importRegex.exec(code);
  }

  return imports;
}

/**
 * Utility function to compare arrays for equality
 */
function arraysEqual<T>(a: T[], b: T[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((val, index) => val === b[index]);
}

/**
 * Creates HMR client-side code for .astro components
 */
export function createHmrClientCode(filePath: string): string {
  return `
// HMR client code for ${filePath}
if (import.meta.hot) {
  import.meta.hot.accept((newModule) => {
    // Handle module update
    if (newModule) {
      // Update the component
      console.log('[minimal-astro] Hot updated:', ${JSON.stringify(filePath)});
    }
  });

  // Listen for custom astro-update events
  import.meta.hot.on('astro-update', (data) => {
    if (data.file === ${JSON.stringify(filePath)}) {
      console.log('[minimal-astro] Component updated:', data);
      // In a full implementation, this would update the DOM
    }
  });
}
`;
}

/**
 * Injects HMR code into the transformed JavaScript
 */
export function injectHmrCode(jsCode: string, filePath: string, dev: boolean): string {
  if (!dev) {
    return jsCode;
  }

  const hmrCode = createHmrClientCode(filePath);
  return `${jsCode}\n\n${hmrCode}`;
}
