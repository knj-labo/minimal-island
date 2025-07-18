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
  streaming?: boolean;
  chunkSize?: number;
}

export interface StreamingOptions {
  chunkSize?: number;
  write: (chunk: string) => Promise<void>;
}

const DEFAULT_OPTIONS: HtmlBuilderOptions = {
  prettyPrint: false,
  indent: '  ',
  streaming: false,
  chunkSize: 16384, // 16KB chunks
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

// HTML escape optimization with lookup table and fast-path
const HTML_ESCAPE_LOOKUP: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;'
};

const HTML_ESCAPE_REGEX = /[&<>"']/g;
const ATTR_ESCAPE_REGEX = /[&"']/g;

/**
 * Optimized HTML escape function with single-pass lookup
 */
function escapeHtml(text: string): string {
  // Fast path: no special characters
  if (!HTML_ESCAPE_REGEX.test(text)) {
    return text;
  }
  
  // Reset regex state
  HTML_ESCAPE_REGEX.lastIndex = 0;
  
  return text.replace(HTML_ESCAPE_REGEX, char => HTML_ESCAPE_LOOKUP[char]);
}

/**
 * Manual loop optimization for hot paths (exported for potential use)
 */
export function escapeHtmlFast(text: string): string {
  let result = '';
  let lastIndex = 0;
  
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const escaped = HTML_ESCAPE_LOOKUP[char];
    
    if (escaped) {
      result += text.slice(lastIndex, i) + escaped;
      lastIndex = i + 1;
    }
  }
  
  return lastIndex === 0 ? text : result + text.slice(lastIndex);
}

/**
 * Optimized attribute escaping with fast-path
 */
function escapeAttribute(value: string): string {
  // Fast path: no special characters
  if (!ATTR_ESCAPE_REGEX.test(value)) {
    return value;
  }
  
  // Reset regex state
  ATTR_ESCAPE_REGEX.lastIndex = 0;
  
  return value.replace(ATTR_ESCAPE_REGEX, char => HTML_ESCAPE_LOOKUP[char]);
}

/**
 * Legacy escape function for backward compatibility (exported for testing)
 */
export function escapeHtmlLegacy(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
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

/**
 * Streaming HTML builder for memory-efficient processing
 */
export class StreamingHtmlBuilder {
  private buffer = '';
  private readonly chunkSize: number;
  private readonly options: HtmlBuilderOptions;

  constructor(options: HtmlBuilderOptions = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
    this.chunkSize = this.options.chunkSize || 16384;
  }

  /**
   * Build HTML to a stream with chunked processing
   */
  async buildToStream(
    ast: FragmentNode,
    streamOptions: StreamingOptions
  ): Promise<void> {
    const { write } = streamOptions;
    
    await this.buildNodeToStream(ast, write, 0);
    await this.flush(write);
  }

  /**
   * Write buffered content to stream
   */
  private async writeBuffered(content: string, write: (chunk: string) => Promise<void>): Promise<void> {
    this.buffer += content;
    if (this.buffer.length >= this.chunkSize) {
      await this.flush(write);
    }
  }

  /**
   * Flush remaining buffer content
   */
  private async flush(write: (chunk: string) => Promise<void>): Promise<void> {
    if (this.buffer.length > 0) {
      await write(this.buffer);
      this.buffer = '';
    }
  }

  /**
   * Build a single node to stream
   */
  private async buildNodeToStream(
    node: Node,
    write: (chunk: string) => Promise<void>,
    depth: number
  ): Promise<void> {
    switch (node.type) {
      case 'Fragment':
        await this.buildFragmentToStream(node as FragmentNode, write, depth);
        break;

      case 'Element':
        await this.buildElementToStream(node as ElementNode, write, depth);
        break;

      case 'Component':
        await this.buildComponentToStream(node as ComponentNode, write, depth);
        break;

      case 'Text':
        await this.buildTextToStream(node as TextNode, write, depth);
        break;

      case 'Expression':
        await this.buildExpressionToStream(node as ExpressionNode, write, depth);
        break;

      case 'Frontmatter':
        // Frontmatter doesn't output HTML
        break;

      default:
        // Unknown node type, skip it
        break;
    }
  }

  /**
   * Build fragment to stream
   */
  private async buildFragmentToStream(
    node: FragmentNode,
    write: (chunk: string) => Promise<void>,
    depth: number
  ): Promise<void> {
    for (const child of node.children) {
      await this.buildNodeToStream(child, write, depth);
    }
  }

  /**
   * Build element to stream
   */
  private async buildElementToStream(
    node: ElementNode,
    write: (chunk: string) => Promise<void>,
    depth: number
  ): Promise<void> {
    const indent = this.options.prettyPrint ? this.options.indent!.repeat(depth) : '';
    const newline = this.options.prettyPrint ? '\n' : '';

    await this.writeBuffered(`${indent}<${node.tag}${formatAttributes(node.attrs)}>`, write);

    if (VOID_ELEMENTS.has(node.tag)) {
      await this.writeBuffered(newline, write);
      return;
    }

    // Handle inline vs block content
    const hasBlockChildren = node.children.some(child => 
      child.type === 'Element' || child.type === 'Component'
    );

    if (hasBlockChildren && this.options.prettyPrint) {
      await this.writeBuffered(newline, write);
    }

    for (const child of node.children) {
      await this.buildNodeToStream(child, write, depth + 1);
    }

    if (hasBlockChildren && this.options.prettyPrint) {
      await this.writeBuffered(indent, write);
    }

    await this.writeBuffered(`</${node.tag}>${newline}`, write);
  }

  /**
   * Build component to stream
   */
  private async buildComponentToStream(
    node: ComponentNode,
    write: (chunk: string) => Promise<void>,
    depth: number
  ): Promise<void> {
    const indent = this.options.prettyPrint ? this.options.indent!.repeat(depth) : '';
    const newline = this.options.prettyPrint ? '\n' : '';

    await this.writeBuffered(
      `${indent}<!-- Component: ${node.tag}${formatAttributes(node.attrs)} -->${newline}`,
      write
    );

    for (const child of node.children) {
      await this.buildNodeToStream(child, write, depth + 1);
    }

    await this.writeBuffered(
      `${indent}<!-- /Component: ${node.tag} -->${newline}`,
      write
    );
  }

  /**
   * Build text to stream
   */
  private async buildTextToStream(
    node: TextNode,
    write: (chunk: string) => Promise<void>,
    depth: number
  ): Promise<void> {
    const indent = this.options.prettyPrint ? this.options.indent!.repeat(depth) : '';
    const text = escapeHtml(node.value);

    // Handle inline vs block text
    if (this.options.prettyPrint && text.trim() !== text) {
      await this.writeBuffered(`${indent}${text.trim()}\n`, write);
    } else {
      await this.writeBuffered(text, write);
    }
  }

  /**
   * Build expression to stream
   */
  private async buildExpressionToStream(
    node: ExpressionNode,
    write: (chunk: string) => Promise<void>,
    depth: number
  ): Promise<void> {
    const indent = this.options.prettyPrint ? this.options.indent!.repeat(depth) : '';
    const newline = this.options.prettyPrint ? '\n' : '';

    await this.writeBuffered(
      `${indent}<!-- Expression: ${escapeHtml(node.code)} -->${newline}`,
      write
    );
  }
}

/**
 * Convenience function to build HTML to stream
 */
export async function buildHtmlToStream(
  ast: FragmentNode,
  streamOptions: StreamingOptions,
  builderOptions: HtmlBuilderOptions = {}
): Promise<void> {
  const builder = new StreamingHtmlBuilder(builderOptions);
  await builder.buildToStream(ast, streamOptions);
}
