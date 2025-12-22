import { z } from 'zod';
import { GraphQLError } from 'graphql';
import { builder } from '../builder';
import { UserType, UserData } from './user';

// Zod validation schemas
const titleSchema = z.string().min(1, 'Title is required').max(200, 'Title must be less than 200 characters');
const contentSchema = z.string().max(10000, 'Content must be less than 10000 characters').nullish();
const urlSchema = z.string().url('Invalid URL format');
const idSchema = z.number().int().positive('ID must be a positive integer');

// Media type enum
const MediaTypeEnum = builder.enumType('MediaType', {
  values: ['IMAGE', 'VIDEO', 'AUDIO'] as const,
});

// Base media interface
interface BaseMedia {
  id: number;
  type: 'IMAGE' | 'VIDEO' | 'AUDIO';
  url: string;
  postId: number;
}

interface ImageMedia extends BaseMedia {
  type: 'IMAGE';
  width: number | null;
  height: number | null;
  altText: string | null;
}

interface VideoMedia extends BaseMedia {
  type: 'VIDEO';
  duration: number | null;
}

interface AudioMedia extends BaseMedia {
  type: 'AUDIO';
  title: string | null;
  duration: number | null;
}

type MediaUnion = ImageMedia | VideoMedia | AudioMedia;

// Define Image type
const ImageType = builder.objectRef<ImageMedia>('Image');
builder.objectType(ImageType, {
  description: 'An image media type',
  fields: (t) => ({
    id: t.exposeInt('id'),
    url: t.exposeString('url'),
    width: t.exposeInt('width', { nullable: true }),
    height: t.exposeInt('height', { nullable: true }),
    altText: t.exposeString('altText', { nullable: true }),
  }),
});

// Define Video type
const VideoType = builder.objectRef<VideoMedia>('Video');
builder.objectType(VideoType, {
  description: 'A video media type',
  fields: (t) => ({
    id: t.exposeInt('id'),
    url: t.exposeString('url'),
    duration: t.exposeInt('duration', { nullable: true, description: 'Duration in seconds' }),
  }),
});

// Define Audio type
const AudioType = builder.objectRef<AudioMedia>('Audio');
builder.objectType(AudioType, {
  description: 'An audio media type',
  fields: (t) => ({
    id: t.exposeInt('id'),
    url: t.exposeString('url'),
    title: t.exposeString('title', { nullable: true }),
    duration: t.exposeInt('duration', { nullable: true, description: 'Duration in seconds' }),
  }),
});

// Media union type
const MediaUnionType = builder.unionType('Media', {
  types: [ImageType, VideoType, AudioType],
  resolveType: (media) => {
    switch (media.type) {
      case 'IMAGE':
        return ImageType;
      case 'VIDEO':
        return VideoType;
      case 'AUDIO':
        return AudioType;
    }
  },
});

// Post data type
export interface PostData {
  id: number;
  title: string;
  content: string | null;
  published: boolean;
  authorId: number;
  createdAt: Date;
  updatedAt: Date;
}

// Post type - exported for use in user schema
export const PostType = builder.objectRef<PostData>('Post');

builder.objectType(PostType, {
  description: 'A blog post',
  fields: (t) => ({
    id: t.exposeInt('id'),
    title: t.exposeString('title'),
    content: t.exposeString('content', { nullable: true }),
    published: t.exposeBoolean('published'),
    createdAt: t.field({
      type: 'String',
      resolve: (post) => post.createdAt.toISOString(),
    }),
    updatedAt: t.field({
      type: 'String',
      resolve: (post) => post.updatedAt.toISOString(),
    }),
    author: t.field({
      type: UserType,
      resolve: async (post, _args, ctx) => {
        const user = await ctx.prisma.user.findUnique({
          where: { id: post.authorId },
        });
        if (!user) throw new GraphQLError('Author not found');
        return user as UserData;
      },
    }),
    media: t.field({
      type: [MediaUnionType],
      resolve: async (post, _args, ctx) => {
        const mediaItems = await ctx.prisma.media.findMany({
          where: { postId: post.id },
        });
        return mediaItems.map((m) => ({
          ...m,
          type: m.type as 'IMAGE' | 'VIDEO' | 'AUDIO',
        }));
      },
    }),
  }),
});

// Input types
const CreatePostInput = builder.inputType('CreatePostInput', {
  fields: (t) => ({
    title: t.string({ required: true, validate: titleSchema }),
    content: t.string({ required: false, validate: contentSchema }),
    published: t.boolean({ required: false }),
    authorId: t.int({ required: true, validate: idSchema }),
  }),
});

const UpdatePostInput = builder.inputType('UpdatePostInput', {
  fields: (t) => ({
    title: t.string({ required: false, validate: titleSchema.optional() }),
    content: t.string({ required: false, validate: contentSchema }),
    published: t.boolean({ required: false }),
  }),
});

const CreateMediaInput = builder.inputType('CreateMediaInput', {
  fields: (t) => ({
    type: t.field({ type: MediaTypeEnum, required: true }),
    url: t.string({ required: true, validate: urlSchema }),
    // Image fields
    width: t.int({ required: false }),
    height: t.int({ required: false }),
    altText: t.string({ required: false }),
    // Video/Audio fields
    duration: t.int({ required: false }),
    // Audio fields
    title: t.string({ required: false }),
  }),
});

