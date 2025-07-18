import type {
  Attr,
  ComponentNode,
  Diagnostic,
  ElementNode,
  ExpressionNode,
  FragmentNode,
  FrontmatterNode,
  Node,
  ParseResult,
  SourceSpan,
  TextNode,
} from '../types/ast.js';
import { type Token, TokenType, tokenize } from './tokenizer.js';

export interface ParseOptions {
  filename?: string;
}

interface ParserState {
  readonly tokens: readonly Token[];
  readonly current: number;
  readonly diagnostics: readonly Diagnostic[];
  readonly filename: string;
}

function createInitialState(tokens: Token[], options: ParseOptions = {}): ParserState {
  return {
    tokens,
    current: 0,
    diagnostics: [],
    filename: options.filename || '<anonymous>',
  };
}

function peek(state: ParserState, offset = 0): Token | null {
  const index = state.current + offset;
  return index < state.tokens.length ? state.tokens[index] : null;
}

function advance(state: ParserState): [ParserState, Token | null] {
  if (state.current < state.tokens.length) {
    const token = state.tokens[state.current];
    return [{ ...state, current: state.current + 1 }, token];
  }
  return [state, null];
}

function isAtEnd(state: ParserState): boolean {
  const token = peek(state);
  return !token || token.type === TokenType.EOF;
}

function addDiagnostic(
  state: ParserState,
  code: string,
  message: string,
  loc: SourceSpan,
  severity: 'error' | 'warning' = 'error'
): ParserState {
  return {
    ...state,
    diagnostics: [
      ...state.diagnostics,
      {
        code,
        message,
        loc,
        severity,
      },
    ],
  };
}

function isComponentTag(name: string): boolean {
  return /^[A-Z]/.test(name);
}

function isVoidElement(tag: string): boolean {
  const voidElements = [
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
  ];
  return voidElements.includes(tag.toLowerCase());
}

function parseAttributes(state: ParserState): [ParserState, Attr[]] {
  const attrs: Attr[] = [];
  const seenNames = new Set<string>();
  let currentState = state;

  while (!isAtEnd(currentState)) {
    const token = peek(currentState);
    if (!token) break;

    if (token.type === TokenType.TagClose || token.type === TokenType.TagSelfClose) {
      break;
    }

    if (token.type === TokenType.AttributeName) {
      const [newState, attrToken] = advance(currentState);
      currentState = newState;

      if (!attrToken) continue;

      const name = attrToken.value;
      let value: string | boolean = true;

      // Check for duplicate client directives
      if (name.startsWith('client:') && seenNames.has(name)) {
        currentState = addDiagnostic(
          currentState,
          'duplicate-directive',
          `Duplicate ${name} directive`,
          attrToken.loc,
          'warning'
        );
      }
      seenNames.add(name);

      // Check if next token is an attribute value
      const nextToken = peek(currentState);
      if (nextToken && nextToken.type === TokenType.AttributeValue) {
        const [valueState, valueToken] = advance(currentState);
        currentState = valueState;

        if (valueToken) {
          const fullValue = valueToken.value;
          const equalIndex = fullValue.indexOf('=');
          if (equalIndex !== -1) {
            value = fullValue.substring(equalIndex + 1);
            // Remove quotes if present
            if (
              (value.startsWith('"') && value.endsWith('"')) ||
              (value.startsWith("'") && value.endsWith("'"))
            ) {
              value = value.slice(1, -1);
            }
          }
        }
      }

      attrs.push({
        name,
        value,
        loc: attrToken.loc,
      });
    } else if (token.type === TokenType.AttributeValue) {
      // Handle combined attribute tokens from tokenizer
      const [newState, attrToken] = advance(currentState);
      currentState = newState;

      if (!attrToken) continue;

      const fullValue = attrToken.value;
      const equalIndex = fullValue.indexOf('=');

      let name: string;
      let value: string | boolean = true;

      if (equalIndex !== -1) {
        name = fullValue.substring(0, equalIndex);
        value = fullValue.substring(equalIndex + 1);

        // Remove quotes if present
        if (
          (value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))
        ) {
          value = value.slice(1, -1);
        }
      } else {
        name = fullValue;
      }

      // Check for duplicate client directives
      if (name.startsWith('client:') && seenNames.has(name)) {
        currentState = addDiagnostic(
          currentState,
          'duplicate-directive',
          `Duplicate ${name} directive`,
          attrToken.loc,
          'warning'
        );
      }
      seenNames.add(name);

      attrs.push({
        name,
        value,
        loc: attrToken.loc,
      });
    } else {
      // Skip unknown tokens in tag context
      [currentState] = advance(currentState);
    }
  }

  return [currentState, attrs];
}

