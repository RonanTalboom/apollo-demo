import { BaseService, ServiceContext, ValidationError } from './base.service';
import type { Post, Media, User } from '../generated/prisma';

interface CreatePostInput {
  title: string;
  content?: string;
  published?: boolean;
  authorId: number;
}

interface UpdatePostInput {
  title?: string;
  content?: string;
  published?: boolean;
}

interface CreateMediaInput {
  type: 'IMAGE' | 'VIDEO' | 'AUDIO';
  url: string;
  width?: number;
  height?: number;
  altText?: string;
  duration?: number;
  title?: string;
}

interface PostWithRelations extends Post {
  author?: User;
  media?: Media[];
}

class PostService extends BaseService<PostWithRelations, CreatePostInput, UpdatePostInput> {
  constructor() {
    super({
      modelName: 'Post',
      security: {
        read: {}, // Public read
        create: {
          requireAuth: true,
        },
        update: {
          requireAuth: true,
          ownershipCheck: async (ctx, resourceId) => {
            const post = await ctx.prisma.post.findUnique({ where: { id: resourceId } });
            return post?.authorId === ctx.user?.id;
          },
        },
        delete: {
          requireAuth: true,
          ownershipCheck: async (ctx, resourceId) => {
            const post = await ctx.prisma.post.findUnique({ where: { id: resourceId } });
            return post?.authorId === ctx.user?.id;
          },
        },
      },
    });
  }

  async findMany(ctx: ServiceContext, args?: { published?: boolean }): Promise<Post[]> {
    await this.checkPermission(ctx, 'read');
    return ctx.prisma.post.findMany({
      where: args?.published !== undefined ? { published: args.published } : undefined,
      orderBy: { createdAt: 'desc' },
    });
  }

  async findById(ctx: ServiceContext, id: number): Promise<Post | null> {
    await this.checkPermission(ctx, 'read', id);
    return ctx.prisma.post.findUnique({ where: { id } });
  }

  async findByAuthor(ctx: ServiceContext, authorId: number): Promise<Post[]> {
    await this.checkPermission(ctx, 'read');
    return ctx.prisma.post.findMany({
      where: { authorId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async create(ctx: ServiceContext, data: CreatePostInput): Promise<Post> {
    await this.checkPermission(ctx, 'create');

    if (!data.title?.trim()) {
      throw new ValidationError('Title is required', 'title');
    }

    try {
      return await ctx.prisma.post.create({
        data: {
          title: data.title.trim(),
          content: data.content?.trim() || null,
          published: data.published ?? false,
          authorId: data.authorId,
        },
      });
    } catch (error) {
      this.handlePrismaError(error);
    }
  }

  async update(ctx: ServiceContext, id: number, data: UpdatePostInput): Promise<Post> {
    await this.checkPermission(ctx, 'update', id);

    const updateData: { title?: string; content?: string | null; published?: boolean } = {};
    if (data.title) updateData.title = data.title.trim();
    if (data.content !== undefined) updateData.content = data.content?.trim() || null;
    if (data.published !== undefined) updateData.published = data.published;

    if (Object.keys(updateData).length === 0) {
      throw new ValidationError('At least one field must be provided');
    }

    try {
      return await ctx.prisma.post.update({
        where: { id },
        data: updateData,
      });
    } catch (error) {
      this.handlePrismaError(error);
    }
  }

  async delete(ctx: ServiceContext, id: number): Promise<Post> {
    await this.checkPermission(ctx, 'delete', id);

    try {
      return await ctx.prisma.post.delete({ where: { id } });
    } catch (error) {
      this.handlePrismaError(error);
    }
  }

  async publish(ctx: ServiceContext, id: number, published: boolean): Promise<Post> {
    await this.checkPermission(ctx, 'update', id);

    try {
      return await ctx.prisma.post.update({
        where: { id },
        data: { published },
      });
    } catch (error) {
      this.handlePrismaError(error);
    }
  }

  // Media operations
  async addMedia(ctx: ServiceContext, postId: number, data: CreateMediaInput): Promise<Media> {
    await this.checkPermission(ctx, 'update', postId);

    if (!data.url?.trim()) {
      throw new ValidationError('URL is required', 'url');
    }

    try {
      return await ctx.prisma.media.create({
        data: {
          type: data.type,
          url: data.url.trim(),
          postId,
          width: data.width,
          height: data.height,
          altText: data.altText?.trim(),
          duration: data.duration,
          title: data.title?.trim(),
        },
      });
    } catch (error) {
      this.handlePrismaError(error);
    }
  }

  async removeMedia(ctx: ServiceContext, mediaId: number): Promise<boolean> {
    // Find media to check post ownership
    const media = await ctx.prisma.media.findUnique({ where: { id: mediaId } });
    if (!media) return false;

    await this.checkPermission(ctx, 'update', media.postId);

    try {
      await ctx.prisma.media.delete({ where: { id: mediaId } });
      return true;
    } catch (error) {
      if (error instanceof Error && error.message.includes('Record to delete')) {
        return false;
      }
      throw error;
    }
  }
}

export const postService = new PostService();
