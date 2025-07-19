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
export function createLazyError(messageFactory: LazyMessageFactory, name = 'LazyError') {
  let _message: string | undefined;

  const error = new Error() as Error & {
    get message(): string;
    set message(value: string);
  };

  error.name = name;

  Object.defineProperty(error, 'message', {
    get() {
      if (_message === undefined) {
        _message = messageFactory();
      }
      return _message;
    },
    set(value: string) {
      _message = value;
    },
    enumerable: true,
    configurable: true,
  });

  return error;
}

/**
 * Legacy class for backward compatibility
 * @deprecated Use createLazyError() instead
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
export function createLazyParseError(
  messageFactory: LazyMessageFactory,
  position: Position,
  filename = '<anonymous>'
) {
  const error = createLazyError(messageFactory, 'ParseError') as ReturnType<
    typeof createLazyError
  > & {
    position: Position;
    filename: string;
  };

  error.position = position;
  error.filename = filename;

  return error;
}

/**
 * Transform error with lazy message construction
 */
export function createLazyTransformError(
  messageFactory: LazyMessageFactory,
  filename: string,
  phase: string
) {
  const error = createLazyError(messageFactory, 'TransformError') as ReturnType<
    typeof createLazyError
  > & {
    filename: string;
    phase: string;
  };

  error.filename = filename;
  error.phase = phase;

  return error;
}

/**
 * Legacy classes for backward compatibility
 * @deprecated Use createLazyParseError() and createLazyTransformError() instead
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
export function createLazyParseErrorWithContext(
  messageFactory: LazyMessageFactory,
  position: Position,
  filename = '<anonymous>'
) {
  return createLazyParseError(
    () => `Parse error at ${filename}:${position.line}:${position.column}: ${messageFactory()}`,
    position,
    filename
  );
}

/**
 * Creates a lazy transform error with context
 */
export function createLazyTransformErrorWithContext(
  messageFactory: LazyMessageFactory,
  filename: string,
  phase: string
) {
  return createLazyTransformError(
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
) {
  return createLazyParseError(
    () =>
      `Error at ${filename}:${span.start.line}:${span.start.column}-${span.end.line}:${span.end.column}: ${messageFactory()}`,
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
export function createErrorAggregator(maxErrors = 50, maxWarnings = 100) {
  const errors: Error[] = [];
  const warnings: Error[] = [];

  return {
    addError(error: Error | LazyMessageFactory, position?: Position, filename?: string): void {
      if (errors.length >= maxErrors) {
        return; // Prevent memory bloat
      }

      if (typeof error === 'function') {
        errors.push(
          position
            ? createLazyParseErrorWithContext(error, position, filename)
            : createLazyError(error, 'CompilerError')
        );
      } else {
        errors.push(error);
      }
    },

    addWarning(warning: Error | LazyMessageFactory, position?: Position, filename?: string): void {
      if (warnings.length >= maxWarnings) {
        return; // Prevent memory bloat
      }

      if (typeof warning === 'function') {
        warnings.push(
          position
            ? createLazyParseErrorWithContext(warning, position, filename)
            : createLazyError(warning, 'CompilerWarning')
        );
      } else {
        warnings.push(warning);
      }
    },

    hasErrors(): boolean {
      return errors.length > 0;
    },

    hasWarnings(): boolean {
      return warnings.length > 0;
    },

    getErrors(): Error[] {
      return [...errors];
    },

    getWarnings(): Error[] {
      return [...warnings];
    },

    clear(): void {
      errors.length = 0;
      warnings.length = 0;
    },

    // Only formats messages when actually needed
    format(): string {
      const parts: string[] = [];

      if (errors.length > 0) {
        parts.push('Errors:');
        errors.forEach((error, i) => {
          parts.push(`  ${i + 1}. ${error.message}`);
        });
      }

      if (warnings.length > 0) {
        parts.push('Warnings:');
        warnings.forEach((warning, i) => {
          parts.push(`  ${i + 1}. ${warning.message}`);
        });
      }

      return parts.join('\n');
    },
  };
}

/**
 * Legacy class for backward compatibility
 * @deprecated Use createErrorAggregator() instead
 */
export class ErrorAggregator {
  private aggregator = createErrorAggregator();

  constructor(maxErrors = 50, maxWarnings = 100) {
    this.aggregator = createErrorAggregator(maxErrors, maxWarnings);
  }

  addError(error: LazyError | LazyMessageFactory, position?: Position, filename?: string): void {
    this.aggregator.addError(error, position, filename);
  }

  addWarning(
    warning: LazyError | LazyMessageFactory,
    position?: Position,
    filename?: string
  ): void {
    this.aggregator.addWarning(warning, position, filename);
  }

  hasErrors(): boolean {
    return this.aggregator.hasErrors();
  }

  hasWarnings(): boolean {
    return this.aggregator.hasWarnings();
  }

  getErrors(): LazyError[] {
    return this.aggregator.getErrors() as LazyError[];
  }

  getWarnings(): LazyError[] {
    return this.aggregator.getWarnings() as LazyError[];
  }

  clear(): void {
    this.aggregator.clear();
  }

  format(): string {
    return this.aggregator.format();
  }
}

/**
 * Common error message factories for performance
 */
export const ErrorFactories = {
  unexpectedToken: (token: string, expected?: string) => () =>
    `Unexpected token "${token}"${expected ? `, expected ${expected}` : ''}`,

  unclosedTag: (tagName: string) => () => `Unclosed tag "${tagName}"`,

  invalidAttribute: (attrName: string, value: string) => () =>
    `Invalid attribute "${attrName}" with value "${value}"`,

  missingImport: (moduleName: string) => () => `Missing import for "${moduleName}"`,

  cyclicDependency: (path: string[]) => () => `Cyclic dependency detected: ${path.join(' -> ')}`,

  transformFailed: (phase: string, reason: string) => () =>
    `Transform failed in ${phase}: ${reason}`,

  unsupportedFeature: (feature: string) => () => `Unsupported feature: ${feature}`,

  invalidSyntax: (context: string) => () => `Invalid syntax in ${context}`,
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
export function createContextualError(messageFactory: LazyMessageFactory, context: ErrorContext) {
  return createLazyParseError(
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
) {
  const error = createLazyError(messageFactory);
  Object.assign(error, metadata);
  return error;
}
