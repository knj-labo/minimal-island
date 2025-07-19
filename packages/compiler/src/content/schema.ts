/**
 * Schema validation for content collections
 * Provides runtime validation and type generation
 */

import type { ContentEntry, Schema } from './types.js';

export interface ValidationResult {
  /**
   * Whether validation passed
   */
  valid: boolean;

  /**
   * Validation errors
   */
  errors: ValidationError[];

  /**
   * Validated and coerced data
   */
  data?: unknown;
}

export interface ValidationError {
  /**
   * Error path
   */
  path: string;

  /**
   * Error message
   */
  message: string;

  /**
   * Expected type/value
   */
  expected?: string;

  /**
   * Actual value
   */
  actual?: unknown;
}

/**
 * Create a schema validator
 */
export function createSchemaValidator(schema: Schema) {
  return {
    validate(data: unknown): ValidationResult {
      const errors: ValidationError[] = [];
      const validatedData = validateValue(data, schema, '', errors);

      return {
        valid: errors.length === 0,
        errors,
        data: errors.length === 0 ? validatedData : undefined,
      };
    },
  };
}

/**
 * Validate a value against a schema
 */
function validateValue(
  value: unknown,
  schema: Schema,
  path: string,
  errors: ValidationError[]
): unknown {
  // Handle null/undefined
  if (value == null) {
    if (schema.required?.length) {
      errors.push({
        path,
        message: 'Value is required',
        expected: schema.type,
        actual: value,
      });
    }
    return value;
  }

  switch (schema.type) {
    case 'string':
      return validateString(value, schema, path, errors);

    case 'number':
      return validateNumber(value, schema, path, errors);

    case 'boolean':
      return validateBoolean(value, schema, path, errors);

    case 'date':
      return validateDate(value, schema, path, errors);

    case 'array':
      return validateArray(value, schema, path, errors);

    case 'object':
      return validateObject(value, schema, path, errors);

    default:
      errors.push({
        path,
        message: `Unknown schema type: ${schema.type}`,
        expected: 'valid schema type',
        actual: schema.type,
      });
      return value;
  }
}

/**
 * Validate string value
 */
function validateString(
  value: unknown,
  schema: Schema,
  path: string,
  errors: ValidationError[]
): string | unknown {
  if (typeof value !== 'string') {
    errors.push({
      path,
      message: 'Expected string',
      expected: 'string',
      actual: typeof value,
    });
    return value;
  }

  // Custom validation
  if (schema.validate) {
    const result = schema.validate(value);
    if (result !== true) {
      errors.push({
        path,
        message: typeof result === 'string' ? result : 'Validation failed',
        expected: 'valid string',
        actual: value,
      });
    }
  }

  return value;
}

/**
 * Validate number value
 */
function validateNumber(
  value: unknown,
  schema: Schema,
  path: string,
  errors: ValidationError[]
): number | unknown {
  // Try to coerce string numbers
  if (typeof value === 'string' && !Number.isNaN(Number(value))) {
    const numValue = Number(value);
    return numValue;
  }

  if (typeof value !== 'number' || Number.isNaN(value)) {
    errors.push({
      path,
      message: 'Expected number',
      expected: 'number',
      actual: typeof value,
    });
    return value;
  }

  // Custom validation
  if (schema.validate) {
    const result = schema.validate(value);
    if (result !== true) {
      errors.push({
        path,
        message: typeof result === 'string' ? result : 'Validation failed',
        expected: 'valid number',
        actual: value,
      });
    }
  }

  return value;
}

/**
 * Validate boolean value
 */
function validateBoolean(
  value: unknown,
  _schema: Schema,
  path: string,
  errors: ValidationError[]
): boolean | unknown {
  // Coerce string booleans
  let coercedValue = value;
  if (value === 'true') coercedValue = true;
  if (value === 'false') coercedValue = false;

  if (typeof coercedValue !== 'boolean') {
    errors.push({
      path,
      message: 'Expected boolean',
      expected: 'boolean',
      actual: typeof coercedValue,
    });
    return coercedValue;
  }

  return coercedValue;
}

/**
 * Validate date value
 */
