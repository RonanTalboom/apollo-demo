import { GraphQLError } from 'graphql';
import { z } from 'zod';
import { PrismaClient } from './generated/prisma';
import { UserCreateInputSchema, UserUpdateInputSchema } from './generated/zod';

export interface Context {
  prisma: PrismaClient;
}

// Validate input using Zod schema and throw GraphQL errors
function validate<T>(schema: z.ZodSchema<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    const error = result.error.errors[0];
    throw new GraphQLError(error.message, {
      extensions: {
        code: 'BAD_USER_INPUT',
        field: error.path.join('.'),
      },
    });
  }
  return result.data;
}

// ID validation schema
const IdSchema = z.number().int().positive({ message: 'ID must be a positive integer' });

// Handle Prisma errors
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

export const resolvers = {
  Query: {
    users: async (_parent: unknown, _args: unknown, context: Context) => {
      return context.prisma.user.findMany();
    },
    user: async (_parent: unknown, args: { id: number }, context: Context) => {
      validate(IdSchema, args.id);
      return context.prisma.user.findUnique({
        where: { id: args.id },
      });
    },
    userByEmail: async (_parent: unknown, args: { email: string }, context: Context) => {
      const { email } = validate(UserCreateInputSchema.pick({ email: true }), { email: args.email });
      return context.prisma.user.findUnique({
        where: { email: email.toLowerCase().trim() },
      });
    },
  },
  Mutation: {
    createUser: async (
      _parent: unknown,
      args: { input: { email: string; name?: string } },
      context: Context
    ) => {
      const input = validate(UserCreateInputSchema, args.input);

      try {
        return await context.prisma.user.create({
          data: {
            email: input.email.toLowerCase().trim(),
            name: input.name?.trim() || null,
          },
        });
      } catch (error) {
        handlePrismaError(error);
      }
    },
    updateUser: async (
      _parent: unknown,
      args: { id: number; input: { email?: string; name?: string } },
      context: Context
    ) => {
      validate(IdSchema, args.id);
      const input = validate(UserUpdateInputSchema, args.input);

      const data: { email?: string; name?: string | null } = {};

      if (input.email !== undefined) {
        data.email = input.email.toLowerCase().trim();
      }
      if (input.name !== undefined) {
        data.name = input.name?.trim() || null;
      }

      if (Object.keys(data).length === 0) {
        throw new GraphQLError('At least one field must be provided for update', {
          extensions: { code: 'BAD_USER_INPUT' },
        });
      }

      try {
        return await context.prisma.user.update({
          where: { id: args.id },
          data,
        });
      } catch (error) {
        handlePrismaError(error);
      }
    },
    deleteUser: async (_parent: unknown, args: { id: number }, context: Context) => {
      validate(IdSchema, args.id);

      try {
        return await context.prisma.user.delete({
          where: { id: args.id },
        });
      } catch (error) {
        handlePrismaError(error);
      }
    },
  },
};
