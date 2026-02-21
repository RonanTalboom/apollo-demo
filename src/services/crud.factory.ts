import { GraphQLError } from 'graphql';
import type { PrismaClient } from '../generated/prisma';

// ============================================================================
// TYPES
// ============================================================================

export interface ServiceContext {
  prisma: PrismaClient;
  user?: {
    id: number;
    role: 'ADMIN' | 'USER' | 'GUEST';
  };
}

type Permission = 'read' | 'create' | 'update' | 'delete';

interface SecurityRule {
  requireAuth?: boolean;
  roles?: Array<'ADMIN' | 'USER' | 'GUEST'>;
  ownerField?: string; // e.g., 'authorId' - checks if ctx.user.id === record[ownerField]
}

type SecurityConfig = Partial<Record<Permission, SecurityRule>>;

// ============================================================================
// ERRORS
// ============================================================================

export class NotFoundError extends GraphQLError {
  constructor(entity: string) {
    super(`${entity} not found`, { extensions: { code: 'NOT_FOUND' } });
  }
}

export class UnauthorizedError extends GraphQLError {
  constructor() {
    super('Authentication required', { extensions: { code: 'UNAUTHORIZED' } });
  }
}

export class ForbiddenError extends GraphQLError {
  constructor(message = 'Permission denied') {
    super(message, { extensions: { code: 'FORBIDDEN' } });
  }
}

export class ValidationError extends GraphQLError {
  constructor(message: string, field?: string) {
    super(message, { extensions: { code: 'BAD_USER_INPUT', field } });
  }
}

// ============================================================================
// GENERIC CRUD SERVICE FACTORY
// ============================================================================

interface CrudServiceConfig<TCreate, TUpdate> {
  modelName: string;
  displayName?: string;
  security?: SecurityConfig;
  include?: Record<string, boolean>;
  orderBy?: Record<string, 'asc' | 'desc'>;
  validate?: {
    create?: (data: TCreate) => void;
    update?: (data: TUpdate) => void;
  };
  transform?: {
    create?: (data: TCreate) => object;
    update?: (data: TUpdate) => object;
  };
}

export function createCrudService<T, TCreate, TUpdate>(
  config: CrudServiceConfig<TCreate, TUpdate>
) {
  const {
    modelName,
    displayName = modelName,
    security = {},
    include,
    orderBy,
    validate,
    transform,
  } = config;

  const getDelegate = (ctx: ServiceContext) => (ctx.prisma as any)[modelName];

  const checkPermission = async (
    ctx: ServiceContext,
    permission: Permission,
    record?: any
  ): Promise<void> => {
    const rule = security[permission];
    if (!rule) return;

    if (rule.requireAuth && !ctx.user) {
      throw new UnauthorizedError();
    }

    if (rule.roles && ctx.user && !rule.roles.includes(ctx.user.role)) {
      throw new ForbiddenError();
    }

    if (rule.ownerField && record && ctx.user) {
      if (record[rule.ownerField] !== ctx.user.id && ctx.user.role !== 'ADMIN') {
        throw new ForbiddenError('You can only modify your own resources');
      }
    }
  };

  const handleError = (error: unknown): never => {
    if (error instanceof GraphQLError) throw error;

    if (error instanceof Error) {
      if (error.message.includes('Unique constraint')) {
        throw new GraphQLError(`${displayName} already exists`, {
          extensions: { code: 'CONFLICT' },
        });
      }
      if (error.message.includes('Foreign key')) {
        throw new NotFoundError('Referenced record');
      }
      if (error.message.includes('Record to update not found') ||
          error.message.includes('Record to delete does not exist')) {
        throw new NotFoundError(displayName);
      }
    }
    throw error;
  };

  return {
    async findMany(ctx: ServiceContext, where?: object): Promise<T[]> {
      await checkPermission(ctx, 'read');
      return getDelegate(ctx).findMany({ where, include, orderBy });
    },

    async findById(ctx: ServiceContext, id: number): Promise<T | null> {
      await checkPermission(ctx, 'read');
      return getDelegate(ctx).findUnique({ where: { id }, include });
    },

    async findOne(ctx: ServiceContext, where: object): Promise<T | null> {
      await checkPermission(ctx, 'read');
      return getDelegate(ctx).findUnique({ where, include });
    },

    async create(ctx: ServiceContext, data: TCreate): Promise<T> {
      await checkPermission(ctx, 'create');
      if (validate?.create) validate.create(data);
      const finalData = transform?.create ? transform.create(data) : data;

      try {
        return await getDelegate(ctx).create({ data: finalData, include });
      } catch (error) {
        return handleError(error);
      }
    },

    async update(ctx: ServiceContext, id: number, data: TUpdate): Promise<T> {
      const existing = await getDelegate(ctx).findUnique({ where: { id } });
      if (!existing) throw new NotFoundError(displayName);

      await checkPermission(ctx, 'update', existing);
      if (validate?.update) validate.update(data);
      const finalData = transform?.update ? transform.update(data) : data;

      try {
        return await getDelegate(ctx).update({ where: { id }, data: finalData, include });
      } catch (error) {
        return handleError(error);
      }
    },

    async delete(ctx: ServiceContext, id: number): Promise<T> {
      const existing = await getDelegate(ctx).findUnique({ where: { id } });
      if (!existing) throw new NotFoundError(displayName);

      await checkPermission(ctx, 'delete', existing);

      try {
        return await getDelegate(ctx).delete({ where: { id }, include });
      } catch (error) {
        return handleError(error);
      }
    },

    checkPermission,
    handleError,
    getDelegate,
  };
}

