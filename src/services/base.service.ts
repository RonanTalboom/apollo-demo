import { z } from 'zod';
import { PrismaClient } from '../generated/prisma';
import { Loaders } from '../loaders';
import { validate, ValidationError } from '../dto';

/**
 * Context passed to all services
 */
export interface ServiceContext {
  prisma: PrismaClient;
  loaders: Loaders;
  user?: {
    id: number;
    email: string;
    roles: string[];
  };
}

/**
 * Custom error types for consistent error handling
 */
export class NotFoundError extends Error {
  constructor(entity: string, id?: number | string) {
    super(id ? `${entity} with id ${id} not found` : `${entity} not found`);
    this.name = 'NotFoundError';
  }
}

export class UnauthorizedError extends Error {
  constructor(message = 'Authentication required') {
    super(message);
    this.name = 'UnauthorizedError';
  }
}

export class ForbiddenError extends Error {
  constructor(message = 'Permission denied') {
    super(message);
    this.name = 'ForbiddenError';
  }
}

/**
 * Security configuration for service methods
 */
export interface SecurityRule {
  requireAuth?: boolean;
  roles?: string[];
  ownerField?: string;
}

/**
 * Base service class with common functionality
 */
export abstract class BaseService {
  protected abstract entityName: string;

  /**
   * Validate input against a Zod schema
   */
  protected validate<T>(schema: z.ZodSchema<T>, data: unknown): T {
    return validate(schema, data);
  }

  /**
   * Check security rules
   */
  protected checkSecurity(
    ctx: ServiceContext,
    rule: SecurityRule,
    entity?: Record<string, unknown>
  ): void {
    // Check authentication
    if (rule.requireAuth && !ctx.user) {
      throw new UnauthorizedError();
    }

    // Check roles
    if (rule.roles && rule.roles.length > 0) {
      if (!ctx.user) {
        throw new UnauthorizedError();
      }
      const hasRole = rule.roles.some((role) => ctx.user!.roles.includes(role));
      if (!hasRole) {
        throw new ForbiddenError(`Requires one of roles: ${rule.roles.join(', ')}`);
      }
    }

    // Check ownership
    if (rule.ownerField && entity) {
      if (!ctx.user) {
        throw new UnauthorizedError();
      }
      if (entity[rule.ownerField] !== ctx.user.id) {
        throw new ForbiddenError('You do not own this resource');
      }
    }
  }

  /**
   * Ensure entity exists, throw NotFoundError if not
   */
  protected ensureExists<T>(entity: T | null, id?: number | string): T {
    if (!entity) {
      throw new NotFoundError(this.entityName, id);
    }
    return entity;
  }
}

// Re-export errors and validation
export { ValidationError };
