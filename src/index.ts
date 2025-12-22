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

    // Show landing page for GET requests without query
    if (!body && request.method === 'GET') {
      const landingPage = `
<!DOCTYPE html>
<html>
<head>
  <title>Apollo GraphQL Server</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 800px; margin: 50px auto; padding: 20px; }
    h1 { color: #3f20ba; }
    pre { background: #f4f4f4; padding: 15px; border-radius: 5px; overflow-x: auto; }
    code { background: #f4f4f4; padding: 2px 6px; border-radius: 3px; }
    .endpoint { color: #e535ab; }
  </style>
</head>
<body>
  <h1>🚀 Apollo GraphQL Server</h1>
  <p>Your GraphQL API is running on Cloudflare Workers with Prisma ORM.</p>

  <h2>Endpoint</h2>
  <p>Send GraphQL queries via <code>POST</code> to <span class="endpoint">${url.origin}/graphql</span></p>

  <h2>Example Query</h2>
  <pre>curl -X POST ${url.origin}/graphql \\
  -H "Content-Type: application/json" \\
  -d '{"query": "{ users { id email name } }"}'</pre>

  <h2>Available Operations</h2>
  <h3>Queries</h3>
  <ul>
    <li><code>users</code> - Get all users</li>
    <li><code>user(id: Int!)</code> - Get user by ID</li>
    <li><code>userByEmail(email: String!)</code> - Get user by email</li>
  </ul>

  <h3>Mutations</h3>
  <ul>
    <li><code>createUser(input: CreateUserInput!)</code> - Create a new user</li>
    <li><code>updateUser(id: Int!, input: UpdateUserInput!)</code> - Update a user</li>
    <li><code>deleteUser(id: Int!)</code> - Delete a user</li>
  </ul>

  <h2>Introspection</h2>
  <pre>curl -X POST ${url.origin}/graphql \\
  -H "Content-Type: application/json" \\
  -d '{"query": "{ __schema { types { name } } }"}'</pre>
</body>
</html>`;
      return new Response(landingPage, {
        status: 200,
        headers: { 'Content-Type': 'text/html' },
      });
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
