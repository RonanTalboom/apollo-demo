import { z } from 'zod';
import { GraphQLError } from 'graphql';
import { builder } from '../builder';
import type { Site, Address } from '../generated/prisma';

// Zod validation schemas
const nameSchema = z.string().min(1, 'Name is required').max(200, 'Name must be less than 200 characters');
const streetSchema = z.string().min(1, 'Street is required').max(200, 'Street must be less than 200 characters');
const citySchema = z.string().min(1, 'City is required').max(100, 'City must be less than 100 characters');
const zipSchema = z.string().max(20, 'Zip must be less than 20 characters').nullish();
const countrySchema = z.string().min(1, 'Country is required').max(100, 'Country must be less than 100 characters');
const idSchema = z.number().int().positive('ID must be a positive integer');

// Data types with optional relations
export interface AddressData extends Address {
  site?: Site;
}

export interface SiteData extends Site {
  address?: Address;
}

// Address type
export const AddressType = builder.objectRef<AddressData>('Address');

builder.objectType(AddressType, {
  description: 'A physical address',
  fields: (t) => ({
    id: t.exposeInt('id'),
    street: t.exposeString('street'),
    city: t.exposeString('city'),
    zip: t.exposeString('zip', { nullable: true }),
    country: t.exposeString('country'),
  }),
});

// Site type
export const SiteType = builder.objectRef<SiteData>('Site');

builder.objectType(SiteType, {
  description: 'A site/location',
  fields: (t) => ({
    id: t.exposeInt('id'),
    name: t.exposeString('name'),
    createdAt: t.field({
      type: 'String',
      resolve: (site) => site.createdAt.toISOString(),
    }),
    updatedAt: t.field({
      type: 'String',
      resolve: (site) => site.updatedAt.toISOString(),
    }),
    address: t.field({
      type: AddressType,
      resolve: async (site, _args, ctx) => {
        if (site.address) return site.address;
        const address = await ctx.prisma.address.findUnique({
          where: { id: site.addressId },
        });
        if (!address) throw new GraphQLError('Address not found');
        return address;
      },
    }),
  }),
});

// Input types - nested address for creating site in one call
const CreateAddressInput = builder.inputType('CreateAddressInput', {
  fields: (t) => ({
    street: t.string({ required: true, validate: streetSchema }),
    city: t.string({ required: true, validate: citySchema }),
    zip: t.string({ required: false, validate: zipSchema }),
    country: t.string({ required: true, validate: countrySchema }),
  }),
});

const CreateSiteInput = builder.inputType('CreateSiteInput', {
  fields: (t) => ({
    name: t.string({ required: true, validate: nameSchema }),
    address: t.field({ type: CreateAddressInput, required: true }), // Nested!
  }),
});

const UpdateAddressInput = builder.inputType('UpdateAddressInput', {
  fields: (t) => ({
    street: t.string({ required: false, validate: streetSchema.optional() }),
    city: t.string({ required: false, validate: citySchema.optional() }),
    zip: t.string({ required: false, validate: zipSchema }),
    country: t.string({ required: false, validate: countrySchema.optional() }),
  }),
});

const UpdateSiteInput = builder.inputType('UpdateSiteInput', {
  fields: (t) => ({
    name: t.string({ required: false, validate: nameSchema.optional() }),
    address: t.field({ type: UpdateAddressInput, required: false }),
  }),
});

// Helper for Prisma errors
function handlePrismaError(error: unknown): never {
  if (error instanceof Error) {
    if (error.message.includes('Record to update not found') ||
        error.message.includes('Record to delete does not exist')) {
      throw new GraphQLError('Site not found', {
        extensions: { code: 'NOT_FOUND' },
      });
    }
  }
  throw error;
}

// Queries
builder.queryField('sites', (t) =>
  t.field({
    type: [SiteType],
    description: 'Get all sites',
    resolve: async (_parent, _args, ctx) => {
      return ctx.prisma.site.findMany({
        include: { address: true },
        orderBy: { createdAt: 'desc' },
      });
    },
  })
);

builder.queryField('site', (t) =>
  t.field({
    type: SiteType,
    nullable: true,
    description: 'Get a site by ID',
    args: {
      id: t.arg.int({ required: true, validate: idSchema }),
    },
    resolve: async (_parent, args, ctx) => {
      return ctx.prisma.site.findUnique({
        where: { id: args.id },
        include: { address: true },
      });
    },
  })
);

// Mutations
builder.mutationField('createSite', (t) =>
  t.field({
    type: SiteType,
    description: 'Create a new site with address in one call',
    args: {
      input: t.arg({ type: CreateSiteInput, required: true }),
    },
    resolve: async (_parent, args, ctx) => {
      // Create both Site and Address in a single transaction
      return ctx.prisma.site.create({
        data: {
          name: args.input.name.trim(),
          address: {
            create: {
              street: args.input.address.street.trim(),
              city: args.input.address.city.trim(),
              zip: args.input.address.zip?.trim() || null,
              country: args.input.address.country.trim(),
            },
          },
        },
        include: { address: true },
      });
    },
  })
);

builder.mutationField('updateSite', (t) =>
  t.field({
    type: SiteType,
    nullable: true,
    description: 'Update a site and optionally its address',
    args: {
      id: t.arg.int({ required: true, validate: idSchema }),
      input: t.arg({ type: UpdateSiteInput, required: true }),
    },
    resolve: async (_parent, args, ctx) => {
      const siteData: { name?: string } = {};
      const addressData: { street?: string; city?: string; zip?: string | null; country?: string } = {};

      // Build site update data
      if (args.input.name !== undefined && args.input.name !== null) {
        siteData.name = args.input.name.trim();
      }

      // Build address update data
      if (args.input.address) {
        if (args.input.address.street !== undefined && args.input.address.street !== null) {
          addressData.street = args.input.address.street.trim();
        }
        if (args.input.address.city !== undefined && args.input.address.city !== null) {
          addressData.city = args.input.address.city.trim();
        }
        if (args.input.address.zip !== undefined) {
          addressData.zip = args.input.address.zip?.trim() || null;
        }
        if (args.input.address.country !== undefined && args.input.address.country !== null) {
          addressData.country = args.input.address.country.trim();
        }
      }

      const hasAddressUpdate = Object.keys(addressData).length > 0;
      const hasSiteUpdate = Object.keys(siteData).length > 0;

      if (!hasSiteUpdate && !hasAddressUpdate) {
        throw new GraphQLError('At least one field must be provided for update', {
          extensions: { code: 'BAD_USER_INPUT' },
        });
      }

      try {
        return await ctx.prisma.site.update({
          where: { id: args.id },
          data: {
            ...siteData,
            ...(hasAddressUpdate && {
              address: {
                update: addressData,
              },
            }),
          },
          include: { address: true },
        });
      } catch (error) {
        handlePrismaError(error);
      }
    },
  })
);

builder.mutationField('deleteSite', (t) =>
  t.field({
    type: SiteType,
    nullable: true,
    description: 'Delete a site (cascades to address)',
    args: {
      id: t.arg.int({ required: true, validate: idSchema }),
    },
    resolve: async (_parent, args, ctx) => {
      try {
        return await ctx.prisma.site.delete({
          where: { id: args.id },
          include: { address: true },
        });
      } catch (error) {
        handlePrismaError(error);
      }
    },
  })
);
