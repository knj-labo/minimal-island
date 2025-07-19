import type {
  ComponentNode,
  ElementNode,
  FragmentNode,
  FrontmatterNode,
  Node,
} from '../../types/ast.js';
import { buildHtml } from '../html-builder.js';
import { astToJSX } from '../renderer/jsx-transform.js';
import { createSSRRenderer } from '../renderer/react.js';
// type HydrationData available if needed
import { injectHmrCode } from './hmr.js';

export interface TransformOptions {
  filename: string;
  dev?: boolean;
  prettyPrint?: boolean;
  ssr?: boolean;
  framework?: 'react' | 'preact' | 'vanilla';
  components?: Map<string, unknown>;
}

/**
 * Transform an Astro AST to a JavaScript module
 */
export function transformAstroToJs(ast: FragmentNode, options: TransformOptions): string {
  const {
    filename,
    dev = false,
    prettyPrint = true,
    ssr: _ssr = true,
    framework = 'vanilla',
    components = new Map(),
  } = options;

  // Extract frontmatter
  const frontmatter = ast.children.find((child) => child.type === 'Frontmatter') as
    | FrontmatterNode
    | undefined;
  const templateNodes = ast.children.filter((child) => child.type !== 'Frontmatter');

  // Generate the module
  const parts: string[] = [];

  // Add imports that are commonly needed
  parts.push(`// Auto-generated from ${filename}`);

  // Import React/Preact if needed
  if (framework === 'react' && hasClientDirectives(ast)) {
    parts.push(`import React from 'react';`);
    parts.push(`import { hydrate } from '@minimal-astro/compiler/runtime/hydrate';`);
  }

  // Add frontmatter code if present
  if (frontmatter) {
    parts.push('');
    parts.push('// Frontmatter');
    parts.push(frontmatter.code);
  }

  // Create the render function
  parts.push('');
  parts.push('// Component render function');
  parts.push('export async function render(props = {}) {');

  const templateAst: FragmentNode = {
    type: 'Fragment',
    children: templateNodes,
    loc: ast.loc,
  };

  if (framework !== 'vanilla' && hasClientDirectives(ast)) {
    // Use React renderer for components with client directives
    const renderer = createSSRRenderer({
      hydrate: true,
      components,
      props: {},
    });

    parts.push('  // SSR with hydration support');
    parts.push(`  const renderResult = ${JSON.stringify(renderer.render(templateAst))};`);
    parts.push('  const { output, hydrationData, scripts } = renderResult;');
    parts.push('');
    parts.push('  // Combine HTML with hydration scripts');
    parts.push(
      '  const html = output + (scripts ? scripts.map(s => `<script>${s}</script>`).join("") : "");'
    );
    parts.push('  return { html, hydrationData };');
  } else {
    // Use simple HTML builder for vanilla components
    const staticHtml = buildHtml(templateAst, { prettyPrint });
    parts.push(`  const html = ${JSON.stringify(staticHtml)};`);
    parts.push('  return { html };');
  }

  parts.push('}');

  // Add JSX component export if using React/Preact
  if (framework !== 'vanilla') {
    parts.push('');
    parts.push('// JSX Component export');
    parts.push('export function Component(props = {}) {');

    const jsxCode = astToJSX(templateAst, {
      runtime: framework,
      jsxImportSource: framework,
    });

    parts.push(`  ${jsxCode.split('\n').join('\n  ')}`);
    parts.push('}');
  }

  // Add metadata
  parts.push('');
  parts.push('// Component metadata');
  parts.push('export const metadata = {');
  parts.push(`  filename: ${JSON.stringify(filename)},`);
  parts.push(`  dev: ${dev},`);
  parts.push(`  hasClientDirectives: ${hasClientDirectives(ast)},`);
  parts.push(`  framework: ${JSON.stringify(framework)},`);
  parts.push('};');

  // Default export for easier imports
  parts.push('');
  parts.push(`export default { render, metadata${framework !== 'vanilla' ? ', Component' : ''} };`);

  const jsCode = parts.join('\n');

  // Inject HMR code in development mode
  return injectHmrCode(jsCode, filename, dev);
}

/**
 * Extract client-side JavaScript from components
 */
export function extractClientScript(
  ast: FragmentNode,
  options: { framework?: 'react' | 'preact' | 'vanilla' } = {}
): string | null {
  const { framework = 'vanilla' } = options;

  if (!hasClientDirectives(ast)) {
    return null;
  }

  // Generate client-side hydration script
  const parts: string[] = [];

  parts.push('// Client-side hydration script');
  parts.push('(function() {');
  parts.push('  if (typeof window !== "undefined") {');

  if (framework === 'react') {
    parts.push('    import("@minimal-astro/compiler/runtime/hydrate").then(({ autoHydrate }) => {');
    parts.push('      autoHydrate({');
    parts.push('        runtime: "react",');
    parts.push('        components: window.__ASTRO_COMPONENTS__ ?? new Map(),');
    parts.push('      });');
    parts.push('    });');
  } else if (framework === 'preact') {
    parts.push('    import("@minimal-astro/compiler/runtime/hydrate").then(({ autoHydrate }) => {');
    parts.push('      autoHydrate({');
    parts.push('        runtime: "preact",');
    parts.push('        components: window.__ASTRO_COMPONENTS__ ?? new Map(),');
    parts.push('      });');
    parts.push('    });');
  }

  parts.push('  }');
  parts.push('})();');

  return parts.join('\n');
}

/**
 * Check if the component has client directives
 */
export function hasClientDirectives(ast: FragmentNode): boolean {
  return checkNodeForClientDirectives(ast);
}

function checkNodeForClientDirectives(node: Node): boolean {
  switch (node.type) {
    case 'Fragment':
      return (node as FragmentNode).children.some(checkNodeForClientDirectives);

    case 'Element':
    case 'Component': {
      const element = node as ElementNode | ComponentNode;
      return (
        element.attrs.some((attr) => attr.name.startsWith('client:')) ||
        element.children.some(checkNodeForClientDirectives)
      );
    }

    default:
      return false;
  }
}
