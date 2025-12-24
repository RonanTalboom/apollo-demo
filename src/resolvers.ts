import type { PrismaClient } from './generated/prisma';
import { userService, postService, siteService, ServiceContext } from './services';

export interface Context {
  prisma: PrismaClient;
  user?: {
    id: number;
    role: 'ADMIN' | 'USER' | 'GUEST';
  };
}

export const resolvers = {
  Query: {
    // Users
    users: (_: unknown, __: unknown, ctx: Context) => userService.findMany(ctx),
    user: (_: unknown, { id }: { id: number }, ctx: Context) => userService.findById(ctx, id),
    userByEmail: (_: unknown, { email }: { email: string }, ctx: Context) =>
      userService.findOne(ctx, { email: email.toLowerCase().trim() }),

    // Posts
    posts: (_: unknown, { published }: { published?: boolean }, ctx: Context) =>
      postService.findMany(ctx, published !== undefined ? { published } : undefined),
    post: (_: unknown, { id }: { id: number }, ctx: Context) => postService.findById(ctx, id),
    postsByAuthor: (_: unknown, { authorId }: { authorId: number }, ctx: Context) =>
      postService.findByAuthor(ctx, authorId),

    // Sites
    sites: (_: unknown, __: unknown, ctx: Context) => siteService.findMany(ctx),
    site: (_: unknown, { id }: { id: number }, ctx: Context) => siteService.findById(ctx, id),
  },

  Mutation: {
    // Users
    createUser: (_: unknown, { input }: { input: any }, ctx: Context) =>
      userService.create(ctx, input),
    updateUser: (_: unknown, { id, input }: { id: number; input: any }, ctx: Context) =>
      userService.update(ctx, id, input),
    deleteUser: (_: unknown, { id }: { id: number }, ctx: Context) =>
      userService.delete(ctx, id),

    // Posts
    createPost: (_: unknown, { input }: { input: any }, ctx: Context) =>
      postService.create(ctx, input),
    updatePost: (_: unknown, { id, input }: { id: number; input: any }, ctx: Context) =>
      postService.update(ctx, id, input),
    deletePost: (_: unknown, { id }: { id: number }, ctx: Context) =>
      postService.delete(ctx, id),
    publishPost: (_: unknown, { id, published }: { id: number; published: boolean }, ctx: Context) =>
      postService.publish(ctx, id, published),

    // Media
    addMediaToPost: (_: unknown, { postId, input }: { postId: number; input: any }, ctx: Context) =>
      postService.addMedia(ctx, postId, input),
    removeMediaFromPost: (_: unknown, { mediaId }: { mediaId: number }, ctx: Context) =>
      postService.removeMedia(ctx, mediaId),

    // Sites - nested create
    createSite: (_: unknown, { input }: { input: { name: string; address: any } }, ctx: Context) =>
      siteService.create(ctx, { name: input.name }, input.address),
    updateSite: (_: unknown, { id, input }: { id: number; input: { name?: string; address?: any } }, ctx: Context) =>
      siteService.update(ctx, id, input.name ? { name: input.name } : undefined, input.address),
    deleteSite: (_: unknown, { id }: { id: number }, ctx: Context) =>
      siteService.delete(ctx, id),
  },

  // Type resolvers
  User: {
    posts: (parent: { id: number }, _: unknown, ctx: Context) =>
      postService.findByAuthor(ctx, parent.id),
  },

  Post: {
    author: (parent: { authorId: number }, _: unknown, ctx: Context) =>
      userService.findById(ctx, parent.authorId),
    media: (parent: { id: number }, _: unknown, ctx: Context) =>
      ctx.prisma.media.findMany({ where: { postId: parent.id } }),
    createdAt: (parent: { createdAt: Date }) => parent.createdAt.toISOString(),
    updatedAt: (parent: { updatedAt: Date }) => parent.updatedAt.toISOString(),
  },

  Site: {
    address: (parent: { addressId: number; address?: unknown }, _: unknown, ctx: Context) =>
      parent.address || ctx.prisma.address.findUnique({ where: { id: parent.addressId } }),
    createdAt: (parent: { createdAt: Date }) => parent.createdAt.toISOString(),
    updatedAt: (parent: { updatedAt: Date }) => parent.updatedAt.toISOString(),
  },

  Media: {
    __resolveType: (media: { type: string }) => {
      switch (media.type) {
        case 'IMAGE': return 'Image';
        case 'VIDEO': return 'Video';
        case 'AUDIO': return 'Audio';
        default: return null;
      }
    },
  },
};
