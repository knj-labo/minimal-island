import type {
  Attr,
  ComponentNode,
  ElementNode,
  ExpressionNode,
  FragmentNode,
  FrontmatterNode,
  Node,
  TextNode,
} from '../types/ast.js';

export interface HtmlBuilderOptions {
  prettyPrint?: boolean;
  indent?: string;
}

const DEFAULT_OPTIONS: HtmlBuilderOptions = {
  prettyPrint: false,
  indent: '  ',
};

// HTML void elements that should not have closing tags
const VOID_ELEMENTS = new Set([
  'area',
  'base',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'link',
  'meta',
  'param',
  'source',
  'track',
  'wbr',
]);

/**
 * Escapes HTML special characters in text content
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Escapes HTML attribute values
 */
function escapeAttribute(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/**
 * Formats an attribute for HTML output
 */
function formatAttribute(attr: Attr): string {
  if (attr.value === true) {
    return attr.name;
  }
  if (attr.value === false) {
    return '';
  }
  return `${attr.name}="${escapeAttribute(String(attr.value))}"`;
}

/**
 * Formats attributes array for HTML output
 */
function formatAttributes(attrs: Attr[]): string {
  const formatted = attrs.map(formatAttribute).filter(Boolean).join(' ');
  return formatted ? ` ${formatted}` : '';
}

/**
 * Builds HTML from a single AST node
 */
function buildNodeHtml(node: Node, options: HtmlBuilderOptions, depth = 0): string {
  switch (node.type) {
    case 'Fragment':
      return buildFragmentHtml(node as FragmentNode, options, depth);

    case 'Frontmatter':
      return buildFrontmatterHtml(node as FrontmatterNode, options, depth);

    case 'Element':
      return buildElementHtml(node as ElementNode, options, depth);

    case 'Component':
      return buildComponentHtml(node as ComponentNode, options, depth);

    case 'Text':
      return buildTextHtml(node as TextNode, options, depth);

    case 'Expression':
      return buildExpressionHtml(node as ExpressionNode, options, depth);

    default:
      // Unknown node type, skip it
      return '';
  }
}

/**
 * Builds HTML from a Fragment node
 */
function buildFragmentHtml(node: FragmentNode, options: HtmlBuilderOptions, depth: number): string {
  return node.children
    .map((child) => buildNodeHtml(child, options, depth))
    .filter((html) => html !== '') // Filter out empty strings from frontmatter
    .join('');
}

/**
 * Builds HTML from a Frontmatter node (renders as empty string for HTML output)
 */
function buildFrontmatterHtml(
  _node: FrontmatterNode,
  _options: HtmlBuilderOptions,
  _depth: number
): string {
  // Frontmatter is not rendered in HTML output
  return '';
}

/**
 * Builds HTML from an Element node
 */
function buildElementHtml(node: ElementNode, options: HtmlBuilderOptions, depth: number): string {
  const indent = options.prettyPrint ? (options.indent || '').repeat(depth) : '';
  const newline = options.prettyPrint ? '\n' : '';
  const tag = node.tag.toLowerCase();
  const attrs = formatAttributes(node.attrs);

  // Handle void elements (always render without closing tag, even if marked as self-closing)
  if (VOID_ELEMENTS.has(tag)) {
    return `${indent}<${tag}${attrs}>${newline}`;
  }

  // Handle self-closing elements (only for non-void elements)
  if (node.selfClosing) {
    return `${indent}<${tag}${attrs} />${newline}`;
  }

  // Handle normal elements with children
  const openTag = `${indent}<${tag}${attrs}>`;

  if (node.children.length === 0) {
    return `${openTag}</${tag}>${newline}`;
  }

  // Check if children are only text nodes (inline content)
  const hasOnlyTextChildren = node.children.every(
    (child) => child.type === 'Text' || child.type === 'Expression'
  );

  if (hasOnlyTextChildren && options.prettyPrint) {
    // Render inline content on same line
    const childrenHtml = node.children
      .map((child) => buildNodeHtml(child, { ...options, prettyPrint: false }, 0))
      .join('');
    return `${openTag}${childrenHtml}</${tag}>${newline}`;
  }

  // Render with proper indentation
  const childrenHtml = node.children
    .map((child) => buildNodeHtml(child, options, depth + 1))
    .join('');

  const closeTag = `${indent}</${tag}>`;

  if (options.prettyPrint) {
    return `${openTag}${newline}${childrenHtml}${closeTag}${newline}`;
  }

  return `${openTag}${childrenHtml}${closeTag}`;
}

/**
 * Builds HTML from a Component node (renders as empty string for now)
 */
function buildComponentHtml(
  node: ComponentNode,
  options: HtmlBuilderOptions,
  depth: number
): string {
  // Components will be handled by renderers in later phases
  // For now, render as empty string or comment
  if (options.prettyPrint) {
    const indent = (options.indent || '').repeat(depth);
    return `${indent}<!-- Component: ${node.tag} -->\n`;
  }
  return `<!-- Component: ${node.tag} -->`;
}

/**
 * Builds HTML from a Text node
 */
function buildTextHtml(node: TextNode, options: HtmlBuilderOptions, depth: number): string {
  const indent = options.prettyPrint ? (options.indent || '').repeat(depth) : '';
  const text = escapeHtml(node.value);

  // Skip indentation for text nodes that are part of inline content
  if (text.trim() === '') {
    return options.prettyPrint ? '' : text;
  }

  return options.prettyPrint ? `${indent}${text}\n` : text;
}

/**
 * Builds HTML from an Expression node (renders as empty string for now)
 */
function buildExpressionHtml(
  node: ExpressionNode,
  options: HtmlBuilderOptions,
  depth: number
): string {
  // Expressions will be evaluated by renderers in later phases
  // For now, render as empty string or comment
  if (options.prettyPrint) {
    const indent = (options.indent || '').repeat(depth);
    return `${indent}<!-- Expression: ${node.code} -->\n`;
  }
  return `<!-- Expression: ${node.code} -->`;
}

/**
 * Builds HTML string from an AST
 */
export function buildHtml(ast: FragmentNode, options: HtmlBuilderOptions = {}): string {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const html = buildNodeHtml(ast, opts);

  // Clean up extra newlines if pretty printing is enabled
  if (opts.prettyPrint) {
    return `${html.replace(/\n\s*\n/g, '\n').trim()}\n`;
  }

  return html;
}
