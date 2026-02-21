import { User } from '../generated/prisma';
import {
  CreateUserSchema,
  UpdateUserSchema,
  CreateUserInput,
  UpdateUserInput,
} from '../dto';
import { BaseService, ServiceContext, NotFoundError } from './base.service';

/**
 * User Service - handles all user-related operations
 */
export class UserService extends BaseService {
  protected entityName = 'User';

  /**
   * Get all users
   */
  async findMany(ctx: ServiceContext): Promise<User[]> {
    return ctx.prisma.user.findMany({
      orderBy: { id: 'desc' },
    });
  }

  /**
   * Get user by ID (uses DataLoader for batching)
   */
  async findById(ctx: ServiceContext, id: number): Promise<User | null> {
    return ctx.loaders.user.load(id);
  }

  /**
   * Get user by email (uses DataLoader for batching)
   */
  async findByEmail(ctx: ServiceContext, email: string): Promise<User | null> {
    return ctx.loaders.userByEmail.load(email);
  }

  /**
   * Create a new user
   */
  async create(ctx: ServiceContext, input: unknown): Promise<User> {
    const data = this.validate(CreateUserSchema, input);

    // Check if email already exists
    const existing = await ctx.prisma.user.findUnique({
      where: { email: data.email },
    });
    if (existing) {
      throw new Error('Email already in use');
    }

    return ctx.prisma.user.create({ data });
  }

  /**
   * Update an existing user
   */
  async update(
    ctx: ServiceContext,
    id: number,
    input: unknown
  ): Promise<User | null> {
    const data = this.validate(UpdateUserSchema, input);

    // Security: only owner or admin can update
    const user = await this.findById(ctx, id);
    this.ensureExists(user, id);
    this.checkSecurity(ctx, { requireAuth: true, ownerField: 'id' }, { id });

    // Check email uniqueness if updating email
    if (data.email) {
      const existing = await ctx.prisma.user.findUnique({
        where: { email: data.email },
      });
      if (existing && existing.id !== id) {
        throw new Error('Email already in use');
      }
    }

    return ctx.prisma.user.update({
      where: { id },
      data,
    });
  }

  /**
   * Delete a user (admin only)
   */
  async delete(ctx: ServiceContext, id: number): Promise<User | null> {
    // Security: only admin can delete
    this.checkSecurity(ctx, { requireAuth: true, roles: ['ADMIN'] });

    const user = await this.findById(ctx, id);
    this.ensureExists(user, id);

    return ctx.prisma.user.delete({
      where: { id },
    });
  }

  /**
   * Get posts by user (uses DataLoader)
   */
  async getPosts(ctx: ServiceContext, userId: number) {
    return ctx.loaders.postsByAuthor.load(userId);
  }
}
