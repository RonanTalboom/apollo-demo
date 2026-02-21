import type { PrismaClient } from './generated/prisma';
import { Loaders } from './loaders';
import { Mediator, createMediator, createServiceContext } from './mediator';
import { UserService, PostService, SiteService, ServiceContext } from './services';

/**
 * GraphQL Context - passed to every resolver
 */
export interface Context {
  prisma: PrismaClient;
  loaders: Loaders;
  user?: {
    id: number;
    email: string;
    roles: string[];
  };
  // Services instantiated per-request
  services: {
    users: UserService;
    posts: PostService;
    sites: SiteService;
  };
  // Mediator for cross-service operations
  mediator: Mediator;
}

/**
 * Helper to get service context from GraphQL context
 */
const getServiceCtx = (ctx: Context): ServiceContext => ({
  prisma: ctx.prisma,
  loaders: ctx.loaders,
  user: ctx.user,
});

export const resolvers = {
  Query: {
    // Users
    users: (_: unknown, __: unknown, ctx: Context) =>
      ctx.services.users.findMany(getServiceCtx(ctx)),

    user: (_: unknown, { id }: { id: number }, ctx: Context) =>
      ctx.services.users.findById(getServiceCtx(ctx), id),

    userByEmail: (_: unknown, { email }: { email: string }, ctx: Context) =>
      ctx.services.users.findByEmail(getServiceCtx(ctx), email),

    // Posts
    posts: (_: unknown, { published }: { published?: boolean }, ctx: Context) =>
      ctx.services.posts.findMany(getServiceCtx(ctx), published),

    post: (_: unknown, { id }: { id: number }, ctx: Context) =>
      ctx.services.posts.findById(getServiceCtx(ctx), id),

    postsByAuthor: (_: unknown, { authorId }: { authorId: number }, ctx: Context) =>
      ctx.services.posts.findByAuthor(getServiceCtx(ctx), authorId),

    // Sites
    sites: (_: unknown, __: unknown, ctx: Context) =>
      ctx.services.sites.findMany(getServiceCtx(ctx)),

    site: (_: unknown, { id }: { id: number }, ctx: Context) =>
      ctx.services.sites.findById(getServiceCtx(ctx), id),
  },

  Mutation: {
    // Users
    createUser: (_: unknown, { input }: { input: unknown }, ctx: Context) =>
      ctx.services.users.create(getServiceCtx(ctx), input),

    updateUser: (_: unknown, { id, input }: { id: number; input: unknown }, ctx: Context) =>
      ctx.services.users.update(getServiceCtx(ctx), id, input),

    deleteUser: (_: unknown, { id }: { id: number }, ctx: Context) =>
      ctx.services.users.delete(getServiceCtx(ctx), id),

    // Posts
    createPost: (_: unknown, { input }: { input: unknown }, ctx: Context) =>
      ctx.services.posts.create(getServiceCtx(ctx), input),

    updatePost: (_: unknown, { id, input }: { id: number; input: unknown }, ctx: Context) =>
      ctx.services.posts.update(getServiceCtx(ctx), id, input),

    deletePost: (_: unknown, { id }: { id: number }, ctx: Context) =>
      ctx.services.posts.delete(getServiceCtx(ctx), id),

    publishPost: (_: unknown, { id, published }: { id: number; published: boolean }, ctx: Context) =>
      ctx.services.posts.setPublished(getServiceCtx(ctx), id, published),

    // Media
    addMediaToPost: (_: unknown, { postId, input }: { postId: number; input: unknown }, ctx: Context) =>
      ctx.services.posts.addMedia(getServiceCtx(ctx), postId, input),

    removeMediaFromPost: (_: unknown, { mediaId }: { mediaId: number }, ctx: Context) =>
      ctx.services.posts.removeMedia(getServiceCtx(ctx), mediaId),

    // Sites - nested create
    createSite: (_: unknown, { input }: { input: unknown }, ctx: Context) =>
      ctx.services.sites.create(getServiceCtx(ctx), input),

    updateSite: (_: unknown, { id, input }: { id: number; input: unknown }, ctx: Context) =>
      ctx.services.sites.update(getServiceCtx(ctx), id, input),

    deleteSite: (_: unknown, { id }: { id: number }, ctx: Context) =>
      ctx.services.sites.delete(getServiceCtx(ctx), id),
  },

  // ============================================================================
  // Type Resolvers - Use DataLoader for batching
  // ============================================================================

  User: {
    posts: (parent: { id: number }, _: unknown, ctx: Context) =>
      ctx.loaders.postsByAuthor.load(parent.id),
  },

  Post: {
    author: (parent: { authorId: number }, _: unknown, ctx: Context) =>
      ctx.loaders.user.load(parent.authorId),

    media: (parent: { id: number }, _: unknown, ctx: Context) =>
      ctx.services.posts.getMedia(getServiceCtx(ctx), parent.id),

    createdAt: (parent: { createdAt: Date }) => parent.createdAt.toISOString(),
    updatedAt: (parent: { updatedAt: Date }) => parent.updatedAt.toISOString(),
  },

  Site: {
    address: (parent: { addressId: number; address?: unknown }, _: unknown, ctx: Context) =>
      parent.address || ctx.loaders.address.load(parent.addressId),

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
