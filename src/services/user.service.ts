import { BaseService, ServiceContext, ValidationError } from './base.service';
import type { User } from '../generated/prisma';

interface CreateUserInput {
  email: string;
  name?: string;
}

interface UpdateUserInput {
  email?: string;
  name?: string;
}

class UserService extends BaseService<User, CreateUserInput, UpdateUserInput> {
  constructor() {
    super({
      modelName: 'User',
      security: {
        read: {}, // Public read
        create: {}, // Public create (registration)
        update: {
          requireAuth: true,
          ownershipCheck: async (ctx, resourceId) => ctx.user?.id === resourceId,
        },
        delete: {
          requireAuth: true,
          allowedRoles: ['ADMIN'],
        },
      },
    });
  }

  async findMany(ctx: ServiceContext): Promise<User[]> {
    await this.checkPermission(ctx, 'read');
    return ctx.prisma.user.findMany();
  }

  async findById(ctx: ServiceContext, id: number): Promise<User | null> {
    await this.checkPermission(ctx, 'read', id);
    return ctx.prisma.user.findUnique({ where: { id } });
  }

  async findByEmail(ctx: ServiceContext, email: string): Promise<User | null> {
    await this.checkPermission(ctx, 'read');
    return ctx.prisma.user.findUnique({
      where: { email: email.toLowerCase().trim() },
    });
  }

  async create(ctx: ServiceContext, data: CreateUserInput): Promise<User> {
    await this.checkPermission(ctx, 'create');

    // Validate email format
    if (!data.email || !data.email.includes('@')) {
      throw new ValidationError('Invalid email format', 'email');
    }

    const processedData = {
      email: data.email.toLowerCase().trim(),
      name: data.name?.trim() || null,
    };

    try {
      return await ctx.prisma.user.create({ data: processedData });
    } catch (error) {
      this.handlePrismaError(error);
    }
  }

  async update(ctx: ServiceContext, id: number, data: UpdateUserInput): Promise<User> {
    await this.checkPermission(ctx, 'update', id);

    const updateData: { email?: string; name?: string | null } = {};
    if (data.email) updateData.email = data.email.toLowerCase().trim();
    if (data.name !== undefined) updateData.name = data.name?.trim() || null;

    if (Object.keys(updateData).length === 0) {
      throw new ValidationError('At least one field must be provided');
    }

    try {
      return await ctx.prisma.user.update({
        where: { id },
        data: updateData,
      });
    } catch (error) {
      this.handlePrismaError(error);
    }
  }

  async delete(ctx: ServiceContext, id: number): Promise<User> {
    await this.checkPermission(ctx, 'delete', id);

    try {
      return await ctx.prisma.user.delete({ where: { id } });
    } catch (error) {
      this.handlePrismaError(error);
    }
  }
}

export const userService = new UserService();
