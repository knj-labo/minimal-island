/**
 * Content Collections type definitions
 * Provides type-safe content management for Astro
 */

export interface ContentConfig {
  /**
   * Collections configuration
   */
  collections: Record<string, CollectionConfig>;
}

export interface CollectionConfig {
  /**
   * Collection type
   */
  type?: 'content' | 'data';

  /**
   * Schema definition for validation
   */
  schema?: Schema;

  /**
   * Custom loader function
   */
  loader?: ContentLoader;

  /**
   * Transform function for content
   */
  transform?: ContentTransformer;
}

export interface Schema {
  /**
   * Schema type
   */
  type: 'object' | 'string' | 'number' | 'boolean' | 'array' | 'date';

  /**
   * Properties for object schemas
   */
  properties?: Record<string, Schema>;

  /**
   * Required properties
   */
  required?: string[];

  /**
   * Array items schema
   */
  items?: Schema;

  /**
   * Validation rules
   */
  validate?: (value: unknown) => boolean | string;
}

export interface ContentEntry<T = Record<string, unknown>> {
  /**
   * Unique ID for the entry
   */
  id: string;

  /**
   * Collection name
   */
  collection: string;

  /**
   * Entry slug
   */
  slug: string;

  /**
   * File path
   */
  file: string;

  /**
   * Parsed frontmatter data
   */
  data: T;

  /**
   * Raw content body
   */
  body?: string;

  /**
   * Rendered content
   */
  render?: () => Promise<ContentRenderResult>;
}

export interface ContentRenderResult {
  /**
   * Rendered HTML content
   */
  html: string;

  /**
   * Extracted headings
   */
  headings?: Heading[];

  /**
   * Reading time estimate
   */
  readingTime?: ReadingTime;
}

export interface Heading {
  /**
   * Heading level (1-6)
   */
  level: number;

  /**
   * Heading text
   */
  text: string;

  /**
   * Heading slug/id
   */
  slug: string;
}

export interface ReadingTime {
  /**
   * Estimated minutes to read
   */
  minutes: number;

  /**
   * Word count
   */
  words: number;
}

export type ContentLoader = (file: string, collection: string) => Promise<Partial<ContentEntry>>;

export type ContentTransformer = (entry: ContentEntry) => ContentEntry | Promise<ContentEntry>;

/**
 * Query builder types
 */
export interface ContentQuery<T = Record<string, unknown>> {
  /**
   * Filter entries
   */
  where(predicate: (entry: ContentEntry<T>) => boolean): ContentQuery<T>;

  /**
   * Sort entries
   */
  sort(compareFn: (a: ContentEntry<T>, b: ContentEntry<T>) => number): ContentQuery<T>;

  /**
   * Limit results
   */
  limit(count: number): ContentQuery<T>;

  /**
   * Skip entries
   */
  skip(count: number): ContentQuery<T>;

  /**
   * Get all matching entries
   */
  all(): Promise<ContentEntry<T>[]>;

  /**
   * Get first matching entry
   */
  first(): Promise<ContentEntry<T> | null>;

  /**
   * Count matching entries
   */
  count(): Promise<number>;
}

/**
 * Content API
 */
export interface ContentAPI {
  /**
   * Get a collection
   */
  getCollection<T = Record<string, unknown>>(name: string): Promise<ContentEntry<T>[]>;

  /**
   * Get entry by ID
   */
  getEntry<T = Record<string, unknown>>(
    collection: string,
    id: string
  ): Promise<ContentEntry<T> | null>;

  /**
   * Get entry by slug
   */
  getEntryBySlug<T = Record<string, unknown>>(
    collection: string,
    slug: string
  ): Promise<ContentEntry<T> | null>;

  /**
   * Query builder
   */
  query<T = Record<string, unknown>>(collection: string): ContentQuery<T>;

  /**
   * Get all collections
   */
  getCollections(): string[];
}
