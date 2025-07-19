import type { Position, SourceSpan } from '../types/ast.js';

export enum TokenType {
  Text = 'Text',
  TagOpen = 'TagOpen',
  TagClose = 'TagClose',
  TagSelfClose = 'TagSelfClose',
  AttributeName = 'AttributeName',
  AttributeValue = 'AttributeValue',
  ExpressionStart = 'ExpressionStart',
  ExpressionEnd = 'ExpressionEnd',
  ExpressionContent = 'ExpressionContent',
  FrontmatterStart = 'FrontmatterStart',
  FrontmatterEnd = 'FrontmatterEnd',
  FrontmatterContent = 'FrontmatterContent',
  EOF = 'EOF',
}

export interface Token {
  type: TokenType;
  value: string;
  loc: SourceSpan;
}

export enum Mode {
  HTML = 'HTML',
  Expression = 'Expression',
  Frontmatter = 'Frontmatter',
  Tag = 'Tag',
  Attribute = 'Attribute',
}

interface TokenizerState {
  readonly source: string;
  readonly position: number;
  readonly line: number;
  readonly column: number;
  readonly mode: Mode;
  readonly modeStack: readonly Mode[];
}

function createInitialState(source: string): TokenizerState {
  return {
    source: normalizeLineEndings(source),
    position: 0,
    line: 1,
    column: 1,
    mode: Mode.HTML,
    modeStack: [],
  };
}

function normalizeLineEndings(source: string): string {
  return source.replace(/\r\n/g, '\n');
}

function getCurrentPosition(state: TokenizerState): Position {
  return {
    line: state.line,
    column: state.column,
    offset: state.position,
  };
}

function advance(state: TokenizerState, count = 1): TokenizerState {
  let { position, line, column } = state;

  for (let i = 0; i < count; i++) {
    if (position < state.source.length) {
      if (state.source[position] === '\n') {
        line++;
        column = 1;
      } else {
        column++;
      }
      position++;
    }
  }

  return { ...state, position, line, column };
}

function peek(state: TokenizerState, offset = 0): string {
  return state.source[state.position + offset] || '';
}

function peekSequence(state: TokenizerState, sequence: string): boolean {
  for (let i = 0; i < sequence.length; i++) {
    if (peek(state, i) !== sequence[i]) {
      return false;
    }
  }
  return true;
}

function consumeWhile(
  state: TokenizerState,
  predicate: (char: string) => boolean
): [TokenizerState, string] {
  const start = state.position;
  let currentState = state;

  while (currentState.position < currentState.source.length && predicate(peek(currentState))) {
    currentState = advance(currentState);
  }

  return [currentState, currentState.source.slice(start, currentState.position)];
}

function pushMode(state: TokenizerState, mode: Mode): TokenizerState {
  return {
    ...state,
    modeStack: [...state.modeStack, state.mode],
    mode,
  };
}

function popMode(state: TokenizerState): TokenizerState {
  if (state.modeStack.length > 0) {
    const newStack = [...state.modeStack];
    const mode = newStack.pop();
    if (mode) {
      return { ...state, mode, modeStack: newStack };
    }
  }
  return state;
}

function isAtStart(state: TokenizerState): boolean {
  return state.position === 0;
}

// Removed unused function - component detection is handled in parser

function scanFrontmatter(state: TokenizerState): [TokenizerState, Token | null] {
  if (isAtStart(state) && peekSequence(state, '---')) {
    const start = getCurrentPosition(state);
    let currentState = advance(state, 3); // Skip ---

    const contentStart = currentState.position;
    while (currentState.position < currentState.source.length) {
      if (peek(currentState) === '\n' && peekSequence(currentState, '\n---')) {
        const content = currentState.source.slice(contentStart, currentState.position);
        currentState = advance(currentState); // Skip newline
        currentState = advance(currentState, 3); // Skip ---

        return [
          currentState,
          {
            type: TokenType.FrontmatterContent,
            value: content.trim(),
            loc: {
              start,
              end: getCurrentPosition(currentState),
            },
          },
        ];
      }
      currentState = advance(currentState);
    }
  }
  return [state, null];
}

