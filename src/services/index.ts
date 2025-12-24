// Core factory - import this to create new services
export * from './crud.factory';

// ============================================================================
// USER SERVICE - using factory pattern
// ============================================================================

import { createCrudService, ValidationError } from './crud.factory';
import type { User } from '../generated/prisma';

interface CreateUser { email: string; name?: string }
interface UpdateUser { email?: string; name?: string }

export const userService = createCrudService<User, CreateUser, UpdateUser>({
  modelName: 'user',
  displayName: 'User',
  security: {
    read: {},  // Public
    create: {}, // Public (registration)
    update: { requireAuth: true, ownerField: 'id' }, // Own profile only
    delete: { requireAuth: true, roles: ['ADMIN'] },
  },
  validate: {
    create: (data) => {
      if (!data.email?.includes('@')) {
        throw new ValidationError('Invalid email', 'email');
      }
    },
  },
  transform: {
    create: (data) => ({
      email: data.email.toLowerCase().trim(),
      name: data.name?.trim() || null,
    }),
    update: (data) => ({
      ...(data.email && { email: data.email.toLowerCase().trim() }),
      ...(data.name !== undefined && { name: data.name?.trim() || null }),
    }),
  },
});

// ============================================================================
// POST SERVICE
// ============================================================================

import type { Post, Media } from '../generated/prisma';

interface CreatePost { title: string; content?: string; published?: boolean; authorId: number }
interface UpdatePost { title?: string; content?: string; published?: boolean }

export const postService = {
  ...createCrudService<Post, CreatePost, UpdatePost>({
    modelName: 'post',
    displayName: 'Post',
    orderBy: { createdAt: 'desc' },
    security: {
      read: {},
      create: { requireAuth: true },
      update: { requireAuth: true, ownerField: 'authorId' },
      delete: { requireAuth: true, ownerField: 'authorId' },
    },
    validate: {
      create: (data) => {
        if (!data.title?.trim()) throw new ValidationError('Title required', 'title');
      },
    },
    transform: {
      create: (data) => ({
        title: data.title.trim(),
        content: data.content?.trim() || null,
        published: data.published ?? false,
        authorId: data.authorId,
      }),
    },
  }),

  // Custom method for posts
  async findByAuthor(ctx: any, authorId: number) {
    return ctx.prisma.post.findMany({
      where: { authorId },
      orderBy: { createdAt: 'desc' },
    });
  },

  async publish(ctx: any, id: number, published: boolean) {
    return ctx.prisma.post.update({
      where: { id },
      data: { published },
    });
  },

  async addMedia(ctx: any, postId: number, data: any): Promise<Media> {
    return ctx.prisma.media.create({
      data: { ...data, postId },
    });
  },

  async removeMedia(ctx: any, mediaId: number): Promise<boolean> {
    try {
      await ctx.prisma.media.delete({ where: { id: mediaId } });
      return true;
    } catch {
      return false;
    }
  },
};

// ============================================================================
// SITE SERVICE - with nested Address
// ============================================================================

import { createNestedService } from './crud.factory';
import type { Site, Address } from '../generated/prisma';

interface CreateAddress { street: string; city: string; zip?: string; country: string }
interface CreateSite { name: string }

export const siteService = createNestedService<Site, Address, CreateSite, CreateAddress>({
  parentModel: 'site',
  childField: 'address',
  displayName: 'Site',
  security: {
    read: {},
    create: { requireAuth: true },
    update: { requireAuth: true },
    delete: { requireAuth: true, roles: ['ADMIN'] },
  },
  validate: {
    parent: (data) => {
      if (!data.name?.trim()) throw new ValidationError('Name required', 'name');
    },
    child: (data) => {
      if (!data.street?.trim()) throw new ValidationError('Street required', 'street');
      if (!data.city?.trim()) throw new ValidationError('City required', 'city');
      if (!data.country?.trim()) throw new ValidationError('Country required', 'country');
    },
  },
  transform: {
    parent: (data) => ({ name: data.name.trim() }),
    child: (data) => ({
      street: data.street.trim(),
      city: data.city.trim(),
      zip: data.zip?.trim() || null,
      country: data.country.trim(),
    }),
  },
});
