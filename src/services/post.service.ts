import { Post, Media } from '../generated/prisma';
import {
  CreatePostSchema,
  UpdatePostSchema,
  CreateMediaSchema,
  CreatePostInput,
  UpdatePostInput,
  CreateMediaInput,
} from '../dto';
import { BaseService, ServiceContext, NotFoundError } from './base.service';

/**
 * Post Service - handles all post-related operations
 */
export class PostService extends BaseService {
  protected entityName = 'Post';

  /**
   * Get all posts, optionally filtered by published status
   */
  async findMany(
    ctx: ServiceContext,
    published?: boolean
  ): Promise<Post[]> {
    return ctx.prisma.post.findMany({
      where: published !== undefined ? { published } : undefined,
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Get post by ID (uses DataLoader)
   */
  async findById(ctx: ServiceContext, id: number): Promise<Post | null> {
    return ctx.loaders.post.load(id);
  }

  /**
   * Get posts by author ID (uses DataLoader)
   */
  async findByAuthor(ctx: ServiceContext, authorId: number): Promise<Post[]> {
    return ctx.loaders.postsByAuthor.load(authorId);
  }

  /**
   * Create a new post
   */
  async create(ctx: ServiceContext, input: unknown): Promise<Post> {
    const data = this.validate(CreatePostSchema, input);

    // Security: must be authenticated
    this.checkSecurity(ctx, { requireAuth: true });

    // Verify author exists
    const author = await ctx.loaders.user.load(data.authorId);
    if (!author) {
      throw new NotFoundError('Author', data.authorId);
    }

    return ctx.prisma.post.create({
      data,
      include: { author: true, media: true },
    });
  }

  /**
   * Update an existing post
   */
  async update(
    ctx: ServiceContext,
    id: number,
    input: unknown
  ): Promise<Post | null> {
    const data = this.validate(UpdatePostSchema, input);

    // Get post and check ownership
    const post = await ctx.prisma.post.findUnique({ where: { id } });
    this.ensureExists(post, id);
    this.checkSecurity(ctx, { requireAuth: true, ownerField: 'authorId' }, post as unknown as Record<string, unknown>);

    return ctx.prisma.post.update({
      where: { id },
      data,
      include: { author: true, media: true },
    });
  }

  /**
   * Delete a post
   */
  async delete(ctx: ServiceContext, id: number): Promise<Post | null> {
    const post = await ctx.prisma.post.findUnique({ where: { id } });
    this.ensureExists(post, id);
    this.checkSecurity(ctx, { requireAuth: true, ownerField: 'authorId' }, post as unknown as Record<string, unknown>);

    return ctx.prisma.post.delete({
      where: { id },
    });
  }

  /**
   * Publish or unpublish a post
   */
  async setPublished(
    ctx: ServiceContext,
    id: number,
    published: boolean
  ): Promise<Post | null> {
    const post = await ctx.prisma.post.findUnique({ where: { id } });
    this.ensureExists(post, id);
    this.checkSecurity(ctx, { requireAuth: true, ownerField: 'authorId' }, post as unknown as Record<string, unknown>);

    return ctx.prisma.post.update({
      where: { id },
      data: { published },
    });
  }

  /**
   * Add media to a post
   */
  async addMedia(
    ctx: ServiceContext,
    postId: number,
    input: unknown
  ): Promise<Media> {
    const data = this.validate(CreateMediaSchema, input);

    // Check post exists and user owns it
    const post = await ctx.prisma.post.findUnique({ where: { id: postId } });
    this.ensureExists(post, postId);
    this.checkSecurity(ctx, { requireAuth: true, ownerField: 'authorId' }, post as unknown as Record<string, unknown>);

    return ctx.prisma.media.create({
      data: {
        ...data,
        postId,
      },
    });
  }

  /**
   * Remove media from a post
   */
  async removeMedia(ctx: ServiceContext, mediaId: number): Promise<boolean> {
    const media = await ctx.prisma.media.findUnique({
      where: { id: mediaId },
    });

    if (!media) {
      throw new NotFoundError('Media', mediaId);
    }

    // Get the post to check ownership
    const post = await ctx.prisma.post.findUnique({
      where: { id: media.postId },
    });

    if (!post) {
      throw new NotFoundError('Post', media.postId);
    }

    // Check ownership through the post
    this.checkSecurity(
      ctx,
      { requireAuth: true, ownerField: 'authorId' },
      post as unknown as Record<string, unknown>
    );

    await ctx.prisma.media.delete({ where: { id: mediaId } });
    return true;
  }

  /**
   * Get author of a post (uses DataLoader)
   */
  async getAuthor(ctx: ServiceContext, authorId: number) {
    return ctx.loaders.user.load(authorId);
  }

  /**
   * Get media for a post
   */
  async getMedia(ctx: ServiceContext, postId: number): Promise<Media[]> {
    return ctx.prisma.media.findMany({
      where: { postId },
    });
  }
}
