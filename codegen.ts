import type { CodegenConfig } from '@graphql-codegen/cli';

const config: CodegenConfig = {
  schema: './src/schema.ts',
  generates: {
    './src/generated/graphql/types.ts': {
      plugins: ['typescript', 'typescript-resolvers'],
      config: {
        useIndexSignature: true,
        contextType: '../resolvers#Context',
        mappers: {
          User: '@prisma/client#User',
        },
        scalars: {
          ID: 'string',
          Int: 'number',
          Float: 'number',
          String: 'string',
          Boolean: 'boolean',
        },
      },
    },
  },
};

export default config;
