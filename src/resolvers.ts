import type { PrismaClient } from './generated/prisma';
import { userService, postService, siteService, ServiceContext } from './services';

export interface Context {
  prisma: PrismaClient;
  user?: {
    id: number;
    role: 'ADMIN' | 'USER' | 'GUEST';
  };
}

// Context already matches ServiceContext
const toServiceContext = (ctx: Context): ServiceContext => ctx;

export const resolvers = {
  Query: {
    // Users
    users: (_: unknown, __: unknown, ctx: Context) =>
      userService.findMany(toServiceContext(ctx)),

    user: (_: unknown, args: { id: number }, ctx: Context) =>
      userService.findById(toServiceContext(ctx), args.id),

    userByEmail: (_: unknown, args: { email: string }, ctx: Context) =>
      userService.findByEmail(toServiceContext(ctx), args.email),

    // Posts
    posts: (_: unknown, args: { published?: boolean }, ctx: Context) =>
      postService.findMany(toServiceContext(ctx), args),

    post: (_: unknown, args: { id: number }, ctx: Context) =>
      postService.findById(toServiceContext(ctx), args.id),

    postsByAuthor: (_: unknown, args: { authorId: number }, ctx: Context) =>
      postService.findByAuthor(toServiceContext(ctx), args.authorId),

    // Sites
    sites: (_: unknown, __: unknown, ctx: Context) =>
      siteService.findMany(toServiceContext(ctx)),

    site: (_: unknown, args: { id: number }, ctx: Context) =>
      siteService.findById(toServiceContext(ctx), args.id),
  },

  Mutation: {
    // Users
    createUser: (_: unknown, args: { input: { email: string; name?: string } }, ctx: Context) =>
      userService.create(toServiceContext(ctx), args.input),

    updateUser: (_: unknown, args: { id: number; input: { email?: string; name?: string } }, ctx: Context) =>
      userService.update(toServiceContext(ctx), args.id, args.input),

    deleteUser: (_: unknown, args: { id: number }, ctx: Context) =>
      userService.delete(toServiceContext(ctx), args.id),

    // Posts
    createPost: (_: unknown, args: { input: { title: string; content?: string; published?: boolean; authorId: number } }, ctx: Context) =>
      postService.create(toServiceContext(ctx), args.input),

    updatePost: (_: unknown, args: { id: number; input: { title?: string; content?: string; published?: boolean } }, ctx: Context) =>
      postService.update(toServiceContext(ctx), args.id, args.input),

    deletePost: (_: unknown, args: { id: number }, ctx: Context) =>
      postService.delete(toServiceContext(ctx), args.id),

    publishPost: (_: unknown, args: { id: number; published: boolean }, ctx: Context) =>
      postService.publish(toServiceContext(ctx), args.id, args.published),

    // Media
    addMediaToPost: (_: unknown, args: { postId: number; input: { type: string; url: string; width?: number; height?: number; altText?: string; duration?: number; title?: string } }, ctx: Context) =>
      postService.addMedia(toServiceContext(ctx), args.postId, args.input as any),

    removeMediaFromPost: (_: unknown, args: { mediaId: number }, ctx: Context) =>
      postService.removeMedia(toServiceContext(ctx), args.mediaId),

    // Sites - nested create in one call
    createSite: (_: unknown, args: { input: { name: string; address: { street: string; city: string; zip?: string; country: string } } }, ctx: Context) =>
      siteService.create(toServiceContext(ctx), args.input),

    updateSite: (_: unknown, args: { id: number; input: { name?: string; address?: { street?: string; city?: string; zip?: string; country?: string } } }, ctx: Context) =>
      siteService.update(toServiceContext(ctx), args.id, args.input),

    deleteSite: (_: unknown, args: { id: number }, ctx: Context) =>
      siteService.delete(toServiceContext(ctx), args.id),
  },

  // Type resolvers
  User: {
    posts: (parent: { id: number }, _: unknown, ctx: Context) =>
      postService.findByAuthor(toServiceContext(ctx), parent.id),
  },

  Post: {
    author: (parent: { authorId: number }, _: unknown, ctx: Context) =>
      userService.findById(toServiceContext(ctx), parent.authorId),

    media: (parent: { id: number }, _: unknown, ctx: Context) =>
      ctx.prisma.media.findMany({ where: { postId: parent.id } }),

    createdAt: (parent: { createdAt: Date }) => parent.createdAt.toISOString(),
    updatedAt: (parent: { updatedAt: Date }) => parent.updatedAt.toISOString(),
  },

  Site: {
    address: (parent: { addressId: number; address?: unknown }, _: unknown, ctx: Context) => {
      if (parent.address) return parent.address;
      return ctx.prisma.address.findUnique({ where: { id: parent.addressId } });
    },
    createdAt: (parent: { createdAt: Date }) => parent.createdAt.toISOString(),
    updatedAt: (parent: { updatedAt: Date }) => parent.updatedAt.toISOString(),
  },

  // Media union type resolver
  Media: {
    __resolveType(media: { type: string }) {
      switch (media.type) {
        case 'IMAGE': return 'Image';
        case 'VIDEO': return 'Video';
        case 'AUDIO': return 'Audio';
        default: return null;
      }
    },
  },
};