function scanExpression(state: TokenizerState): [TokenizerState, Token | null] {
  if (peek(state) === '{') {
    const start = getCurrentPosition(state);
    const startPos = state.position;
    let currentState = advance(state); // Skip {

    let depth = 1;
    let incomplete = false;

    while (currentState.position < currentState.source.length && depth > 0) {
      const char = peek(currentState);
      if (char === '{') {
        depth++;
      } else if (char === '}') {
        depth--;
        if (depth === 0) {
          const content = currentState.source.slice(startPos + 1, currentState.position);
          currentState = advance(currentState); // Skip closing }
          return [
            currentState,
            {
              type: TokenType.ExpressionContent,
              value: content,
              loc: {
                start,
                end: getCurrentPosition(currentState),
              },
            },
          ];
        }
      } else if (char === '<' && peekSequence(currentState, '</')) {
        // Stop at closing tag to allow better error recovery
        incomplete = true;
        break;
      }
      currentState = advance(currentState);
    }

    // Unclosed expression
    const content = currentState.source.slice(startPos + 1, currentState.position);
    return [
      currentState,
      {
        type: TokenType.ExpressionContent,
        value: content + (incomplete ? '\x00incomplete' : ''),
        loc: {
          start,
          end: getCurrentPosition(currentState),
        },
      },
    ];
  }
  return [state, null];
}

function scanTag(state: TokenizerState): [TokenizerState, Token | null] {
  const start = getCurrentPosition(state);

  if (peek(state) === '<') {
    let currentState = advance(state);

    // Check for closing tag
    if (peek(currentState) === '/') {
      currentState = advance(currentState);
      const [newState, name] = consumeWhile(currentState, (c) => /[a-zA-Z0-9-]/.test(c));
      currentState = newState;

      const [spacesState, _] = consumeWhile(currentState, (c) => c === ' ' || c === '\t');
      currentState = spacesState;

      if (peek(currentState) === '>') {
        currentState = advance(currentState);
        return [
          currentState,
          {
            type: TokenType.TagClose,
            value: name,
            loc: {
              start,
              end: getCurrentPosition(currentState),
            },
          },
        ];
      }
    } else {
      // Opening tag
      const [newState, name] = consumeWhile(currentState, (c) => /[a-zA-Z0-9-]/.test(c));
      if (name) {
        const tagState = pushMode(newState, Mode.Tag);
        return [
          tagState,
          {
            type: TokenType.TagOpen,
            value: name,
            loc: {
              start,
              end: getCurrentPosition(newState),
            },
          },
        ];
      }
    }
  }
  return [state, null];
}

function scanAttribute(state: TokenizerState): [TokenizerState, Token | null] {
  const [spacesState, _] = consumeWhile(state, (c) => c === ' ' || c === '\t' || c === '\n');
  let currentState = spacesState;

  const start = getCurrentPosition(currentState);

  // Check for self-closing
  if (peekSequence(currentState, '/>')) {
    currentState = advance(currentState, 2);
    currentState = popMode(currentState);
    return [
      currentState,
      {
        type: TokenType.TagSelfClose,
        value: '/>',
        loc: {
          start,
          end: getCurrentPosition(currentState),
        },
      },
    ];
  }

  // Check for tag close
  if (peek(currentState) === '>') {
    currentState = advance(currentState);
    currentState = popMode(currentState);
    return [
      currentState,
      {
        type: TokenType.TagClose,
        value: '>',
        loc: {
          start,
          end: getCurrentPosition(currentState),
        },
      },
    ];
  }

  // Scan attribute name
  const [nameState, name] = consumeWhile(currentState, (c) => /[a-zA-Z0-9-:@]/.test(c));
  if (name) {
    currentState = nameState;
    const token: Token = {
      type: TokenType.AttributeName,
      value: name,
      loc: {
        start,
        end: getCurrentPosition(currentState),
      },
    };

    const [spacesState2, _2] = consumeWhile(currentState, (c) => c === ' ' || c === '\t');
    currentState = spacesState2;

    // Check for attribute value
    if (peek(currentState) === '=') {
      currentState = advance(currentState);
      const [spacesState3, _3] = consumeWhile(currentState, (c) => c === ' ' || c === '\t');
      currentState = spacesState3;

      let value = '';

      if (peek(currentState) === '"' || peek(currentState) === "'") {
        const quote = peek(currentState);
        currentState = advance(currentState);
        const [quotedState, quotedValue] = consumeWhile(currentState, (c) => c !== quote);
        currentState = quotedState;
        value = quotedValue;
        currentState = advance(currentState); // Skip closing quote
      } else if (peek(currentState) === '{') {
        // Expression attribute value
        const [exprState, expr] = scanExpression(currentState);
        if (expr) {
          currentState = exprState;
          value = `{${expr.value}}`;
        }
      }

      // Store the combined token for now - the parser will handle this
      return [
        currentState,
        {
          type: TokenType.AttributeValue,
          value: `${name}=${value}`,
          loc: {
            start: token.loc.start,
            end: getCurrentPosition(currentState),
          },
        },
      ];
    }

    return [currentState, token];
  }

  return [state, null];
}

