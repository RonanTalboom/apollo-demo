import { GraphQLError } from 'graphql';
import type { PrismaClient } from '../generated/prisma';

// Context with auth info
export interface ServiceContext {
  prisma: PrismaClient;
  user?: {
    id: number;
    role: 'ADMIN' | 'USER' | 'GUEST';
  };
}

// Security check types
type Permission = 'read' | 'create' | 'update' | 'delete';

interface SecurityConfig {
  requireAuth?: boolean;
  allowedRoles?: Array<'ADMIN' | 'USER' | 'GUEST'>;
  ownershipCheck?: (ctx: ServiceContext, resourceId: number) => Promise<boolean>;
}

// Base service configuration
export interface ServiceConfig<T> {
  modelName: string;
  security?: {
    read?: SecurityConfig;
    create?: SecurityConfig;
    update?: SecurityConfig;
    delete?: SecurityConfig;
  };
  // Hooks for custom logic
  beforeCreate?: (data: unknown, ctx: ServiceContext) => Promise<unknown>;
  afterCreate?: (record: T, ctx: ServiceContext) => Promise<void>;
  beforeUpdate?: (id: number, data: unknown, ctx: ServiceContext) => Promise<unknown>;
  afterUpdate?: (record: T, ctx: ServiceContext) => Promise<void>;
  beforeDelete?: (id: number, ctx: ServiceContext) => Promise<void>;
  afterDelete?: (record: T, ctx: ServiceContext) => Promise<void>;
}

// Error helpers
export class NotFoundError extends GraphQLError {
  constructor(entity: string) {
    super(`${entity} not found`, { extensions: { code: 'NOT_FOUND' } });
  }
}

export class UnauthorizedError extends GraphQLError {
  constructor(message = 'Authentication required') {
    super(message, { extensions: { code: 'UNAUTHORIZED' } });
  }
}

export class ForbiddenError extends GraphQLError {
  constructor(message = 'You do not have permission to perform this action') {
    super(message, { extensions: { code: 'FORBIDDEN' } });
  }
}

export class ValidationError extends GraphQLError {
  constructor(message: string, field?: string) {
    super(message, { extensions: { code: 'BAD_USER_INPUT', field } });
  }
}

export class ConflictError extends GraphQLError {
  constructor(message: string) {
    super(message, { extensions: { code: 'CONFLICT' } });
  }
}

// Base service class
export abstract class BaseService<T, CreateInput, UpdateInput> {
  protected config: ServiceConfig<T>;

  constructor(config: ServiceConfig<T>) {
    this.config = config;
  }

  // Security check
  protected async checkPermission(
    ctx: ServiceContext,
    permission: Permission,
    resourceId?: number
  ): Promise<void> {
    const securityConfig = this.config.security?.[permission];

    if (!securityConfig) return; // No security config = public access

    // Check authentication
    if (securityConfig.requireAuth && !ctx.user) {
      throw new UnauthorizedError();
    }

    // Check role
    if (securityConfig.allowedRoles && ctx.user) {
      if (!securityConfig.allowedRoles.includes(ctx.user.role)) {
        throw new ForbiddenError();
      }
    }

    // Check ownership
    if (securityConfig.ownershipCheck && resourceId && ctx.user) {
      const isOwner = await securityConfig.ownershipCheck(ctx, resourceId);
      if (!isOwner && ctx.user.role !== 'ADMIN') {
        throw new ForbiddenError('You can only modify your own resources');
      }
    }
  }

  // Handle Prisma errors consistently
  protected handlePrismaError(error: unknown): never {
    if (error instanceof GraphQLError) throw error;

    if (error instanceof Error) {
      if (error.message.includes('Unique constraint')) {
        throw new ConflictError(`A ${this.config.modelName} with this value already exists`);
      }
      if (error.message.includes('Foreign key constraint')) {
        throw new NotFoundError('Referenced record');
      }
      if (error.message.includes('Record to update not found') ||
          error.message.includes('Record to delete does not exist')) {
        throw new NotFoundError(this.config.modelName);
      }
    }
    throw error;
  }

  // Abstract methods - implement in subclass
  abstract findMany(ctx: ServiceContext, args?: unknown): Promise<T[]>;
  abstract findById(ctx: ServiceContext, id: number): Promise<T | null>;
  abstract create(ctx: ServiceContext, data: CreateInput): Promise<T>;
  abstract update(ctx: ServiceContext, id: number, data: UpdateInput): Promise<T>;
  abstract delete(ctx: ServiceContext, id: number): Promise<T>;
}

// Helper to create simple CRUD services
export function createServiceFactory<T, CreateInput, UpdateInput>(
  delegate: string,
  config: ServiceConfig<T>
) {
  return class extends BaseService<T, CreateInput, UpdateInput> {
    constructor() {
      super(config);
    }

    async findMany(ctx: ServiceContext, args?: { where?: unknown; orderBy?: unknown }): Promise<T[]> {
      await this.checkPermission(ctx, 'read');
      return (ctx.prisma as any)[delegate].findMany(args);
    }

    async findById(ctx: ServiceContext, id: number): Promise<T | null> {
      await this.checkPermission(ctx, 'read', id);
      return (ctx.prisma as any)[delegate].findUnique({ where: { id } });
    }

    async create(ctx: ServiceContext, data: CreateInput): Promise<T> {
      await this.checkPermission(ctx, 'create');

      let processedData = data;
      if (this.config.beforeCreate) {
        processedData = await this.config.beforeCreate(data, ctx) as CreateInput;
      }

      try {
        const record = await (ctx.prisma as any)[delegate].create({ data: processedData });

        if (this.config.afterCreate) {
          await this.config.afterCreate(record, ctx);
        }

        return record;
      } catch (error) {
        this.handlePrismaError(error);
      }
    }

    async update(ctx: ServiceContext, id: number, data: UpdateInput): Promise<T> {
      await this.checkPermission(ctx, 'update', id);

      let processedData = data;
      if (this.config.beforeUpdate) {
        processedData = await this.config.beforeUpdate(id, data, ctx) as UpdateInput;
      }

      try {
        const record = await (ctx.prisma as any)[delegate].update({
          where: { id },
          data: processedData,
        });

        if (this.config.afterUpdate) {
          await this.config.afterUpdate(record, ctx);
        }

        return record;
      } catch (error) {
        this.handlePrismaError(error);
      }
    }

    async delete(ctx: ServiceContext, id: number): Promise<T> {
      await this.checkPermission(ctx, 'delete', id);

      if (this.config.beforeDelete) {
        await this.config.beforeDelete(id, ctx);
      }

      try {
        const record = await (ctx.prisma as any)[delegate].delete({ where: { id } });

        if (this.config.afterDelete) {
          await this.config.afterDelete(record, ctx);
        }

        return record;
      } catch (error) {
        this.handlePrismaError(error);
      }
    }
  };
}
