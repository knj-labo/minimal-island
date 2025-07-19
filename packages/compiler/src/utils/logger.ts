/**
 * Structured logging utility for minimal-astro
 * Provides different log levels and environment-based filtering
 */

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
  SILENT = 4,
}

export interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: number;
  context?: Record<string, unknown>;
  error?: Error;
}

export interface LoggerOptions {
  level?: LogLevel;
  prefix?: string;
  enableColors?: boolean;
  enableTimestamp?: boolean;
}

/**
 * Create a logger instance with specified options
 */
export function createLogger(options: LoggerOptions = {}) {
  const {
    level = getDefaultLogLevel(),
    prefix = '[minimal-astro]',
    enableColors = shouldEnableColors(),
    enableTimestamp = false,
  } = options;

  function shouldLog(logLevel: LogLevel): boolean {
    return logLevel >= level;
  }

  function formatMessage(entry: LogEntry): string {
    const parts: string[] = [];

    if (enableTimestamp) {
      parts.push(`[${new Date(entry.timestamp).toISOString()}]`);
    }

    if (prefix) {
      parts.push(prefix);
    }

    const levelName = LogLevel[entry.level];
    if (enableColors) {
      const coloredLevel = colorizeLevel(levelName, entry.level);
      parts.push(`[${coloredLevel}]`);
    } else {
      parts.push(`[${levelName}]`);
    }

    parts.push(entry.message);

    if (entry.context && Object.keys(entry.context).length > 0) {
      parts.push(JSON.stringify(entry.context));
    }

    return parts.join(' ');
  }

  function log(level: LogLevel, message: string, context?: Record<string, unknown>, error?: Error): void {
    if (!shouldLog(level)) return;

    const entry: LogEntry = {
      level,
      message,
      timestamp: Date.now(),
      context,
      error,
    };

    const formatted = formatMessage(entry);

    switch (level) {
      case LogLevel.DEBUG:
      case LogLevel.INFO:
        console.log(formatted);
        break;
      case LogLevel.WARN:
        console.warn(formatted);
        break;
      case LogLevel.ERROR:
        console.error(formatted);
        if (error) {
          console.error(error);
        }
        break;
    }
  }

  return {
    debug(message: string, context?: Record<string, unknown>): void {
      log(LogLevel.DEBUG, message, context);
    },

    info(message: string, context?: Record<string, unknown>): void {
      log(LogLevel.INFO, message, context);
    },

    warn(message: string, context?: Record<string, unknown>): void {
      log(LogLevel.WARN, message, context);
    },

    error(message: string, errorOrContext?: Error | Record<string, unknown>, context?: Record<string, unknown>): void {
      if (errorOrContext instanceof Error) {
        log(LogLevel.ERROR, message, context, errorOrContext);
      } else {
        log(LogLevel.ERROR, message, errorOrContext);
      }
    },

    setLevel(newLevel: LogLevel): void {
      // Note: This would require storing level in a mutable way
      // For now, create a new logger if you need different levels
    },

    getLevel(): LogLevel {
      return level;
    },
  };
}

/**
 * Default logger instance for convenience
 */
export const logger = createLogger();

/**
 * Get default log level from environment
 */
function getDefaultLogLevel(): LogLevel {
  const envLevel = process.env.ASTRO_LOG_LEVEL?.toUpperCase();
  switch (envLevel) {
    case 'DEBUG':
      return LogLevel.DEBUG;
    case 'INFO':
      return LogLevel.INFO;
    case 'WARN':
      return LogLevel.WARN;
    case 'ERROR':
      return LogLevel.ERROR;
    case 'SILENT':
      return LogLevel.SILENT;
    default:
      return process.env.NODE_ENV === 'development' ? LogLevel.DEBUG : LogLevel.INFO;
  }
}

/**
 * Check if colors should be enabled
 */
function shouldEnableColors(): boolean {
  if (typeof process === 'undefined') return false;
  if (process.env.NO_COLOR) return false;
  if (process.env.FORCE_COLOR) return true;
  return process.stdout?.isTTY ?? false;
}

/**
 * Add colors to log level names
 */
function colorizeLevel(levelName: string, level: LogLevel): string {
  const colors = {
    [LogLevel.DEBUG]: '\x1b[36m', // Cyan
    [LogLevel.INFO]: '\x1b[32m',  // Green
    [LogLevel.WARN]: '\x1b[33m',  // Yellow
    [LogLevel.ERROR]: '\x1b[31m', // Red
    [LogLevel.SILENT]: '\x1b[0m', // Reset
  };

  const reset = '\x1b[0m';
  const color = colors[level] ?? reset;
  
  return `${color}${levelName}${reset}`;
}

/**
 * Create a contextual logger with additional context
 */
export function createContextualLogger(baseContext: Record<string, unknown>, options?: LoggerOptions) {
  const baseLogger = createLogger(options);

  return {
    debug(message: string, context?: Record<string, unknown>): void {
      baseLogger.debug(message, { ...baseContext, ...context });
    },

    info(message: string, context?: Record<string, unknown>): void {
      baseLogger.info(message, { ...baseContext, ...context });
    },

    warn(message: string, context?: Record<string, unknown>): void {
      baseLogger.warn(message, { ...baseContext, ...context });
    },

    error(message: string, errorOrContext?: Error | Record<string, unknown>, context?: Record<string, unknown>): void {
      if (errorOrContext instanceof Error) {
        baseLogger.error(message, errorOrContext, { ...baseContext, ...context });
      } else {
        baseLogger.error(message, { ...baseContext, ...errorOrContext });
      }
    },
  };
}