function scanText(state: TokenizerState): [TokenizerState, Token | null] {
  const start = getCurrentPosition(state);
  const startPos = state.position;

  // Fast scan using indexOf for common delimiters
  const source = state.source;
  let nextLt = source.indexOf('<', startPos);
  let nextBrace = source.indexOf('{', startPos);

  if (nextLt === -1) nextLt = source.length;
  if (nextBrace === -1) nextBrace = source.length;

  const endPos = Math.min(nextLt, nextBrace);

  if (endPos > startPos) {
    // Fast forward position tracking
    const text = source.slice(startPos, endPos);
    const newlines = text.split('\n').length - 1;
    const lastNewlineIndex = text.lastIndexOf('\n');

    const newState: TokenizerState = {
      ...state,
      position: endPos,
      line: state.line + newlines,
      column: newlines > 0 ? text.length - lastNewlineIndex : state.column + text.length,
    };

    return [
      newState,
      {
        type: TokenType.Text,
        value: text,
        loc: {
          start,
          end: getCurrentPosition(newState),
        },
      },
    ];
  }

  return [state, null];
}

// Optimized version for buffer-based processing
function scanTextOptimized(state: TokenizerState): [TokenizerState, Token | null] {
  const start = getCurrentPosition(state);
  const startPos = state.position;
  const source = state.source;
  let pos = startPos;

  // Fast character scanning without function calls
  while (pos < source.length) {
    const charCode = source.charCodeAt(pos);
    if (charCode === 60 || charCode === 123) {
      // '<' or '{'
      break;
    }
    pos++;
  }

  if (pos > startPos) {
    // Count newlines efficiently
    let line = state.line;
    let column = state.column;
    let lastNewlinePos = -1;

    for (let i = startPos; i < pos; i++) {
      if (source.charCodeAt(i) === 10) {
        // '\n'
        line++;
        column = 1;
        lastNewlinePos = i;
      } else if (lastNewlinePos === -1) {
        column++;
      }
    }

    if (lastNewlinePos !== -1) {
      column = pos - lastNewlinePos;
    }

    const newState: TokenizerState = {
      ...state,
      position: pos,
      line,
      column,
    };

    return [
      newState,
      {
        type: TokenType.Text,
        value: source.slice(startPos, pos),
        loc: {
          start,
          end: getCurrentPosition(newState),
        },
      },
    ];
  }

  return [state, null];
}

function nextToken(state: TokenizerState): [TokenizerState, Token] {
  if (state.position >= state.source.length) {
    return [
      state,
      {
        type: TokenType.EOF,
        value: '',
        loc: {
          start: getCurrentPosition(state),
          end: getCurrentPosition(state),
        },
      },
    ];
  }

  // Check for frontmatter at start
  if (isAtStart(state)) {
    const [newState, frontmatter] = scanFrontmatter(state);
    if (frontmatter) {
      return [newState, frontmatter];
    }
  }

  switch (state.mode) {
    case Mode.Tag: {
      const [attrState, attr] = scanAttribute(state);
      if (attr) return [attrState, attr];
      break;
    }

    case Mode.HTML: {
      // Check for expression
      const [exprState, expr] = scanExpression(state);
      if (expr) return [exprState, expr];

      // Check for tag
      const [tagState, tag] = scanTag(state);
      if (tag) return [tagState, tag];

      // Otherwise, scan text
      const [textState, text] = scanText(state);
      if (text) return [textState, text];
      break;
    }
  }

  // Fallback: advance and try again
  return nextToken(advance(state));
}

