import { ApolloServer, HeaderMap } from '@apollo/server';
import { PrismaClient } from './generated/prisma';
import { PrismaD1 } from '@prisma/adapter-d1';
import { typeDefs } from './schema';
import { resolvers, Context } from './resolvers';

export interface Env {
  DB: D1Database;
}

const server = new ApolloServer<Context>({
  typeDefs,
  resolvers,
});

server.startInBackgroundHandlingStartupErrorsByLoggingAndFailingAllRequests();

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    // Health check endpoint
    if (url.pathname === '/health') {
      return new Response('OK', { status: 200 });
    }

    // Only handle GraphQL requests at root or /graphql
    if (url.pathname !== '/' && url.pathname !== '/graphql') {
      return new Response('Not Found', { status: 404 });
    }

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        },
      });
    }

    // Create Prisma client with D1 adapter
    const adapter = new PrismaD1(env.DB);
    const prisma = new PrismaClient({ adapter });

    // Convert Request headers to HeaderMap
    const headers = new HeaderMap();
    request.headers.forEach((value, key) => {
      headers.set(key, value);
    });

    // Parse the request body
    let body: Record<string, unknown> | undefined;
    if (request.method === 'POST') {
      try {
        body = await request.json();
      } catch {
        return new Response('Invalid JSON', { status: 400 });
      }
    } else if (request.method === 'GET') {
      const query = url.searchParams.get('query');
      const variables = url.searchParams.get('variables');
      const operationName = url.searchParams.get('operationName');
      if (query) {
        body = {
          query,
          variables: variables ? JSON.parse(variables) : undefined,
          operationName: operationName || undefined,
        };
      }
    }

    if (!body) {
      return new Response('Bad Request', { status: 400 });
    }

    // Execute the GraphQL request
    const httpGraphQLResponse = await server.executeHTTPGraphQLRequest({
      httpGraphQLRequest: {
        method: request.method,
        headers,
        search: url.search,
        body,
      },
      context: async () => ({ prisma }),
    });

    // Build the response
    const responseHeaders = new Headers();
    responseHeaders.set('Access-Control-Allow-Origin', '*');

    for (const [key, value] of httpGraphQLResponse.headers) {
      responseHeaders.set(key, value);
    }

    let responseBody: string;
    if (httpGraphQLResponse.body.kind === 'complete') {
      responseBody = httpGraphQLResponse.body.string;
    } else {
      // Handle async iterator for subscriptions (not commonly used in Workers)
      const chunks: string[] = [];
      for await (const chunk of httpGraphQLResponse.body.asyncIterator) {
        chunks.push(chunk);
      }
      responseBody = chunks.join('');
    }

    return new Response(responseBody, {
      status: httpGraphQLResponse.status || 200,
      headers: responseHeaders,
    });
  },
} satisfies ExportedHandler<Env>;