function validateDate(
  value: unknown,
  _schema: Schema,
  path: string,
  errors: ValidationError[]
): Date | unknown {
  let date: Date;

  if (value instanceof Date) {
    date = value;
  } else if (typeof value === 'string') {
    date = new Date(value);
  } else if (typeof value === 'number') {
    date = new Date(value);
  } else {
    errors.push({
      path,
      message: 'Expected date',
      expected: 'Date, string, or number',
      actual: typeof value,
    });
    return value;
  }

  if (Number.isNaN(date.getTime())) {
    errors.push({
      path,
      message: 'Invalid date',
      expected: 'valid date',
      actual: value,
    });
    return value;
  }

  return date;
}

/**
 * Validate array value
 */
function validateArray(
  value: unknown,
  schema: Schema,
  path: string,
  errors: ValidationError[]
): unknown[] | unknown {
  if (!Array.isArray(value)) {
    errors.push({
      path,
      message: 'Expected array',
      expected: 'array',
      actual: typeof value,
    });
    return value;
  }

  // Validate items if schema provided
  if (schema.items) {
    return value.map((item, index) =>
      validateValue(item, schema.items, `${path}[${index}]`, errors)
    );
  }

  return value;
}

/**
 * Validate object value
 */
function validateObject(
  value: unknown,
  schema: Schema,
  path: string,
  errors: ValidationError[]
): Record<string, unknown> | unknown {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    errors.push({
      path,
      message: 'Expected object',
      expected: 'object',
      actual: Array.isArray(value) ? 'array' : typeof value,
    });
    return value;
  }

  const result: Record<string, unknown> = {};

  // Check required properties
  if (schema.required) {
    for (const prop of schema.required) {
      if (!(prop in value)) {
        errors.push({
          path: path ? `${path}.${prop}` : prop,
          message: 'Required property missing',
          expected: 'property to exist',
          actual: 'undefined',
        });
      }
    }
  }

  // Validate properties
  if (schema.properties) {
    for (const [prop, propSchema] of Object.entries(schema.properties)) {
      const propPath = path ? `${path}.${prop}` : prop;
      if (prop in value) {
        result[prop] = validateValue(value[prop], propSchema, propPath, errors);
      }
    }
  }

  // Copy non-schema properties
  for (const [prop, val] of Object.entries(value)) {
    if (!schema.properties || !(prop in schema.properties)) {
      result[prop] = val;
    }
  }

  return result;
}

/**
 * Built-in schema helpers
 */
export const z = {
  string(): Schema {
    return { type: 'string' };
  },

  number(): Schema {
    return { type: 'number' };
  },

  boolean(): Schema {
    return { type: 'boolean' };
  },

  date(): Schema {
    return { type: 'date' };
  },

  array(items: Schema): Schema {
    return { type: 'array', items };
  },

  object(properties: Record<string, Schema>, required?: string[]): Schema {
    return { type: 'object', properties, required };
  },

  optional(schema: Schema): Schema {
    return { ...schema };
  },

  enum(values: string[]): Schema {
    return {
      type: 'string',
      validate: (value: string) => {
        if (!values.includes(value)) {
          return `Expected one of: ${values.join(', ')}`;
        }
        return true;
      },
    };
  },

  min(minValue: number): (schema: Schema) => Schema {
    return (schema: Schema) => ({
      ...schema,
      validate: (value: number) => {
        if (value < minValue) {
          return `Value must be at least ${minValue}`;
        }
        return true;
      },
    });
  },

  max(maxValue: number): (schema: Schema) => Schema {
    return (schema: Schema) => ({
      ...schema,
      validate: (value: number) => {
        if (value > maxValue) {
          return `Value must be at most ${maxValue}`;
        }
        return true;
      },
    });
  },

  email(): Schema {
    return {
      type: 'string',
      validate: (value: string) => {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(value)) {
          return 'Invalid email format';
        }
        return true;
      },
    };
  },

  url(): Schema {
    return {
      type: 'string',
      validate: (value: string) => {
        try {
          new URL(value);
          return true;
        } catch {
          return 'Invalid URL format';
        }
      },
    };
  },
};

/**
 * Validate content entry against schema
 */
export function validateContentEntry(entry: ContentEntry, schema?: Schema): ValidationResult {
  if (!schema) {
    return {
      valid: true,
      errors: [],
      data: entry.data,
    };
  }

  const validator = createSchemaValidator(schema);
  return validator.validate(entry.data);
}
