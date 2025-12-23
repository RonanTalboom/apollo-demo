import SchemaBuilder from '@pothos/core';
import ValidationPlugin from '@pothos/plugin-validation';
import type { PrismaClient } from './generated/prisma';

// Context type
export interface Context {
  prisma: PrismaClient;
}

// Create the builder with validation plugin
// Note: We don't use @pothos/plugin-prisma because Prisma.dmmf
// is not available in edge runtimes (Cloudflare Workers)
export const builder = new SchemaBuilder<{
  Context: Context;
  Scalars: {
    ID: { Input: string; Output: string };
  };
}>({
  plugins: [ValidationPlugin],
});

// Initialize query and mutation types
builder.queryType({});
builder.mutationType({});
