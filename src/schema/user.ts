import { z } from 'zod';
import { GraphQLError } from 'graphql';
import { builder } from '../builder';
import type { User, Post } from '../generated/prisma';

// Zod schemas for validation
const emailSchema = z.string().email('Invalid email format').max(255, 'Email must be less than 255 characters');
const nameSchema = z.string().max(100, 'Name must be less than 100 characters').nullish();
const idSchema = z.number().int().positive('ID must be a positive integer');

// User data type with optional posts
export interface UserData extends User {
  posts?: Post[];
}

// Forward declaration for Post type (resolved in index.ts)
export let PostType: Parameters<typeof builder.objectType>[0];

export function registerPostType(postType: typeof PostType) {
  PostType = postType;
}

// User type
export const UserType = builder.objectRef<UserData>('User');

builder.objectType(UserType, {
  description: 'A user in the system',
  fields: (t) => ({
    id: t.exposeInt('id'),
    email: t.exposeString('email'),
    name: t.exposeString('name', { nullable: true }),
    posts: t.field({
      type: [PostType],
      nullable: true,
      resolve: async (user, _args, ctx) => {
        if (user.posts) return user.posts;
        return ctx.prisma.post.findMany({
          where: { authorId: user.id },
          orderBy: { createdAt: 'desc' },
        });
      },
    }),
  }),
});

// Input types
const CreateUserInput = builder.inputType('CreateUserInput', {
  fields: (t) => ({
    email: t.string({
      required: true,
      validate: emailSchema,
    }),
    name: t.string({
      required: false,
      validate: nameSchema,
    }),
  }),
});

const UpdateUserInput = builder.inputType('UpdateUserInput', {
  fields: (t) => ({
    email: t.string({
      required: false,
      validate: emailSchema.optional(),
    }),
    name: t.string({
      required: false,
      validate: nameSchema,
    }),
  }),
});

// Helper to handle Prisma errors
function handlePrismaError(error: unknown): never {
  if (error instanceof Error) {
    if (error.message.includes('Unique constraint')) {
      throw new GraphQLError('A user with this email already exists', {
        extensions: { code: 'CONFLICT', field: 'email' },
      });
    }
    if (error.message.includes('Record to update not found') ||
        error.message.includes('Record to delete does not exist')) {
      throw new GraphQLError('User not found', {
        extensions: { code: 'NOT_FOUND' },
      });
    }
  }
  throw error;
}

// Queries
builder.queryField('users', (t) =>
  t.field({
    type: [UserType],
    description: 'Get all users',
    resolve: (_parent, _args, ctx) => {
      return ctx.prisma.user.findMany();
    },
  })
);

builder.queryField('user', (t) =>
  t.field({
    type: UserType,
    nullable: true,
    description: 'Get a user by ID',
    args: {
      id: t.arg.int({
        required: true,
        validate: idSchema,
      }),
    },
    resolve: (_parent, args, ctx) => {
      return ctx.prisma.user.findUnique({
        where: { id: args.id },
      });
    },
  })
);

builder.queryField('userByEmail', (t) =>
  t.field({
    type: UserType,
    nullable: true,
    description: 'Get a user by email',
    args: {
      email: t.arg.string({
        required: true,
        validate: emailSchema,
      }),
    },
    resolve: (_parent, args, ctx) => {
      return ctx.prisma.user.findUnique({
        where: { email: args.email.toLowerCase().trim() },
      });
    },
  })
);

// Mutations
builder.mutationField('createUser', (t) =>
  t.field({
    type: UserType,
    description: 'Create a new user',
    args: {
      input: t.arg({ type: CreateUserInput, required: true }),
    },
    resolve: async (_parent, args, ctx) => {
      try {
        return await ctx.prisma.user.create({
          data: {
            email: args.input.email.toLowerCase().trim(),
            name: args.input.name?.trim() || null,
          },
        });
      } catch (error) {
        handlePrismaError(error);
      }
    },
  })
);

builder.mutationField('updateUser', (t) =>
  t.field({
    type: UserType,
    nullable: true,
    description: 'Update an existing user',
    args: {
      id: t.arg.int({
        required: true,
        validate: idSchema,
      }),
      input: t.arg({ type: UpdateUserInput, required: true }),
    },
    resolve: async (_parent, args, ctx) => {
      const data: { email?: string; name?: string | null } = {};

      if (args.input.email !== undefined && args.input.email !== null) {
        data.email = args.input.email.toLowerCase().trim();
      }
      if (args.input.name !== undefined) {
        data.name = args.input.name?.trim() || null;
      }

      if (Object.keys(data).length === 0) {
        throw new GraphQLError('At least one field must be provided for update', {
          extensions: { code: 'BAD_USER_INPUT' },
        });
      }

      try {
        return await ctx.prisma.user.update({
          where: { id: args.id },
          data,
        });
      } catch (error) {
        handlePrismaError(error);
      }
    },
  })
);

builder.mutationField('deleteUser', (t) =>
  t.field({
    type: UserType,
    nullable: true,
    description: 'Delete a user',
    args: {
      id: t.arg.int({
        required: true,
        validate: idSchema,
      }),
    },
    resolve: async (_parent, args, ctx) => {
      try {
        return await ctx.prisma.user.delete({
          where: { id: args.id },
        });
      } catch (error) {
        handlePrismaError(error);
      }
    },
  })
);
