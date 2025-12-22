import SchemaBuilder from '@pothos/core';
import ValidationPlugin from '@pothos/plugin-validation';
import PrismaPlugin from '@pothos/plugin-prisma';
import type PrismaTypes from './generated/pothos-types';
import { PrismaClient, Prisma } from './generated/prisma';

// Context type
export interface Context {
  prisma: PrismaClient;
}

// Create the builder with Prisma and validation plugins
export const builder = new SchemaBuilder<{
  Context: Context;
  PrismaTypes: PrismaTypes;
  Scalars: {
    ID: { Input: string; Output: string };
  };
}>({
  plugins: [PrismaPlugin, ValidationPlugin],
  prisma: {
    client: (ctx) => ctx.prisma,
    dmmf: Prisma.dmmf,
  },
});

// Initialize query and mutation types
builder.queryType({});
builder.mutationType({});