function parseFrontmatter(state: ParserState): [ParserState, FrontmatterNode | null] {
  const token = peek(state);
  if (token && token.type === TokenType.FrontmatterContent) {
    const [newState] = advance(state);
    return [
      newState,
      {
        type: 'Frontmatter',
        code: token.value,
        loc: token.loc,
      },
    ];
  }
  return [state, null];
}

function parseExpression(state: ParserState): [ParserState, ExpressionNode | null] {
  const token = peek(state);
  if (token && token.type === TokenType.ExpressionContent) {
    const [newState] = advance(state);

    // Check if expression was marked as incomplete
    let code = token.value;
    let incomplete = false;
    let currentState = newState;

    if (code.includes('\x00incomplete')) {
      code = code.replace('\x00incomplete', '');
      incomplete = true;
      currentState = addDiagnostic(
        currentState,
        'unclosed-expression',
        'Unclosed expression',
        token.loc
      );
    }

    return [
      currentState,
      {
        type: 'Expression',
        code,
        loc: token.loc,
        ...(incomplete && { incomplete: true }),
      },
    ];
  }
  return [state, null];
}

function parseText(state: ParserState): [ParserState, TextNode | null] {
  const token = peek(state);
  if (token && token.type === TokenType.Text) {
    const [newState] = advance(state);
    return [
      newState,
      {
        type: 'Text',
        value: token.value,
        loc: token.loc,
      },
    ];
  }
  return [state, null];
}

function getImplicitlyClosedTags(tag: string): string[] {
  // HTML tags that are implicitly closed by certain other tags
  const implicitClosers: Record<string, string[]> = {
    li: ['li'],
    dt: ['dt', 'dd'],
    dd: ['dt', 'dd'],
    p: ['p', 'div', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'pre', 'blockquote'],
    option: ['option', 'optgroup'],
    optgroup: ['optgroup'],
    thead: ['tbody', 'tfoot'],
    tbody: ['tbody', 'tfoot'],
    tfoot: ['tbody'],
    tr: ['tr'],
    td: ['td', 'th'],
    th: ['td', 'th'],
  };
  return implicitClosers[tag.toLowerCase()] || [];
}

function parseChildren(state: ParserState, parentTag: string): [ParserState, Node[]] {
  const children: Node[] = [];
  const implicitlyClosedBy = getImplicitlyClosedTags(parentTag);
  let currentState = state;

  while (!isAtEnd(currentState)) {
    const token = peek(currentState);
    if (!token) break;

    // Check for closing tag
    if (token.type === TokenType.TagClose && token.value === parentTag) {
      const [newState] = advance(currentState);
      return [newState, children];
    }

    // Check for mismatched closing tag
    if (token.type === TokenType.TagClose) {
      currentState = addDiagnostic(
        currentState,
        'mismatched-tag',
        `Expected closing tag for <${parentTag}> but found </${token.value}>`,
        token.loc
      );
      // Try to recover by treating it as if parent was closed
      return [currentState, children];
    }

    // Check for tags that implicitly close the parent (like <li> closing previous <li>)
    if (token.type === TokenType.TagOpen && implicitlyClosedBy.includes(token.value)) {
      // Don't consume the token, let parent handle it
      return [currentState, children];
    }

    const [nodeState, node] = parseNode(currentState);
    currentState = nodeState;
    if (node) {
      children.push(node);
    } else {
      // Skip unknown tokens
      [currentState] = advance(currentState);
    }
  }

  // Check if we reached end without closing tag
  if (isAtEnd(currentState) && !isVoidElement(parentTag)) {
    const lastToken = currentState.tokens[currentState.tokens.length - 1];
    currentState = addDiagnostic(
      currentState,
      'unclosed-tag',
      `Unclosed tag <${parentTag}>`,
      lastToken?.loc || {
        start: { line: 1, column: 1, offset: 0 },
        end: { line: 1, column: 1, offset: 0 },
      }
    );
  }

  return [currentState, children];
}

