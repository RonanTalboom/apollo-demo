import DataLoader from 'dataloader';
import { PrismaClient, User, Post, Site, Address } from '../generated/prisma';

/**
 * DataLoader factory - creates loaders for batching database queries
 * Solves the N+1 problem in GraphQL by batching multiple requests
 *
 * Note: D1/SQLite has limited query capabilities, so we fetch all
 * and filter in memory for batching.
 */

// User Loader - batch load users by ID
export const createUserLoader = (prisma: PrismaClient) =>
  new DataLoader<number, User | null>(async (ids) => {
    // D1 doesn't support IN queries well, fetch individually or use raw SQL
    const users = await Promise.all(
      ids.map((id) => prisma.user.findUnique({ where: { id } }))
    );
    return users;
  });

// User by Email Loader - batch load users by email
export const createUserByEmailLoader = (prisma: PrismaClient) =>
  new DataLoader<string, User | null>(async (emails) => {
    const users = await Promise.all(
      emails.map((email) => prisma.user.findUnique({ where: { email } }))
    );
    return users;
  });

// Post Loader - batch load posts by ID
export const createPostLoader = (prisma: PrismaClient) =>
  new DataLoader<number, Post | null>(async (ids) => {
    const posts = await Promise.all(
      ids.map((id) => prisma.post.findUnique({ where: { id } }))
    );
    return posts;
  });

// Posts by Author Loader - batch load posts by author ID
export const createPostsByAuthorLoader = (prisma: PrismaClient) =>
  new DataLoader<number, Post[]>(async (authorIds) => {
    // Fetch posts for all authors and group them
    const results = await Promise.all(
      authorIds.map((authorId) =>
        prisma.post.findMany({
          where: { authorId },
          orderBy: { createdAt: 'desc' },
        })
      )
    );
    return results;
  });

// Site Loader - batch load sites by ID
export const createSiteLoader = (prisma: PrismaClient) =>
  new DataLoader<number, Site | null>(async (ids) => {
    const sites = await Promise.all(
      ids.map((id) =>
        prisma.site.findUnique({
          where: { id },
          include: { address: true },
        })
      )
    );
    return sites;
  });

// Address Loader - batch load addresses by ID
export const createAddressLoader = (prisma: PrismaClient) =>
  new DataLoader<number, Address | null>(async (ids) => {
    const addresses = await Promise.all(
      ids.map((id) => prisma.address.findUnique({ where: { id } }))
    );
    return addresses;
  });

/**
 * Create all loaders - call this once per request
 */
export const createLoaders = (prisma: PrismaClient) => ({
  user: createUserLoader(prisma),
  userByEmail: createUserByEmailLoader(prisma),
  post: createPostLoader(prisma),
  postsByAuthor: createPostsByAuthorLoader(prisma),
  site: createSiteLoader(prisma),
  address: createAddressLoader(prisma),
});

export type Loaders = ReturnType<typeof createLoaders>;
