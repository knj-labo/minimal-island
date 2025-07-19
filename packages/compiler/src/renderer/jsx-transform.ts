/**
 * JSX transformation utilities for Astro components
 * Converts Astro AST to JSX/React code
 */

import type {
  ComponentNode,
  ElementNode,
  ExpressionNode,
  FragmentNode,
  Node,
  TextNode,
} from '../../types/ast.js';

export interface JSXTransformOptions {
  /**
   * Runtime to use (React, Preact, etc.)
   */
  runtime?: 'react' | 'preact';
  
  /**
   * Import source for jsx runtime
   */
  jsxImportSource?: string;
  
  /**
   * Whether to use the new JSX transform
   */
  useNewTransform?: boolean;
  
  /**
   * Fragment component name
   */
  fragmentName?: string;
  
  /**
   * Create element function name
   */
  createElementName?: string;
}

const DEFAULT_OPTIONS: Required<JSXTransformOptions> = {
  runtime: 'react',
  jsxImportSource: 'react',
  useNewTransform: true,
  fragmentName: 'Fragment',
  createElementName: 'createElement',
};

/**
 * Transform context for tracking state during transformation
 */
interface TransformContext {
  imports: Set<string>;
  components: Set<string>;
  variables: Set<string>;
  depth: number;
}

/**
 * Create a JSX transformer
 */