// Object pooling for performance optimization
interface TokenPool {
  acquire(): Token;
  release(token: Token): void;
}

function createTokenPool(): TokenPool {
  const pool: Token[] = [];
  const maxPoolSize = 100;

  return {
    acquire(): Token {
      const token = pool.pop();
      if (token) {
        // Reset token properties
        token.type = TokenType.EOF;
        token.value = '';
        token.loc = {
          start: { line: 0, column: 0, offset: 0 },
          end: { line: 0, column: 0, offset: 0 },
        };
        return token;
      }
      return {
        type: TokenType.EOF,
        value: '',
        loc: { start: { line: 0, column: 0, offset: 0 }, end: { line: 0, column: 0, offset: 0 } },
      };
    },

    release(token: Token): void {
      if (pool.length < maxPoolSize) {
        pool.push(token);
      }
    },
  };
}

// Jump table optimization for character handling
type CharacterHandler = (state: TokenizerState) => [TokenizerState, Token | null];

// ASCII lookup table for fast character dispatch
const ASCII_HANDLERS = new Array<CharacterHandler | null>(128);
const UNICODE_HANDLERS = new Map<string, CharacterHandler>();

// Initialize ASCII handlers
ASCII_HANDLERS[60] = scanTag; // '<'
ASCII_HANDLERS[123] = scanExpression; // '{'

// Initialize Unicode handlers for special characters
UNICODE_HANDLERS.set('<', scanTag);
UNICODE_HANDLERS.set('{', scanExpression);

function getCharacterHandler(char: string): CharacterHandler | null {
  const charCode = char.charCodeAt(0);
  if (charCode < 128) {
    return ASCII_HANDLERS[charCode];
  }
  return UNICODE_HANDLERS.get(char) || null;
}

// Optimized tokenizer with jump tables and object pooling
export function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  const tokenPool = createTokenPool();
  let state = createInitialState(source);

  while (state.position < state.source.length) {
    const [newState, token] = nextTokenOptimized(state, tokenPool);
    state = newState;

    if (token && token.type !== TokenType.EOF) {
      tokens.push(token);
    }
  }

  return tokens;
}

function nextTokenOptimized(
  state: TokenizerState,
  tokenPool: TokenPool
): [TokenizerState, Token | null] {
  if (state.position >= state.source.length) {
    const token = tokenPool.acquire();
    token.type = TokenType.EOF;
    token.value = '';
    token.loc = {
      start: getCurrentPosition(state),
      end: getCurrentPosition(state),
    };
    return [state, token];
  }

  // Check for frontmatter at start
  if (isAtStart(state)) {
    const [newState, frontmatter] = scanFrontmatter(state);
    if (frontmatter) {
      return [newState, frontmatter];
    }
  }

  switch (state.mode) {
    case Mode.Tag: {
      const [attrState, attr] = scanAttribute(state);
      if (attr) return [attrState, attr];
      break;
    }

    case Mode.HTML: {
      // Use jump table for fast character dispatch
      const char = peek(state);
      const handler = getCharacterHandler(char);

      if (handler) {
        const [newState, token] = handler(state);
        if (token) return [newState, token];
      }

      // Fallback to optimized text scanning
      const [textState, text] = scanTextOptimized(state);
      if (text) return [textState, text];
      break;
    }
  }

  // Fallback: advance and try again
  return nextTokenOptimized(advance(state), tokenPool);
}

// Legacy function for backward compatibility
export function tokenizeLegacy(source: string): Token[] {
  const tokens: Token[] = [];
  let state = createInitialState(source);
  let token: Token;

  do {
    [state, token] = nextToken(state);
    if (token.type !== TokenType.EOF) {
      tokens.push(token);
    }
  } while (token.type !== TokenType.EOF);

  return tokens;
}
