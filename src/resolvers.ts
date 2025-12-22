import { PrismaClient } from './generated/prisma';

export interface Context {
  prisma: PrismaClient;
}

export const resolvers = {
  Query: {
    users: async (_parent: unknown, _args: unknown, context: Context) => {
      return context.prisma.user.findMany();
    },
    user: async (_parent: unknown, args: { id: number }, context: Context) => {
      return context.prisma.user.findUnique({
        where: { id: args.id },
      });
    },
    userByEmail: async (_parent: unknown, args: { email: string }, context: Context) => {
      return context.prisma.user.findUnique({
        where: { email: args.email },
      });
    },
  },
  Mutation: {
    createUser: async (
      _parent: unknown,
      args: { input: { email: string; name?: string } },
      context: Context
    ) => {
      return context.prisma.user.create({
        data: {
          email: args.input.email,
          name: args.input.name,
        },
      });
    },
    updateUser: async (
      _parent: unknown,
      args: { id: number; input: { email?: string; name?: string } },
      context: Context
    ) => {
      return context.prisma.user.update({
        where: { id: args.id },
        data: args.input,
      });
    },
    deleteUser: async (_parent: unknown, args: { id: number }, context: Context) => {
      return context.prisma.user.delete({
        where: { id: args.id },
      });
    },
  },
};