export function createJSXTransformer(options: JSXTransformOptions = {}) {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  
  /**
   * Transform AST to JSX code
   */
  function transform(ast: FragmentNode): string {
    const context: TransformContext = {
      imports: new Set(),
      components: new Set(),
      variables: new Set(),
      depth: 0,
    };
    
    // Transform the AST
    const jsxCode = transformNode(ast, context);
    
    // Generate imports
    const imports = generateImports(context);
    
    // Wrap in component function
    const componentCode = wrapInComponent(jsxCode, context);
    
    return `${imports}\n\n${componentCode}`;
  }
  
  /**
   * Transform a single node
   */
  function transformNode(node: Node, context: TransformContext): string {
    switch (node.type) {
      case 'Fragment':
        return transformFragment(node as FragmentNode, context);
        
      case 'Element':
        return transformElement(node as ElementNode, context);
        
      case 'Component':
        return transformComponent(node as ComponentNode, context);
        
      case 'Text':
        return transformText(node as TextNode, context);
        
      case 'Expression':
        return transformExpression(node as ExpressionNode, context);
        
      case 'Frontmatter':
        // Frontmatter is handled separately
        return '';
        
      default:
        return '';
    }
  }
  
  /**
   * Transform fragment node
   */
  function transformFragment(node: FragmentNode, context: TransformContext): string {
    const children = node.children
      .map(child => transformNode(child, context))
      .filter(Boolean);
    
    if (children.length === 0) {
      return 'null';
    }
    
    if (children.length === 1) {
      return children[0];
    }
    
    // Multiple children need a fragment
    context.imports.add(opts.fragmentName);
    const indent = getIndent(context.depth);
    
    return `<${opts.fragmentName}>
${children.map(child => indent + '  ' + child).join('\n')}
${indent}</${opts.fragmentName}>`;
  }
  
  /**
   * Transform element node
   */
  function transformElement(node: ElementNode, context: TransformContext): string {
    const { tag, attrs, children, selfClosing } = node;
    const indent = getIndent(context.depth);
    
    // Build props object
    const props = buildProps(attrs);
    
    // Transform children
    context.depth++;
    const transformedChildren = children
      .map(child => transformNode(child, context))
      .filter(Boolean);
    context.depth--;
    
    // Build JSX
    if (selfClosing || transformedChildren.length === 0) {
      return `<${tag}${props} />`;
    }
    
    const childrenIndent = getIndent(context.depth + 1);
    const childrenStr = transformedChildren
      .map(child => {
        // Handle text nodes and expressions inline
        if (child.startsWith('{') || child.startsWith('"')) {
          return child;
        }
        return '\n' + childrenIndent + child;
      })
      .join('');
    
    const needsNewline = transformedChildren.some(
      child => !child.startsWith('{') && !child.startsWith('"')
    );
    
    return `<${tag}${props}>${needsNewline ? childrenStr + '\n' + indent : childrenStr}</${tag}>`;
  }
  
  /**
   * Transform component node
   */
  function transformComponent(node: ComponentNode, context: TransformContext): string {
    const { tag, attrs, children, selfClosing } = node;
    
    // Track component usage
    context.components.add(tag);
    
    // Extract client directive if present
    const clientDirective = attrs.find(attr => attr.name.startsWith('client:'));
    const regularAttrs = attrs.filter(attr => !attr.name.startsWith('client:'));
    
    // Build props
    const props = buildProps(regularAttrs);
    
    // Handle client directive
    if (clientDirective) {
      // Wrap component with hydration wrapper
      const directive = clientDirective.name.slice(7);
      const directiveValue = clientDirective.value;
      
      return wrapWithHydration(tag, props, directive, directiveValue, children, context);
    }
    
    // Transform children
    context.depth++;
    const transformedChildren = children
      .map(child => transformNode(child, context))
      .filter(Boolean);
    context.depth--;
    
    // Build JSX
    if (selfClosing || transformedChildren.length === 0) {
      return `<${tag}${props} />`;
    }
    
    const indent = getIndent(context.depth);
    const childrenIndent = getIndent(context.depth + 1);
    const childrenStr = transformedChildren
      .map(child => '\n' + childrenIndent + child)
      .join('');
    
    return `<${tag}${props}>${childrenStr}\n${indent}</${tag}>`;
  }
  
  /**
   * Transform text node
   */
  function transformText(node: TextNode, context: TransformContext): string {
    const { value } = node;
    
    // Escape special characters
    const escaped = value
      .replace(/\\/g, '\\\\')
      .replace(/"/g, '\\"')
      .replace(/\n/g, '\\n')
      .replace(/\r/g, '\\r')
      .replace(/\t/g, '\\t');
    
    // Check if it's just whitespace
    if (/^\s+$/.test(value)) {
      return `{" "}`;
    }
    
    return `"${escaped}"`;
  }
  
  /**
   * Transform expression node
   */
  function transformExpression(node: ExpressionNode, context: TransformContext): string {
    const { code } = node;
    
    // Extract variables used in expression
    extractVariables(code, context);
    
    return `{${code}}`;
  }
  
  /**
   * Build props string from attributes
   */
  function buildProps(attrs: any[]): string {
    if (attrs.length === 0) {
      return '';
    }
    
    const props = attrs.map(attr => {
      const { name, value } = attr;
      
      // Boolean true
      if (value === true) {
        return name;
      }
      
      // Boolean false - omit
      if (value === false) {
        return '';
      }
      
      // String value
      if (typeof value === 'string') {
        // Check if it's an expression (wrapped in {})
        if (value.startsWith('{') && value.endsWith('}')) {
          return `${name}=${value}`;
        }
        // Check if it needs to be wrapped in quotes
        if (value.includes('"')) {
          return `${name}={'${value}'}`;
        }
        return `${name}="${value}"`;
      }
      
      // Expression or other value
      return `${name}={${JSON.stringify(value)}}`;
    }).filter(Boolean);
    
    return props.length > 0 ? ' ' + props.join(' ') : '';
  }
  
  /**
   * Wrap component with hydration code
   */
  function wrapWithHydration(
    componentName: string,
    props: string,
    directive: string,
    directiveValue: any,
    children: Node[],
    context: TransformContext
  ): string {
    // For now, add a data attribute to mark for hydration
    const hydrationProps = `data-astro-hydrate="${directive}"${
      directiveValue ? ` data-astro-hydrate-value="${directiveValue}"` : ''
    }`;
    
    // Transform children if any
    context.depth++;
    const transformedChildren = children
      .map(child => transformNode(child, context))
      .filter(Boolean);
    context.depth--;
    
    const indent = getIndent(context.depth);
    const childrenIndent = getIndent(context.depth + 1);
    
    if (transformedChildren.length === 0) {
      return `<div ${hydrationProps}>\n${childrenIndent}<${componentName}${props} />\n${indent}</div>`;
    }
    
    const childrenStr = transformedChildren
      .map(child => '\n' + getIndent(context.depth + 2) + child)
      .join('');
    
    return `<div ${hydrationProps}>
${childrenIndent}<${componentName}${props}>${childrenStr}
${childrenIndent}</${componentName}>
${indent}</div>`;
  }
  
  /**
   * Generate import statements
   */
  function generateImports(context: TransformContext): string {
    const imports: string[] = [];
    
    // React import
    if (opts.useNewTransform) {
      imports.push(`import { jsx as _jsx, jsxs as _jsxs${
        context.imports.has('Fragment') ? ', Fragment' : ''
      } } from '${opts.jsxImportSource}/jsx-runtime';`);
    } else {
      imports.push(`import React${
        context.imports.has('Fragment') ? ', { Fragment }' : ''
      } from '${opts.jsxImportSource}';`);
    }
    
    // Component imports (placeholder - would need component registry)
    for (const component of context.components) {
      imports.push(`// import ${component} from './${component}.jsx';`);
    }
    
    return imports.join('\n');
  }
  
  /**
   * Wrap JSX in component function
   */
  function wrapInComponent(jsxCode: string, context: TransformContext): string {
    return `export default function AstroComponent(props) {
  return (
    ${jsxCode.split('\n').map(line => '    ' + line).join('\n').trim()}
  );
}`;
  }
  
  /**
   * Get indentation string
   */
  function getIndent(depth: number): string {
    return '  '.repeat(depth);
  }
  
  /**
   * Extract variables from expression code
   */
  function extractVariables(code: string, context: TransformContext): void {
    // Simple regex to find potential variable names
    const varPattern = /\b([a-zA-Z_$][a-zA-Z0-9_$]*)\b/g;
    let match;
    
    while ((match = varPattern.exec(code)) !== null) {
      const varName = match[1];
      
      // Skip JavaScript keywords and known globals
      if (!isKeywordOrGlobal(varName)) {
        context.variables.add(varName);
      }
    }
  }
  
  /**
   * Check if identifier is keyword or global
   */
  function isKeywordOrGlobal(name: string): boolean {
    const keywords = [
      'true', 'false', 'null', 'undefined', 'this',
      'if', 'else', 'for', 'while', 'do', 'break', 'continue',
      'function', 'return', 'var', 'let', 'const', 'class',
      'new', 'typeof', 'instanceof', 'in', 'of',
      'console', 'window', 'document', 'Math', 'JSON',
      'Object', 'Array', 'String', 'Number', 'Boolean',
    ];
    
    return keywords.includes(name);
  }
  
  return {
    transform,
    transformNode,
  };
}

/**
 * Transform Astro AST to JSX string
 */
export function astToJSX(
  ast: FragmentNode,
  options?: JSXTransformOptions
): string {
  const transformer = createJSXTransformer(options);
  return transformer.transform(ast);
}

/**
 * Transform Astro AST to React component code
 */
export function astToReactComponent(
  ast: FragmentNode,
  componentName = 'AstroComponent',
  options?: JSXTransformOptions
): string {
  const jsx = astToJSX(ast, options);
  
  // Customize the component wrapper
  const lines = jsx.split('\n');
  const functionLine = lines.findIndex(line => line.includes('export default function'));
  
  if (functionLine !== -1) {
    lines[functionLine] = `export default function ${componentName}(props) {`;
  }
  
  return lines.join('\n');
}