// ============================================================================
// NESTED CREATE SERVICE (for Site + Address pattern)
// ============================================================================

interface NestedCreateConfig<TParentCreate, TChildCreate> {
  parentModel: string;
  childField: string;
  displayName?: string;
  security?: SecurityConfig;
  include?: Record<string, boolean>;
  validate?: {
    parent?: (data: TParentCreate) => void;
    child?: (data: TChildCreate) => void;
  };
  transform?: {
    parent?: (data: TParentCreate) => object;
    child?: (data: TChildCreate) => object;
  };
}

export function createNestedService<TParent, TChild, TParentCreate, TChildCreate>(
  config: NestedCreateConfig<TParentCreate, TChildCreate>
) {
  const {
    parentModel,
    childField,
    displayName = parentModel,
    security = {},
    include = { [childField]: true },
    validate,
    transform,
  } = config;

  const getDelegate = (ctx: ServiceContext) => (ctx.prisma as any)[parentModel];

  const checkPermission = async (ctx: ServiceContext, permission: Permission) => {
    const rule = security[permission];
    if (!rule) return;
    if (rule.requireAuth && !ctx.user) throw new UnauthorizedError();
    if (rule.roles && ctx.user && !rule.roles.includes(ctx.user.role)) {
      throw new ForbiddenError();
    }
  };

  const handleError = (error: unknown): never => {
    if (error instanceof GraphQLError) throw error;
    if (error instanceof Error && error.message.includes('Record to update not found')) {
      throw new NotFoundError(displayName);
    }
    throw error;
  };

  return {
    async findMany(ctx: ServiceContext): Promise<TParent[]> {
      await checkPermission(ctx, 'read');
      return getDelegate(ctx).findMany({ include, orderBy: { createdAt: 'desc' } });
    },

    async findById(ctx: ServiceContext, id: number): Promise<TParent | null> {
      await checkPermission(ctx, 'read');
      return getDelegate(ctx).findUnique({ where: { id }, include });
    },

    async create(
      ctx: ServiceContext,
      parentData: TParentCreate,
      childData: TChildCreate
    ): Promise<TParent> {
      await checkPermission(ctx, 'create');

      if (validate?.parent) validate.parent(parentData);
      if (validate?.child) validate.child(childData);

      const finalParent = transform?.parent ? transform.parent(parentData) : parentData;
      const finalChild = transform?.child ? transform.child(childData) : childData;

      try {
        return await getDelegate(ctx).create({
          data: {
            ...(finalParent as object),
            [childField]: { create: finalChild },
          },
          include,
        });
      } catch (error) {
        return handleError(error);
      }
    },

    async update(
      ctx: ServiceContext,
      id: number,
      parentData?: Partial<TParentCreate>,
      childData?: Partial<TChildCreate>
    ): Promise<TParent> {
      await checkPermission(ctx, 'update');

      const updateData: Record<string, unknown> = {};
      if (parentData) Object.assign(updateData, parentData);
      if (childData && Object.keys(childData).length > 0) {
        updateData[childField] = { update: childData };
      }

      try {
        return await getDelegate(ctx).update({ where: { id }, data: updateData, include });
      } catch (error) {
        return handleError(error);
      }
    },

    async delete(ctx: ServiceContext, id: number): Promise<TParent> {
      await checkPermission(ctx, 'delete');

      try {
        return await getDelegate(ctx).delete({ where: { id }, include });
      } catch (error) {
        return handleError(error);
      }
    },
  };
}