function parseElement(state: ParserState): [ParserState, ElementNode | ComponentNode | null] {
  const openToken = peek(state);
  if (!openToken || openToken.type !== TokenType.TagOpen) {
    return [state, null];
  }

  let [currentState] = advance(state);
  const tag = openToken.value;
  const isComponent = isComponentTag(tag);
  const [attrState, attrs] = parseAttributes(currentState);
  currentState = attrState;

  let selfClosing = false;
  let children: Node[] = [];

  const closeToken = peek(currentState);
  if (closeToken) {
    if (closeToken.type === TokenType.TagSelfClose) {
      [currentState] = advance(currentState);
      selfClosing = true;
    } else if (closeToken.type === TokenType.TagClose) {
      [currentState] = advance(currentState);

      // Parse children if not self-closing and not void element
      if (!isVoidElement(tag)) {
        const [childrenState, parsedChildren] = parseChildren(currentState, tag);
        currentState = childrenState;
        children = parsedChildren;
      }
    }
  }

  const endLoc = currentState.tokens[currentState.current - 1]?.loc.end || openToken.loc.end;
  const loc: SourceSpan = {
    start: openToken.loc.start,
    end: endLoc,
  };

  const node = isComponent
    ? {
        type: 'Component' as const,
        tag,
        attrs,
        children,
        selfClosing,
        loc,
      }
    : {
        type: 'Element' as const,
        tag,
        attrs,
        children,
        selfClosing,
        loc,
      };

  return [currentState, node];
}

function parseNode(state: ParserState): [ParserState, Node | null] {
  // Try parsing in order of likelihood
  const [exprState, expression] = parseExpression(state);
  if (expression) return [exprState, expression];

  const [elemState, element] = parseElement(state);
  if (element) return [elemState, element];

  const [textState, text] = parseText(state);
  if (text) return [textState, text];

  return [state, null];
}

function parse(state: ParserState): ParseResult {
  const children: Node[] = [];
  let currentState = state;

  // Check for frontmatter first
  const [frontmatterState, frontmatter] = parseFrontmatter(currentState);
  if (frontmatter) {
    children.push(frontmatter);
    currentState = frontmatterState;
  }

  // Parse remaining content
  while (!isAtEnd(currentState)) {
    const [nodeState, node] = parseNode(currentState);
    if (node) {
      children.push(node);
      currentState = nodeState;
    } else {
      // Skip unknown tokens
      [currentState] = advance(currentState);
    }
  }

  const startLoc = children[0]?.loc.start || { line: 1, column: 1, offset: 0 };
  const endLoc = children[children.length - 1]?.loc.end || startLoc;

  const ast: FragmentNode = {
    type: 'Fragment',
    children,
    loc: {
      start: startLoc,
      end: endLoc,
    },
  };

  return {
    ast,
    diagnostics: currentState.diagnostics as Diagnostic[],
  };
}

export function parseAstro(source: string, options?: ParseOptions): ParseResult {
  const tokens = tokenize(source);
  const initialState = createInitialState(tokens, options);
  return parse(initialState);
}
