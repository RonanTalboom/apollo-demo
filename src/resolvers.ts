import { GraphQLError } from 'graphql';
import { PrismaClient } from './generated/prisma';

export interface Context {
  prisma: PrismaClient;
}

// Validation helpers
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validateEmail(email: string): void {
  if (!email || email.trim().length === 0) {
    throw new GraphQLError('Email is required', {
      extensions: { code: 'BAD_USER_INPUT', field: 'email' },
    });
  }
  if (!EMAIL_REGEX.test(email)) {
    throw new GraphQLError('Invalid email format', {
      extensions: { code: 'BAD_USER_INPUT', field: 'email' },
    });
  }
  if (email.length > 255) {
    throw new GraphQLError('Email must be less than 255 characters', {
      extensions: { code: 'BAD_USER_INPUT', field: 'email' },
    });
  }
}

function validateName(name: string | undefined | null): void {
  if (name !== undefined && name !== null) {
    if (name.length > 100) {
      throw new GraphQLError('Name must be less than 100 characters', {
        extensions: { code: 'BAD_USER_INPUT', field: 'name' },
      });
    }
  }
}

function validateId(id: number): void {
  if (!Number.isInteger(id) || id <= 0) {
    throw new GraphQLError('ID must be a positive integer', {
      extensions: { code: 'BAD_USER_INPUT', field: 'id' },
    });
  }
}

// Handle Prisma errors
function handlePrismaError(error: unknown): never {
  if (error instanceof Error) {
    // Prisma unique constraint violation
    if (error.message.includes('Unique constraint')) {
      throw new GraphQLError('A user with this email already exists', {
        extensions: { code: 'CONFLICT', field: 'email' },
      });
    }
    // Prisma record not found
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
      validateId(args.id);
      return context.prisma.user.findUnique({
        where: { id: args.id },
      });
    },
    userByEmail: async (_parent: unknown, args: { email: string }, context: Context) => {
      validateEmail(args.email);
      return context.prisma.user.findUnique({
        where: { email: args.email.toLowerCase().trim() },
      });
    },
  },
  Mutation: {
    createUser: async (
      _parent: unknown,
      args: { input: { email: string; name?: string } },
      context: Context
    ) => {
      const email = args.input.email.toLowerCase().trim();
      validateEmail(email);
      validateName(args.input.name);

      try {
        return await context.prisma.user.create({
          data: {
            email,
            name: args.input.name?.trim() || null,
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
      validateId(args.id);

      const data: { email?: string; name?: string | null } = {};

      if (args.input.email !== undefined) {
        const email = args.input.email.toLowerCase().trim();
        validateEmail(email);
        data.email = email;
      }

      if (args.input.name !== undefined) {
        validateName(args.input.name);
        data.name = args.input.name?.trim() || null;
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
      validateId(args.id);

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
