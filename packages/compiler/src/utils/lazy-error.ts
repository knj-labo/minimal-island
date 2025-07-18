/**
 * Lazy error construction utilities for performance optimization
 * Avoids expensive string operations until errors are actually accessed
 */

import type { Position, SourceSpan } from '../../types/ast.js';

/**
 * Lazy error message factory type
 */
export type LazyMessageFactory = () => string;

/**
 * Enhanced error class with lazy message construction
 */
export class LazyError extends Error {
  private _message: string | undefined;
  private messageFactory: LazyMessageFactory;
  
  constructor(messageFactory: LazyMessageFactory, name = 'LazyError') {
    super();
    this.name = name;
    this.messageFactory = messageFactory;
  }

  get message(): string {
    if (this._message === undefined) {
      this._message = this.messageFactory();
    }
    return this._message;
  }

  set message(value: string) {
    this._message = value;
  }
}

/**
 * Parse error with lazy message construction
 */
export class LazyParseError extends LazyError {
  constructor(
    messageFactory: LazyMessageFactory,
    public position: Position,
    public filename = '<anonymous>'
  ) {
    super(messageFactory, 'ParseError');
  }
}

/**
 * Transform error with lazy message construction
 */
export class LazyTransformError extends LazyError {
  constructor(
    messageFactory: LazyMessageFactory,
    public filename: string,
    public phase: string
  ) {
    super(messageFactory, 'TransformError');
  }
}

/**
 * Creates a lazy parse error with position information
 */
export function createLazyParseError(
  messageFactory: LazyMessageFactory,
  position: Position,
  filename = '<anonymous>'
): LazyParseError {
  return new LazyParseError(
    () => `Parse error at ${filename}:${position.line}:${position.column}: ${messageFactory()}`,
    position,
    filename
  );
}

/**
 * Creates a lazy transform error with context
 */
export function createLazyTransformError(
  messageFactory: LazyMessageFactory,
  filename: string,
  phase: string
): LazyTransformError {
  return new LazyTransformError(
    () => `Transform error in ${phase} for ${filename}: ${messageFactory()}`,
    filename,
    phase
  );
}

/**
 * Creates a lazy error with source span information
 */
export function createLazySpanError(
  messageFactory: LazyMessageFactory,
  span: SourceSpan,
  filename = '<anonymous>'
): LazyParseError {
  return new LazyParseError(
    () => `Error at ${filename}:${span.start.line}:${span.start.column}-${span.end.line}:${span.end.column}: ${messageFactory()}`,
    span.start,
    filename
  );
}

/**
 * Lazy diagnostic message factory
 */
export function createLazyDiagnostic(
  code: string,
  messageFactory: LazyMessageFactory,
  span: SourceSpan,
  severity: 'error' | 'warning' = 'error'
) {
  return {
    code,
    get message() {
      return messageFactory();
    },
    loc: span,
    severity,
  };
}

/**
 * Performance-optimized error aggregator
 */
export class ErrorAggregator {
  private errors: LazyError[] = [];
  private warnings: LazyError[] = [];
  private maxErrors: number;
  private maxWarnings: number;

  constructor(maxErrors = 50, maxWarnings = 100) {
    this.maxErrors = maxErrors;
    this.maxWarnings = maxWarnings;
  }

  addError(error: LazyError | LazyMessageFactory, position?: Position, filename?: string): void {
    if (this.errors.length >= this.maxErrors) {
      return; // Prevent memory bloat
    }

    if (typeof error === 'function') {
      this.errors.push(
        position 
          ? createLazyParseError(error, position, filename)
          : new LazyError(error, 'CompilerError')
      );
    } else {
      this.errors.push(error);
    }
  }

  addWarning(warning: LazyError | LazyMessageFactory, position?: Position, filename?: string): void {
    if (this.warnings.length >= this.maxWarnings) {
      return; // Prevent memory bloat
    }

    if (typeof warning === 'function') {
      this.warnings.push(
        position 
          ? createLazyParseError(warning, position, filename)
          : new LazyError(warning, 'CompilerWarning')
      );
    } else {
      this.warnings.push(warning);
    }
  }

  hasErrors(): boolean {
    return this.errors.length > 0;
  }

  hasWarnings(): boolean {
    return this.warnings.length > 0;
  }

  getErrors(): LazyError[] {
    return [...this.errors];
  }

  getWarnings(): LazyError[] {
    return [...this.warnings];
  }

  clear(): void {
    this.errors.length = 0;
    this.warnings.length = 0;
  }

  // Only formats messages when actually needed
  format(): string {
    const parts: string[] = [];
    
    if (this.errors.length > 0) {
      parts.push('Errors:');
      this.errors.forEach((error, i) => {
        parts.push(`  ${i + 1}. ${error.message}`);
      });
    }

    if (this.warnings.length > 0) {
      parts.push('Warnings:');
      this.warnings.forEach((warning, i) => {
        parts.push(`  ${i + 1}. ${warning.message}`);
      });
    }

    return parts.join('\n');
  }
}

/**
 * Common error message factories for performance
 */
export const ErrorFactories = {
  unexpectedToken: (token: string, expected?: string) => () => 
    `Unexpected token "${token}"${expected ? `, expected ${expected}` : ''}`,
  
  unclosedTag: (tagName: string) => () => 
    `Unclosed tag "${tagName}"`,
  
  invalidAttribute: (attrName: string, value: string) => () => 
    `Invalid attribute "${attrName}" with value "${value}"`,
  
  missingImport: (moduleName: string) => () => 
    `Missing import for "${moduleName}"`,
  
  cyclicDependency: (path: string[]) => () => 
    `Cyclic dependency detected: ${path.join(' -> ')}`,
  
  transformFailed: (phase: string, reason: string) => () => 
    `Transform failed in ${phase}: ${reason}`,
  
  unsupportedFeature: (feature: string) => () => 
    `Unsupported feature: ${feature}`,
  
  invalidSyntax: (context: string) => () => 
    `Invalid syntax in ${context}`,
};

/**
 * Error context for better debugging
 */
export interface ErrorContext {
  filename: string;
  source: string;
  position: Position;
  phase: string;
}

/**
 * Creates an error with rich context information
 */
export function createContextualError(
  messageFactory: LazyMessageFactory,
  context: ErrorContext
): LazyParseError {
  return new LazyParseError(
    () => {
      const message = messageFactory();
      const { filename, source, position, phase } = context;
      
      // Get the line content for better context
      const lines = source.split('\n');
      const line = lines[position.line - 1] || '';
      const pointer = ' '.repeat(position.column - 1) + '^';
      
      return [
        `${phase} error in ${filename}:${position.line}:${position.column}`,
        message,
        '',
        `${position.line} | ${line}`,
        `${' '.repeat(position.line.toString().length)} | ${pointer}`,
      ].join('\n');
    },
    context.position,
    context.filename
  );
}

/**
 * Lightweight error that only computes message when needed
 */
export function createLightweightError(
  messageFactory: LazyMessageFactory,
  metadata: Record<string, any> = {}
): LazyError {
  const error = new LazyError(messageFactory);
  Object.assign(error, metadata);
  return error;
}