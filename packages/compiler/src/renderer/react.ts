/**
 * React renderer for Astro components
 * Handles SSR and client-side rendering with hydration support
 */

import type {
  ComponentNode,
  ElementNode,
  ExpressionNode,
  FragmentNode,
  FrontmatterNode,
  Node,
  TextNode,
} from '../../types/ast.js';

export interface ReactRendererOptions {
  /**
   * Mode of rendering
   */
  mode: 'ssr' | 'client';
  
  /**
   * Whether to include hydration markers
   */
  hydrate?: boolean;
  
  /**
   * Component registry for resolving imports
   */
  components?: Map<string, any>;
  
  /**
   * Props to pass to the root component
   */
  props?: Record<string, any>;
}

export interface RenderResult {
  /**
   * The rendered HTML string (SSR) or React element (client)
   */
  output: string | any;
  
  /**
   * Hydration data for client-side
   */
  hydrationData?: HydrationData;
  
  /**
   * Scripts needed for hydration
   */
  scripts?: string[];
}

export interface HydrationData {
  /**
   * Component props for hydration
   */
  props: Record<string, any>;
  
  /**
   * Client directives and their configurations
   */
  directives: ClientDirective[];
  
  /**
   * Component paths for lazy loading
   */
  componentPaths: Record<string, string>;
}

export interface ClientDirective {
  /**
   * The directive type
   */
  type: 'load' | 'idle' | 'visible' | 'media' | 'only';
  
  /**
   * Directive value (e.g., media query)
   */
  value?: string;
  
  /**
   * Component ID for hydration
   */
  componentId: string;
  
  /**
   * Props to hydrate with
   */
  props: Record<string, any>;
}

/**
 * Creates a React renderer for Astro components
 */
export function createReactRenderer(options: ReactRendererOptions) {
  const { mode, hydrate = false, components = new Map(), props = {} } = options;
  
  // Track hydration data
  const hydrationData: HydrationData = {
    props: {},
    directives: [],
    componentPaths: {},
  };
  
  // Component ID counter for hydration
  let componentIdCounter = 0;
  
  /**
   * Generate unique component ID
   */
  function generateComponentId(): string {
    return `astro-${++componentIdCounter}`;
  }
  
  /**
   * Extract client directive from attributes
   */
  function extractClientDirective(attrs: any[]): ClientDirective | null {
    const clientAttr = attrs.find(attr => attr.name.startsWith('client:'));
    if (!clientAttr) return null;
    
    const directiveType = clientAttr.name.slice(7) as ClientDirective['type'];
    const value = clientAttr.value;
    
    return {
      type: directiveType,
      value: value === true ? undefined : String(value),
      componentId: generateComponentId(),
      props: {},
    };
  }
  
  /**
   * Render AST node to React
   */
  function renderNode(node: Node, context: any = {}): any {
    switch (node.type) {
      case 'Fragment':
        return renderFragment(node as FragmentNode, context);
        
      case 'Element':
        return renderElement(node as ElementNode, context);
        
      case 'Component':
        return renderComponent(node as ComponentNode, context);
        
      case 'Text':
        return renderText(node as TextNode, context);
        
      case 'Expression':
        return renderExpression(node as ExpressionNode, context);
        
      case 'Frontmatter':
        // Frontmatter is processed separately
        return null;
        
      default:
        return null;
    }
  }
  
  /**
   * Render fragment node
   */
  function renderFragment(node: FragmentNode, context: any): any {
    const children = node.children
      .map(child => renderNode(child, context))
      .filter(child => child !== null && child !== '');
    
    if (mode === 'ssr') {
      return children.join('');
    }
    
    // For client mode, return React fragment
    if (children.length === 0) {
      return 'null';
    }
    if (children.length === 1) {
      return children[0];
    }
    return `React.Fragment({}, ${children.join(', ')})`;
  }
  
  /**
   * Render HTML element
   */
  function renderElement(node: ElementNode, context: any): any {
    const { tag, attrs, children } = node;
    
    // Process attributes
    const attributes: Record<string, any> = {};
    for (const attr of attrs) {
      attributes[attr.name] = attr.value;
    }
    
    // Render children
    const renderedChildren = children
      .map(child => renderNode(child, context))
      .filter(Boolean);
    
    if (mode === 'ssr') {
      // SSR: Generate HTML string
      const attrString = Object.entries(attributes)
        .map(([key, value]) => {
          if (value === true) return key;
          if (value === false) return '';
          return `${key}="${escapeHtml(String(value))}"`;
        })
        .filter(Boolean)
        .join(' ');
      
      const openTag = `<${tag}${attrString ? ' ' + attrString : ''}>`;
      const closeTag = `</${tag}>`;
      
      if (isVoidElement(tag)) {
        return openTag;
      }
      
      return `${openTag}${renderedChildren.join('')}${closeTag}`;
    }
    
    // Client mode: Generate React element
    const propsString = JSON.stringify(attributes);
    return `React.createElement('${tag}', ${propsString}, ${renderedChildren.join(', ')})`;
  }
  
  /**
   * Render component node
   */
  function renderComponent(node: ComponentNode, context: any): any {
    const { tag, attrs, children } = node;
    
    // Check for client directive
    const directive = extractClientDirective(attrs);
    
    // Get component from registry
    const Component = components.get(tag);
    if (!Component && mode === 'ssr') {
      // For SSR, render placeholder if component not found
      return `<!-- Component: ${tag} (not found) -->`;
    }
    
    // Process props
    const componentProps: Record<string, any> = {};
    for (const attr of attrs) {
      if (!attr.name.startsWith('client:')) {
        componentProps[attr.name] = attr.value;
      }
    }
    
    // Add children as prop
    if (children.length > 0) {
      componentProps.children = children
        .map(child => renderNode(child, context))
        .filter(Boolean);
    }
    
    if (mode === 'ssr') {
      if (!Component) {
        return `<!-- Component: ${tag} -->`;
      }
      
      // Server-side render the component
      const html = renderComponentToString(Component, componentProps);
      
      // Add hydration marker if needed
      if (hydrate && directive) {
        const wrapperId = directive.componentId;
        hydrationData.directives.push({
          ...directive,
          props: componentProps,
        });
        
        return `<div id="${wrapperId}" data-astro-root>${html}</div>`;
      }
      
      return html;
    }
    
    // Client mode: Generate React element
    return `React.createElement(${tag}, ${JSON.stringify(componentProps)})`;
  }
  
  /**
   * Render text node
   */
  function renderText(node: TextNode, context: any): any {
    const { value } = node;
    
    if (mode === 'ssr') {
      return value; // Don't escape here - it's already raw text from parser
    }
    
    return JSON.stringify(value);
  }
  
  /**
   * Render expression node
   */
  function renderExpression(node: ExpressionNode, context: any): any {
    const { code } = node;
    
    if (mode === 'ssr') {
      // Evaluate expression in context
      try {
        const result = evaluateExpression(code, context);
        return escapeHtml(String(result));
      } catch (error) {
        console.error('Expression evaluation error:', error);
        return `<!-- Expression error: ${escapeHtml(code)} -->`;
      }
    }
    
    // Client mode: Return expression as-is
    return code;
  }
  
  /**
   * Main render function
   */
  return {
    render(ast: FragmentNode): RenderResult {
      // Process frontmatter first
      const frontmatter = ast.children.find(
        child => child.type === 'Frontmatter'
      ) as FrontmatterNode | undefined;
      
      // Create render context
      const context = {
        ...props,
        ...(frontmatter ? processFrontmatter(frontmatter.code) : {}),
      };
      
      // Render the AST
      const output = renderNode(ast, context);
      
      // Generate hydration scripts if needed
      const scripts = hydrate ? generateHydrationScripts(hydrationData) : undefined;
      
      return {
        output,
        hydrationData: hydrate ? hydrationData : undefined,
        scripts,
      };
    },
    
    /**
     * Render a single component (useful for testing)
     */
    renderComponent(Component: any, props: Record<string, any>): string {
      if (mode === 'ssr') {
        return renderComponentToString(Component, props);
      }
      
      return `React.createElement(${Component.name || 'Component'}, ${JSON.stringify(props)})`;
    },
  };
}

