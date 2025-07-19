/**
 * Object pooling utility for performance optimization
 * Reduces GC pressure by reusing objects instead of creating new ones
 */

export interface ObjectPool<T> {
  acquire(): T;
  release(obj: T): void;
  size(): number;
  clear(): void;
}

export interface PoolOptions {
  maxSize?: number;
  initialSize?: number;
}

/**
 * Creates a generic object pool for any type
 */
export function createObjectPool<T>(
  factory: () => T,
  reset: (obj: T) => void,
  options: PoolOptions = {}
): ObjectPool<T> {
  const { maxSize = 100, initialSize = 0 } = options;
  const pool: T[] = [];

  // Pre-populate pool if requested
  for (let i = 0; i < initialSize; i++) {
    pool.push(factory());
  }

  return {
    acquire(): T {
      const obj = pool.pop();
      if (obj !== undefined) {
        return obj;
      }
      return factory();
    },

    release(obj: T): void {
      if (pool.length < maxSize) {
        reset(obj);
        pool.push(obj);
      }
    },

    size(): number {
      return pool.length;
    },

    clear(): void {
      pool.length = 0;
    },
  };
}

/**
 * Pool for AST Position objects
 */
export const positionPool = createObjectPool(
  () => ({ line: 0, column: 0, offset: 0 }),
  (pos) => {
    pos.line = 0;
    pos.column = 0;
    pos.offset = 0;
  },
  { maxSize: 200, initialSize: 10 }
);

/**
 * Pool for AST SourceSpan objects
 */
export const sourceSpanPool = createObjectPool(
  () => ({
    start: { line: 0, column: 0, offset: 0 },
    end: { line: 0, column: 0, offset: 0 },
  }),
  (span) => {
    span.start.line = 0;
    span.start.column = 0;
    span.start.offset = 0;
    span.end.line = 0;
    span.end.column = 0;
    span.end.offset = 0;
  },
  { maxSize: 200, initialSize: 10 }
);

/**
 * Pool for AST Attribute objects
 */
export const attributePool = createObjectPool(
  () => ({
    name: '',
    value: '',
    loc: { start: { line: 0, column: 0, offset: 0 }, end: { line: 0, column: 0, offset: 0 } },
  }),
  (attr) => {
    attr.name = '';
    attr.value = '';
    attr.loc.start.line = 0;
    attr.loc.start.column = 0;
    attr.loc.start.offset = 0;
    attr.loc.end.line = 0;
    attr.loc.end.column = 0;
    attr.loc.end.offset = 0;
  },
  { maxSize: 150, initialSize: 5 }
);

/**
 * Pool for diagnostic objects
 */
export const diagnosticPool = createObjectPool(
  () => ({
    code: '',
    message: '',
    loc: { start: { line: 0, column: 0, offset: 0 }, end: { line: 0, column: 0, offset: 0 } },
    severity: 'error' as 'error' | 'warning',
  }),
  (diag) => {
    diag.code = '';
    diag.message = '';
    diag.loc.start.line = 0;
    diag.loc.start.column = 0;
    diag.loc.start.offset = 0;
    diag.loc.end.line = 0;
    diag.loc.end.column = 0;
    diag.loc.end.offset = 0;
    diag.severity = 'error';
  },
  { maxSize: 50, initialSize: 2 }
);

/**
 * Pool for arrays (frequently allocated for AST children)
 */
export const arrayPool = createObjectPool(
  () => [] as unknown[],
  (arr) => {
    arr.length = 0;
  },
  { maxSize: 300, initialSize: 20 }
);

/**
 * Pool for Set objects (used in dependency tracking)
 */
export const setPool = createObjectPool(
  () => new Set<unknown>(),
  (set) => {
    set.clear();
  },
  { maxSize: 100, initialSize: 5 }
);

/**
 * Pool for Map objects (used in caching)
 */
export const mapPool = createObjectPool(
  () => new Map<unknown, unknown>(),
  (map) => {
    map.clear();
  },
  { maxSize: 50, initialSize: 2 }
);

/**
 * WeakMap for storing metadata that can be garbage collected
 */
export const createMetadataStore = <K extends object, V>() => {
  const metadata = new WeakMap<K, V>();

  return {
    set(key: K, value: V): void {
      metadata.set(key, value);
    },

    get(key: K): V | undefined {
      return metadata.get(key);
    },

    has(key: K): boolean {
      return metadata.has(key);
    },

    delete(key: K): boolean {
      return metadata.delete(key);
    },
  };
};

/**
 * Memory-efficient string pool for commonly used strings
 */
export function createStringPool(maxSize = 1000) {
  const strings = new Map<string, string>();

  return {
    intern: (str: string): string => {
      const existing = strings.get(str);
      if (existing) {
        return existing;
      }

      if (strings.size >= maxSize) {
        // Simple LRU-like behavior: clear half when full
        const entries = Array.from(strings.entries());
        strings.clear();

        // Keep the second half
        for (let i = Math.floor(entries.length / 2); i < entries.length; i++) {
          strings.set(entries[i][0], entries[i][1]);
        }
      }

      strings.set(str, str);
      return str;
    },

    clear: (): void => {
      strings.clear();
    },

    size: (): number => {
      return strings.size;
    },
  };
}

/**
 * Global string pool for interning commonly used strings
 */
export const globalStringPool = createStringPool();

/**
 * Pool statistics for monitoring
 */
export interface PoolStats {
  totalPools: number;
  totalObjects: number;
  breakdown: Record<string, number>;
}

export function getPoolStats(): PoolStats {
  return {
    totalPools: 7,
    totalObjects:
      positionPool.size() +
      sourceSpanPool.size() +
      attributePool.size() +
      diagnosticPool.size() +
      arrayPool.size() +
      setPool.size() +
      mapPool.size(),
    breakdown: {
      positions: positionPool.size(),
      sourceSpans: sourceSpanPool.size(),
      attributes: attributePool.size(),
      diagnostics: diagnosticPool.size(),
      arrays: arrayPool.size(),
      sets: setPool.size(),
      maps: mapPool.size(),
    },
  };
}

/**
 * Cleanup all pools (useful for testing or shutdown)
 */
export function clearAllPools(): void {
  positionPool.clear();
  sourceSpanPool.clear();
  attributePool.clear();
  diagnosticPool.clear();
  arrayPool.clear();
  setPool.clear();
  mapPool.clear();
  globalStringPool.clear();
}
