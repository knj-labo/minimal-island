import type {
  ComponentNode,
  ElementNode,
  FragmentNode,
  FrontmatterNode,
  Node,
} from '../../types/ast.js';
import { buildHtml } from '../html-builder.js';

export interface TransformOptions {
  filename: string;
  dev?: boolean;
  prettyPrint?: boolean;
}

/**
 * Transform an Astro AST to a JavaScript module
 */
export function transformAstroToJs(ast: FragmentNode, options: TransformOptions): string {
  const { filename, dev = false, prettyPrint = true } = options;

  // Extract frontmatter
  const frontmatter = ast.children.find((child) => child.type === 'Frontmatter') as
    | FrontmatterNode
    | undefined;
  const templateNodes = ast.children.filter((child) => child.type !== 'Frontmatter');

  // Generate the module
  const parts: string[] = [];

  // Add imports that are commonly needed
  parts.push(`// Auto-generated from ${filename}`);

  // Add frontmatter code if present
  if (frontmatter) {
    parts.push('// Frontmatter');
    parts.push(frontmatter.code);
  }

  // Create the render function
  parts.push('');
  parts.push('// Component render function');
  parts.push('export async function render(props = {}) {');

  // For now, just render to static HTML
  // TODO: Add proper component rendering with hydration
  const templateAst: FragmentNode = {
    type: 'Fragment',
    children: templateNodes,
    loc: ast.loc,
  };

  const staticHtml = buildHtml(templateAst, { prettyPrint });

  parts.push(`  const html = ${JSON.stringify(staticHtml)};`);
  parts.push('  return html;');
  parts.push('}');

  // Add metadata
  parts.push('');
  parts.push('// Component metadata');
  parts.push('export const metadata = {');
  parts.push(`  filename: ${JSON.stringify(filename)},`);
  parts.push(`  dev: ${dev},`);
  parts.push('  hasClientDirectives: false, // TODO: detect client directives');
  parts.push('};');

  // Default export for easier imports
  parts.push('');
  parts.push('export default { render, metadata };');

  return parts.join('\\n');
}

/**
 * Extract client-side JavaScript from components
 * TODO: Implement proper client-side extraction
 */
export function extractClientScript(_ast: FragmentNode): string | null {
  // For now, return null as we haven't implemented client-side rendering
  return null;
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
