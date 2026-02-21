import { PrismaClient, User, Post, Site, Media } from '../generated/prisma';
import { Loaders, createLoaders } from '../loaders';
import { UserService, PostService, SiteService, ServiceContext } from '../services';

/**
 * Mediator Pattern
 *
 * Coordinates between multiple services and provides a unified API for resolvers.
 * Benefits:
 * - Decouples resolvers from services
 * - Handles cross-service operations
 * - Single point for logging, metrics, events
 * - Easy to add middleware (caching, rate limiting)
 *
 * Usage in resolver:
 *   const mediator = createMediator(ctx.prisma);
 *   return mediator.users.findById(id);
 */

export interface MediatorContext {
  prisma: PrismaClient;
  loaders: Loaders;
  user?: {
    id: number;
    email: string;
    roles: string[];
  };
}

/**
 * Main Mediator class - orchestrates all services
 */
export class Mediator {
  private ctx: ServiceContext;

  // Service instances
  public readonly users: UserService;
  public readonly posts: PostService;
  public readonly sites: SiteService;

  constructor(ctx: MediatorContext) {
    this.ctx = ctx;

    // Initialize services
    this.users = new UserService();
    this.posts = new PostService();
    this.sites = new SiteService();
  }

  // ============================================================================
  // Cross-Service Operations
  // These operations span multiple services and require coordination
  // ============================================================================

  /**
   * Create a user with their first post (example cross-service operation)
   */
  async createUserWithPost(
    userData: { email: string; name?: string },
    postData: { title: string; content?: string }
  ): Promise<{ user: User; post: Post }> {
    // Create user first
    const user = await this.users.create(this.ctx, userData);

    // Create their first post
    const post = await this.posts.create(this.ctx, {
      ...postData,
      authorId: user.id,
      published: false,
    });

    return { user, post };
  }

  /**
   * Delete a user and all their content
   * Note: In D1/SQLite, we need to delete posts one by one
   */
  async deleteUserWithContent(userId: number): Promise<{
    user: User | null;
    postsDeleted: number;
  }> {
    // Get all user's posts
    const posts = await this.ctx.prisma.post.findMany({
      where: { authorId: userId },
      select: { id: true },
    });

    // Delete posts one by one (D1 doesn't support deleteMany well)
    for (const post of posts) {
      await this.ctx.prisma.post.delete({ where: { id: post.id } });
    }

    // Delete the user
    const user = await this.users.delete(this.ctx, userId);

    return { user, postsDeleted: posts.length };
  }

  /**
   * Publish all draft posts for a user
   * Note: In D1/SQLite, we update posts one by one
   */
  async publishAllUserPosts(userId: number): Promise<number> {
    const posts = await this.ctx.prisma.post.findMany({
      where: { authorId: userId, published: false },
      select: { id: true },
    });

    for (const post of posts) {
      await this.ctx.prisma.post.update({
        where: { id: post.id },
        data: { published: true },
      });
    }

    return posts.length;
  }

  /**
   * Get user activity summary (example aggregation across services)
   * Note: D1/SQLite doesn't support count, so we fetch and count in memory
   */
  async getUserActivity(userId: number): Promise<{
    user: User | null;
    totalPosts: number;
    publishedPosts: number;
    draftPosts: number;
  }> {
    const user = await this.users.findById(this.ctx, userId);

    const allPosts = await this.ctx.prisma.post.findMany({
      where: { authorId: userId },
      select: { published: true },
    });

    const publishedPosts = allPosts.filter((p) => p.published).length;

    return {
      user,
      totalPosts: allPosts.length,
      publishedPosts,
      draftPosts: allPosts.length - publishedPosts,
    };
  }

  // ============================================================================
  // Event Hooks (extend as needed)
  // ============================================================================

  /**
   * Hook: Called after any entity is created
   * Override or extend for logging, analytics, notifications
   */
  protected onEntityCreated(entityType: string, entity: unknown): void {
    // Example: console.log(`[${entityType}] Created:`, entity);
    // In production: send to analytics, trigger webhooks, etc.
  }

  /**
   * Hook: Called after any entity is deleted
   */
  protected onEntityDeleted(entityType: string, id: number): void {
    // Example: console.log(`[${entityType}] Deleted: ${id}`);
  }
}

/**
 * Factory function to create a Mediator with context
 */
export function createMediator(prisma: PrismaClient, user?: MediatorContext['user']): Mediator {
  const loaders = createLoaders(prisma);
  return new Mediator({ prisma, loaders, user });
}

/**
 * Create service context (for direct service usage without mediator)
 */
export function createServiceContext(
  prisma: PrismaClient,
  user?: MediatorContext['user']
): ServiceContext {
  return {
    prisma,
    loaders: createLoaders(prisma),
    user,
  };
}
