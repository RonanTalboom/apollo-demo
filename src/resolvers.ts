import { GraphQLError } from 'graphql';
import type { PrismaClient } from './generated/prisma';

export interface Context {
  prisma: PrismaClient;
}

// Helper for Prisma errors
function handlePrismaError(error: unknown, entity: string): never {
  if (error instanceof Error) {
    if (error.message.includes('Unique constraint')) {
      throw new GraphQLError(`A ${entity} with this value already exists`, {
        extensions: { code: 'CONFLICT' },
      });
    }
    if (error.message.includes('Foreign key constraint')) {
      throw new GraphQLError('Referenced record not found', {
        extensions: { code: 'NOT_FOUND' },
      });
    }
    if (error.message.includes('Record to update not found') ||
        error.message.includes('Record to delete does not exist')) {
      throw new GraphQLError(`${entity} not found`, {
        extensions: { code: 'NOT_FOUND' },
      });
    }
  }
  throw error;
}

export const resolvers = {
  Query: {
    // Users
    users: (_: unknown, __: unknown, ctx: Context) => {
      return ctx.prisma.user.findMany();
    },
    user: (_: unknown, args: { id: number }, ctx: Context) => {
      return ctx.prisma.user.findUnique({ where: { id: args.id } });
    },
    userByEmail: (_: unknown, args: { email: string }, ctx: Context) => {
      return ctx.prisma.user.findUnique({
        where: { email: args.email.toLowerCase().trim() }
      });
    },

    // Posts
    posts: (_: unknown, args: { published?: boolean }, ctx: Context) => {
      return ctx.prisma.post.findMany({
        where: args.published !== undefined ? { published: args.published } : undefined,
        orderBy: { createdAt: 'desc' },
      });
    },
    post: (_: unknown, args: { id: number }, ctx: Context) => {
      return ctx.prisma.post.findUnique({ where: { id: args.id } });
    },
    postsByAuthor: (_: unknown, args: { authorId: number }, ctx: Context) => {
      return ctx.prisma.post.findMany({
        where: { authorId: args.authorId },
        orderBy: { createdAt: 'desc' },
      });
    },

    // Sites
    sites: (_: unknown, __: unknown, ctx: Context) => {
      return ctx.prisma.site.findMany({
        include: { address: true },
        orderBy: { createdAt: 'desc' },
      });
    },
    site: (_: unknown, args: { id: number }, ctx: Context) => {
      return ctx.prisma.site.findUnique({
        where: { id: args.id },
        include: { address: true },
      });
    },
  },

  Mutation: {
    // Users
    createUser: async (_: unknown, args: { input: { email: string; name?: string } }, ctx: Context) => {
      try {
        return await ctx.prisma.user.create({
          data: {
            email: args.input.email.toLowerCase().trim(),
            name: args.input.name?.trim() || null,
          },
        });
      } catch (error) {
        handlePrismaError(error, 'user');
      }
    },
    updateUser: async (_: unknown, args: { id: number; input: { email?: string; name?: string } }, ctx: Context) => {
      const data: { email?: string; name?: string | null } = {};
      if (args.input.email) data.email = args.input.email.toLowerCase().trim();
      if (args.input.name !== undefined) data.name = args.input.name?.trim() || null;

      if (Object.keys(data).length === 0) {
        throw new GraphQLError('At least one field must be provided', {
          extensions: { code: 'BAD_USER_INPUT' },
        });
      }

      try {
        return await ctx.prisma.user.update({
          where: { id: args.id },
          data,
        });
      } catch (error) {
        handlePrismaError(error, 'user');
      }
    },
    deleteUser: async (_: unknown, args: { id: number }, ctx: Context) => {
      try {
        return await ctx.prisma.user.delete({ where: { id: args.id } });
      } catch (error) {
        handlePrismaError(error, 'user');
      }
    },

    // Posts
    createPost: async (_: unknown, args: { input: { title: string; content?: string; published?: boolean; authorId: number } }, ctx: Context) => {
      try {
        return await ctx.prisma.post.create({
          data: {
            title: args.input.title.trim(),
            content: args.input.content?.trim() || null,
            published: args.input.published ?? false,
            authorId: args.input.authorId,
          },
        });
      } catch (error) {
        handlePrismaError(error, 'post');
      }
    },
    updatePost: async (_: unknown, args: { id: number; input: { title?: string; content?: string; published?: boolean } }, ctx: Context) => {
      const data: { title?: string; content?: string | null; published?: boolean } = {};
      if (args.input.title) data.title = args.input.title.trim();
      if (args.input.content !== undefined) data.content = args.input.content?.trim() || null;
      if (args.input.published !== undefined) data.published = args.input.published;

      if (Object.keys(data).length === 0) {
        throw new GraphQLError('At least one field must be provided', {
          extensions: { code: 'BAD_USER_INPUT' },
        });
      }

      try {
        return await ctx.prisma.post.update({
          where: { id: args.id },
          data,
        });
      } catch (error) {
        handlePrismaError(error, 'post');
      }
    },
    deletePost: async (_: unknown, args: { id: number }, ctx: Context) => {
      try {
        return await ctx.prisma.post.delete({ where: { id: args.id } });
      } catch (error) {
        handlePrismaError(error, 'post');
      }
    },
    publishPost: async (_: unknown, args: { id: number; published: boolean }, ctx: Context) => {
      try {
        return await ctx.prisma.post.update({
          where: { id: args.id },
          data: { published: args.published },
        });
      } catch (error) {
        handlePrismaError(error, 'post');
      }
    },

    // Media
    addMediaToPost: async (_: unknown, args: { postId: number; input: { type: string; url: string; width?: number; height?: number; altText?: string; duration?: number; title?: string } }, ctx: Context) => {
      try {
        return await ctx.prisma.media.create({
          data: {
            type: args.input.type,
            url: args.input.url,
            postId: args.postId,
            width: args.input.width,
            height: args.input.height,
            altText: args.input.altText,
            duration: args.input.duration,
            title: args.input.title,
          },
        });
      } catch (error) {
        handlePrismaError(error, 'media');
      }
    },
    removeMediaFromPost: async (_: unknown, args: { mediaId: number }, ctx: Context) => {
      try {
        await ctx.prisma.media.delete({ where: { id: args.mediaId } });
        return true;
      } catch (error) {
        if (error instanceof Error && error.message.includes('Record to delete does not exist')) {
          return false;
        }
        throw error;
      }
    },

    // Sites - nested create in one call!
    createSite: async (_: unknown, args: { input: { name: string; address: { street: string; city: string; zip?: string; country: string } } }, ctx: Context) => {
      return ctx.prisma.site.create({
        data: {
          name: args.input.name.trim(),
          address: {
            create: {
              street: args.input.address.street.trim(),
              city: args.input.address.city.trim(),
              zip: args.input.address.zip?.trim() || null,
              country: args.input.address.country.trim(),
            },
          },
        },
        include: { address: true },
      });
    },
    updateSite: async (_: unknown, args: { id: number; input: { name?: string; address?: { street?: string; city?: string; zip?: string; country?: string } } }, ctx: Context) => {
      const siteData: { name?: string } = {};
      if (args.input.name) siteData.name = args.input.name.trim();

      const addressData: { street?: string; city?: string; zip?: string | null; country?: string } = {};
      if (args.input.address) {
        if (args.input.address.street) addressData.street = args.input.address.street.trim();
        if (args.input.address.city) addressData.city = args.input.address.city.trim();
        if (args.input.address.zip !== undefined) addressData.zip = args.input.address.zip?.trim() || null;
        if (args.input.address.country) addressData.country = args.input.address.country.trim();
      }

      const hasAddressUpdate = Object.keys(addressData).length > 0;
      const hasSiteUpdate = Object.keys(siteData).length > 0;

      if (!hasSiteUpdate && !hasAddressUpdate) {
        throw new GraphQLError('At least one field must be provided', {
          extensions: { code: 'BAD_USER_INPUT' },
        });
      }

      try {
        return await ctx.prisma.site.update({
          where: { id: args.id },
          data: {
            ...siteData,
            ...(hasAddressUpdate && { address: { update: addressData } }),
          },
          include: { address: true },
        });
      } catch (error) {
        handlePrismaError(error, 'site');
      }
    },
    deleteSite: async (_: unknown, args: { id: number }, ctx: Context) => {
      try {
        return await ctx.prisma.site.delete({
          where: { id: args.id },
          include: { address: true },
        });
      } catch (error) {
        handlePrismaError(error, 'site');
      }
    },
  },

  // Type resolvers
  User: {
    posts: (parent: { id: number }, _: unknown, ctx: Context) => {
      return ctx.prisma.post.findMany({
        where: { authorId: parent.id },
        orderBy: { createdAt: 'desc' },
      });
    },
  },

  Post: {
    author: (parent: { authorId: number }, _: unknown, ctx: Context) => {
      return ctx.prisma.user.findUnique({ where: { id: parent.authorId } });
    },
    media: async (parent: { id: number }, _: unknown, ctx: Context) => {
      return ctx.prisma.media.findMany({ where: { postId: parent.id } });
    },
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