/**
 * Helper to render React component to string (SSR)
 */
function renderComponentToString(Component: any, props: Record<string, any>): string {
  // This is a simplified version - in production, you'd use ReactDOMServer
  try {
    // For now, return a placeholder
    return `<div><!-- ${Component.name || 'Component'} rendered here --></div>`;
  } catch (error) {
    console.error('Component render error:', error);
    return `<!-- Component render error -->`;
  }
}

/**
 * Helper to evaluate expressions
 */
function evaluateExpression(code: string, context: Record<string, any>): any {
  // Create a function with context variables
  const contextKeys = Object.keys(context);
  const contextValues = Object.values(context);
  
  try {
    const fn = new Function(...contextKeys, `return (${code})`);
    return fn(...contextValues);
  } catch (error) {
    throw new Error(`Failed to evaluate expression: ${code}`);
  }
}

/**
 * Process frontmatter code
 */
function processFrontmatter(code: string): Record<string, any> {
  // This is simplified - in production, you'd properly parse and execute
  const context: Record<string, any> = {};
  
  try {
    // Extract simple variable declarations
    const varMatches = code.matchAll(/const\s+(\w+)\s*=\s*(.+);/g);
    for (const match of varMatches) {
      const [, name, value] = match;
      try {
        context[name] = JSON.parse(value);
      } catch {
        context[name] = value.replace(/['"]/g, '');
      }
    }
  } catch (error) {
    console.error('Frontmatter processing error:', error);
  }
  
  return context;
}

/**
 * Generate hydration scripts
 */
function generateHydrationScripts(data: HydrationData): string[] {
  const scripts: string[] = [];
  
  // Main hydration script
  scripts.push(`
    window.__ASTRO_HYDRATION_DATA__ = ${JSON.stringify(data)};
    
    // Hydration runtime will be loaded separately
    if (window.__ASTRO_HYDRATE__) {
      window.__ASTRO_HYDRATE__(window.__ASTRO_HYDRATION_DATA__);
    }
  `);
  
  return scripts;
}

/**
 * HTML escape helper
 */
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Check if element is void (self-closing)
 */
function isVoidElement(tag: string): boolean {
  const voidElements = [
    'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
    'link', 'meta', 'param', 'source', 'track', 'wbr'
  ];
  return voidElements.includes(tag.toLowerCase());
}

/**
 * Create SSR renderer
 */
export function createSSRRenderer(options: Omit<ReactRendererOptions, 'mode'> = {}) {
  return createReactRenderer({ ...options, mode: 'ssr' });
}

/**
 * Create client renderer
 */
export function createClientRenderer(options: Omit<ReactRendererOptions, 'mode'> = {}) {
  return createReactRenderer({ ...options, mode: 'client' });
}