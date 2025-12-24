import { ApolloServer, HeaderMap } from '@apollo/server';
import { ApolloServerPluginLandingPageLocalDefault } from '@apollo/server/plugin/landingPage/default';
import { makeExecutableSchema } from '@graphql-tools/schema';
import { PrismaClient } from './generated/prisma';
import { PrismaD1 } from '@prisma/adapter-d1';
import { resolvers, Context } from './resolvers';

export interface Env {
  DB: D1Database;
}

// GraphQL Schema (SDL)
const typeDefs = /* GraphQL */ `
  type Query {
    # Users
    users: [User!]!
    user(id: Int!): User
    userByEmail(email: String!): User

    # Posts
    posts(published: Boolean): [Post!]!
    post(id: Int!): Post
    postsByAuthor(authorId: Int!): [Post!]!

    # Sites
    sites: [Site!]!
    site(id: Int!): Site
  }

  type Mutation {
    # Users
    createUser(input: CreateUserInput!): User!
    updateUser(id: Int!, input: UpdateUserInput!): User
    deleteUser(id: Int!): User

    # Posts
    createPost(input: CreatePostInput!): Post!
    updatePost(id: Int!, input: UpdatePostInput!): Post
    deletePost(id: Int!): Post
    publishPost(id: Int!, published: Boolean!): Post

    # Media
    addMediaToPost(postId: Int!, input: CreateMediaInput!): Media!
    removeMediaFromPost(mediaId: Int!): Boolean!

    # Sites
    createSite(input: CreateSiteInput!): Site!
    updateSite(id: Int!, input: UpdateSiteInput!): Site
    deleteSite(id: Int!): Site
  }

  type User {
    id: Int!
    email: String!
    name: String
    posts: [Post!]!
  }

  input CreateUserInput {
    email: String!
    name: String
  }

  input UpdateUserInput {
    email: String
    name: String
  }

  type Post {
    id: Int!
    title: String!
    content: String
    published: Boolean!
    createdAt: String!
    updatedAt: String!
    author: User!
    media: [Media!]!
  }

  input CreatePostInput {
    title: String!
    content: String
    published: Boolean
    authorId: Int!
  }

  input UpdatePostInput {
    title: String
    content: String
    published: Boolean
  }

  enum MediaType {
    IMAGE
    VIDEO
    AUDIO
  }

  union Media = Image | Video | Audio

  type Image {
    id: Int!
    url: String!
    width: Int
    height: Int
    altText: String
  }

  type Video {
    id: Int!
    url: String!
    duration: Int
  }

  type Audio {
    id: Int!
    url: String!
    title: String
    duration: Int
  }

  input CreateMediaInput {
    type: MediaType!
    url: String!
    width: Int
    height: Int
    altText: String
    duration: Int
    title: String
  }

  type Site {
    id: Int!
    name: String!
    createdAt: String!
    updatedAt: String!
    address: Address!
  }

  type Address {
    id: Int!
    street: String!
    city: String!
    zip: String
    country: String!
  }

  input CreateAddressInput {
    street: String!
    city: String!
    zip: String
    country: String!
  }

  input CreateSiteInput {
    name: String!
    address: CreateAddressInput!
  }

  input UpdateAddressInput {
    street: String
    city: String
    zip: String
    country: String
  }

  input UpdateSiteInput {
    name: String
    address: UpdateAddressInput
  }
`;

const schema = makeExecutableSchema({ typeDefs, resolvers });

const server = new ApolloServer<Context>({
  schema,
  plugins: [
    ApolloServerPluginLandingPageLocalDefault({ embed: true }),
  ],
  introspection: true,
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
    let body: Record<string, unknown> = {};
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
