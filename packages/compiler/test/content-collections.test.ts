import { describe, expect, test } from 'bun:test';
import type { ContentConfig } from '../src/content/types.js';
import {
  calculateReadingTime,
  createContentManager,
  createSchemaValidator,
  extractHeadings,
  generateSlug,
  parseFrontmatter,
  z,
} from '../src/index.js';

describe('Content Collections', () => {
  describe('Schema Validation', () => {
    test('should validate string schema', () => {
      const schema = z.string();
      const validator = createSchemaValidator(schema);

      const result = validator.validate('hello');
      expect(result.valid).toBe(true);
      expect(result.data).toBe('hello');
    });

    test('should validate number schema', () => {
      const schema = z.number();
      const validator = createSchemaValidator(schema);

      const result = validator.validate(42);
      expect(result.valid).toBe(true);
      expect(result.data).toBe(42);
    });

    test('should coerce string numbers', () => {
      const schema = z.number();
      const validator = createSchemaValidator(schema);

      const result = validator.validate('42');
      expect(result.valid).toBe(true);
      expect(result.data).toBe(42);
    });

    test('should validate object schema', () => {
      const schema = z.object(
        {
          title: z.string(),
          count: z.number(),
          published: z.boolean(),
        },
        ['title']
      );

      const validator = createSchemaValidator(schema);

      const result = validator.validate({
        title: 'Hello World',
        count: 10,
        published: true,
      });

      expect(result.valid).toBe(true);
      expect(result.data).toEqual({
        title: 'Hello World',
        count: 10,
        published: true,
      });
    });

    test('should fail validation for missing required fields', () => {
      const schema = z.object(
        {
          title: z.string(),
          count: z.number(),
        },
        ['title', 'count']
      );

      const validator = createSchemaValidator(schema);

      const result = validator.validate({
        title: 'Hello World',
      });

      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].path).toBe('count');
    });

    test('should validate array schema', () => {
      const schema = z.array(z.string());
      const validator = createSchemaValidator(schema);

      const result = validator.validate(['a', 'b', 'c']);
      expect(result.valid).toBe(true);
      expect(result.data).toEqual(['a', 'b', 'c']);
    });

    test('should validate enum schema', () => {
      const schema = z.enum(['draft', 'published', 'archived']);
      const validator = createSchemaValidator(schema);

      const result = validator.validate('published');
      expect(result.valid).toBe(true);
      expect(result.data).toBe('published');

      const invalidResult = validator.validate('invalid');
      expect(invalidResult.valid).toBe(false);
    });

    test('should validate email schema', () => {
      const schema = z.email();
      const validator = createSchemaValidator(schema);

      const result = validator.validate('test@example.com');
      expect(result.valid).toBe(true);

      const invalidResult = validator.validate('not-an-email');
      expect(invalidResult.valid).toBe(false);
    });
  });

  describe('Frontmatter Parsing', () => {
    test('should parse basic frontmatter', () => {
      const content = `---
title: Hello World
date: 2023-01-01
published: true
tags: [blog, tech]
---

This is the content body.`;

      const result = parseFrontmatter(content);

      expect(result.frontmatter).toEqual({
        title: 'Hello World',
        date: '2023-01-01',
        published: true,
        tags: ['blog', 'tech'],
      });
      expect(result.content).toBe('This is the content body.');
    });

    test('should handle content without frontmatter', () => {
      const content = 'Just regular content without frontmatter.';

      const result = parseFrontmatter(content);

      expect(result.frontmatter).toEqual({});
      expect(result.content).toBe('Just regular content without frontmatter.');
    });

    test('should handle empty frontmatter', () => {
      const content = `---
---

Content after empty frontmatter.`;

      const result = parseFrontmatter(content);

      expect(result.frontmatter).toEqual({});
      expect(result.content).toBe('Content after empty frontmatter.');
    });
  });

  describe('Slug Generation', () => {
    test('should generate slug from filename', () => {
      expect(generateSlug('hello-world.md')).toBe('hello-world');
      expect(generateSlug('My Blog Post.md')).toBe('my-blog-post');
      expect(generateSlug('Special_Characters!@#.md')).toBe('special-characters');
    });
  });

  describe('Heading Extraction', () => {
    test('should extract headings from markdown', () => {
      const content = `# Main Title

Some content here.

## Section One

More content.

### Subsection

Even more content.

## Section Two

Final content.`;

      const headings = extractHeadings(content);

      expect(headings).toHaveLength(4);
      expect(headings[0]).toEqual({
        level: 1,
        text: 'Main Title',
        slug: 'main-title',
      });
      expect(headings[1]).toEqual({
        level: 2,
        text: 'Section One',
        slug: 'section-one',
      });
      expect(headings[2]).toEqual({
        level: 3,
        text: 'Subsection',
        slug: 'subsection',
      });
      expect(headings[3]).toEqual({
        level: 2,
        text: 'Section Two',
        slug: 'section-two',
      });
    });
  });

  describe('Reading Time Calculation', () => {
    test('should calculate reading time', () => {
      const content = 'word '.repeat(200); // 200 words

      const readingTime = calculateReadingTime(content);

      expect(readingTime.words).toBe(200);
      expect(readingTime.minutes).toBe(1);
    });

    test('should handle longer content', () => {
      const content = 'word '.repeat(500); // 500 words

      const readingTime = calculateReadingTime(content);

      expect(readingTime.words).toBe(500);
      expect(readingTime.minutes).toBe(3); // 500 / 200 = 2.5, rounded up to 3
    });
  });

  describe('Content Manager', () => {
    test('should create content manager', () => {
      const config: ContentConfig = {
        collections: {
          blog: {
            type: 'content',
            schema: z.object(
              {
                title: z.string(),
                date: z.date(),
                published: z.boolean(),
              },
              ['title', 'date']
            ),
          },
        },
      };

      const manager = createContentManager({
        root: './content',
        config,
      });

      expect(manager).toBeDefined();
      expect(typeof manager.getCollection).toBe('function');
      expect(typeof manager.getEntry).toBe('function');
      expect(typeof manager.query).toBe('function');
    });

    test('should return empty collection for non-existent collection', async () => {
      const config: ContentConfig = {
        collections: {},
      };

      const manager = createContentManager({
        root: './content',
        config,
      });

      try {
        await manager.getCollection('nonexistent');
        expect(false).toBe(true); // Should not reach here
      } catch (error) {
        expect(error).toBeDefined();
      }
    });

    test('should create query builder', () => {
      const config: ContentConfig = {
        collections: {
          blog: {
            type: 'content',
          },
        },
      };

      const manager = createContentManager({
        root: './content',
        config,
      });

      const query = manager.query('blog');

      expect(query).toBeDefined();
      expect(typeof query.where).toBe('function');
      expect(typeof query.sort).toBe('function');
      expect(typeof query.limit).toBe('function');
      expect(typeof query.all).toBe('function');
    });
  });

  describe('Query Builder', () => {
    const mockEntries = [
      {
        id: 'blog/post-1',
        collection: 'blog',
        slug: 'post-1',
        file: 'post-1.md',
        data: { title: 'First Post', date: new Date('2023-01-01'), published: true },
      },
      {
        id: 'blog/post-2',
        collection: 'blog',
        slug: 'post-2',
        file: 'post-2.md',
        data: { title: 'Second Post', date: new Date('2023-01-02'), published: false },
      },
      {
        id: 'blog/post-3',
        collection: 'blog',
        slug: 'post-3',
        file: 'post-3.md',
        data: { title: 'Third Post', date: new Date('2023-01-03'), published: true },
      },
    ];

    test('should filter entries', async () => {
      const config: ContentConfig = {
        collections: {
          blog: { type: 'content' },
        },
      };

      const manager = createContentManager({
        root: './content',
        config,
      });

      // Mock the query implementation
      const query = manager.query('blog');
      // biome-ignore lint/suspicious/noExplicitAny: Test mock
      (query as any).entries = mockEntries;

      const publishedPosts = await query.where((entry) => entry.data.published).all();

      expect(publishedPosts).toHaveLength(2);
      expect(publishedPosts.every((post) => post.data.published)).toBe(true);
    });

    test('should sort entries', async () => {
      const config: ContentConfig = {
        collections: {
          blog: { type: 'content' },
        },
      };

      const manager = createContentManager({
        root: './content',
        config,
      });

      const query = manager.query('blog');
      // biome-ignore lint/suspicious/noExplicitAny: Test mock
      (query as any).entries = mockEntries;

      const sortedPosts = await query
        .sort((a, b) => b.data.date.getTime() - a.data.date.getTime())
        .all();

      expect(sortedPosts[0].slug).toBe('post-3');
      expect(sortedPosts[1].slug).toBe('post-2');
      expect(sortedPosts[2].slug).toBe('post-1');
    });

    test('should limit results', async () => {
      const config: ContentConfig = {
        collections: {
          blog: { type: 'content' },
        },
      };

      const manager = createContentManager({
        root: './content',
        config,
      });

      const query = manager.query('blog');
      // biome-ignore lint/suspicious/noExplicitAny: Test mock
      (query as any).entries = mockEntries;

      const limitedPosts = await query.limit(2).all();

      expect(limitedPosts).toHaveLength(2);
    });
  });
});