// Helper for Prisma errors
function handlePrismaError(error: unknown): never {
  if (error instanceof Error) {
    if (error.message.includes('Foreign key constraint')) {
      throw new GraphQLError('Referenced record not found', {
        extensions: { code: 'NOT_FOUND' },
      });
    }
    if (error.message.includes('Record to update not found') ||
        error.message.includes('Record to delete does not exist')) {
      throw new GraphQLError('Post not found', {
        extensions: { code: 'NOT_FOUND' },
      });
    }
  }
  throw error;
}

// Queries
builder.queryField('posts', (t) =>
  t.field({
    type: [PostType],
    description: 'Get all posts',
    args: {
      published: t.arg.boolean({ required: false }),
    },
    resolve: async (_parent, args, ctx) => {
      return ctx.prisma.post.findMany({
        where: args.published !== null ? { published: args.published } : undefined,
        orderBy: { createdAt: 'desc' },
      });
    },
  })
);

builder.queryField('post', (t) =>
  t.field({
    type: PostType,
    nullable: true,
    description: 'Get a post by ID',
    args: {
      id: t.arg.int({ required: true, validate: idSchema }),
    },
    resolve: async (_parent, args, ctx) => {
      return ctx.prisma.post.findUnique({
        where: { id: args.id },
      });
    },
  })
);

builder.queryField('postsByAuthor', (t) =>
  t.field({
    type: [PostType],
    description: 'Get posts by author ID',
    args: {
      authorId: t.arg.int({ required: true, validate: idSchema }),
    },
    resolve: async (_parent, args, ctx) => {
      return ctx.prisma.post.findMany({
        where: { authorId: args.authorId },
        orderBy: { createdAt: 'desc' },
      });
    },
  })
);

// Mutations
builder.mutationField('createPost', (t) =>
  t.field({
    type: PostType,
    description: 'Create a new post',
    args: {
      input: t.arg({ type: CreatePostInput, required: true }),
    },
    resolve: async (_parent, args, ctx) => {
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
        handlePrismaError(error);
      }
    },
  })
);

builder.mutationField('updatePost', (t) =>
  t.field({
    type: PostType,
    nullable: true,
    description: 'Update an existing post',
    args: {
      id: t.arg.int({ required: true, validate: idSchema }),
      input: t.arg({ type: UpdatePostInput, required: true }),
    },
    resolve: async (_parent, args, ctx) => {
      const data: { title?: string; content?: string | null; published?: boolean } = {};

      if (args.input.title !== undefined && args.input.title !== null) {
        data.title = args.input.title.trim();
      }
      if (args.input.content !== undefined) {
        data.content = args.input.content?.trim() || null;
      }
      if (args.input.published !== undefined && args.input.published !== null) {
        data.published = args.input.published;
      }

      if (Object.keys(data).length === 0) {
        throw new GraphQLError('At least one field must be provided for update', {
          extensions: { code: 'BAD_USER_INPUT' },
        });
      }

      try {
        return await ctx.prisma.post.update({
          where: { id: args.id },
          data,
        });
      } catch (error) {
        handlePrismaError(error);
      }
    },
  })
);

builder.mutationField('deletePost', (t) =>
  t.field({
    type: PostType,
    nullable: true,
    description: 'Delete a post',
    args: {
      id: t.arg.int({ required: true, validate: idSchema }),
    },
    resolve: async (_parent, args, ctx) => {
      try {
        return await ctx.prisma.post.delete({
          where: { id: args.id },
        });
      } catch (error) {
        handlePrismaError(error);
      }
    },
  })
);

builder.mutationField('publishPost', (t) =>
  t.field({
    type: PostType,
    nullable: true,
    description: 'Publish or unpublish a post',
    args: {
      id: t.arg.int({ required: true, validate: idSchema }),
      published: t.arg.boolean({ required: true }),
    },
    resolve: async (_parent, args, ctx) => {
      try {
        return await ctx.prisma.post.update({
          where: { id: args.id },
          data: { published: args.published },
        });
      } catch (error) {
        handlePrismaError(error);
      }
    },
  })
);

// Media mutations
builder.mutationField('addMediaToPost', (t) =>
  t.field({
    type: MediaUnionType,
    description: 'Add media to a post',
    args: {
      postId: t.arg.int({ required: true, validate: idSchema }),
      input: t.arg({ type: CreateMediaInput, required: true }),
    },
    resolve: async (_parent, args, ctx) => {
      try {
        const media = await ctx.prisma.media.create({
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
        return {
          ...media,
          type: media.type as 'IMAGE' | 'VIDEO' | 'AUDIO',
        };
      } catch (error) {
        handlePrismaError(error);
      }
    },
  })
);

builder.mutationField('removeMediaFromPost', (t) =>
  t.field({
    type: 'Boolean',
    description: 'Remove media from a post',
    args: {
      mediaId: t.arg.int({ required: true, validate: idSchema }),
    },
    resolve: async (_parent, args, ctx) => {
      try {
        await ctx.prisma.media.delete({
          where: { id: args.mediaId },
        });
        return true;
      } catch (error) {
        if (error instanceof Error && error.message.includes('Record to delete does not exist')) {
          return false;
        }
        throw error;
      }
    },
  })
);
