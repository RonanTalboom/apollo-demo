import { BaseService, ServiceContext, ValidationError } from './base.service';
import type { Site, Address } from '../generated/prisma';

interface CreateAddressInput {
  street: string;
  city: string;
  zip?: string;
  country: string;
}

interface CreateSiteInput {
  name: string;
  address: CreateAddressInput;
}

interface UpdateAddressInput {
  street?: string;
  city?: string;
  zip?: string;
  country?: string;
}

interface UpdateSiteInput {
  name?: string;
  address?: UpdateAddressInput;
}

interface SiteWithAddress extends Site {
  address?: Address;
}

class SiteService extends BaseService<SiteWithAddress, CreateSiteInput, UpdateSiteInput> {
  constructor() {
    super({
      modelName: 'Site',
      security: {
        read: {}, // Public read
        create: {
          requireAuth: true,
          allowedRoles: ['ADMIN', 'USER'],
        },
        update: {
          requireAuth: true,
          allowedRoles: ['ADMIN', 'USER'],
        },
        delete: {
          requireAuth: true,
          allowedRoles: ['ADMIN'],
        },
      },
    });
  }

  async findMany(ctx: ServiceContext): Promise<SiteWithAddress[]> {
    await this.checkPermission(ctx, 'read');
    return ctx.prisma.site.findMany({
      include: { address: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findById(ctx: ServiceContext, id: number): Promise<SiteWithAddress | null> {
    await this.checkPermission(ctx, 'read', id);
    return ctx.prisma.site.findUnique({
      where: { id },
      include: { address: true },
    });
  }

  // Create site with nested address in ONE call
  async create(ctx: ServiceContext, data: CreateSiteInput): Promise<SiteWithAddress> {
    await this.checkPermission(ctx, 'create');

    // Validate
    if (!data.name?.trim()) {
      throw new ValidationError('Name is required', 'name');
    }
    if (!data.address?.street?.trim()) {
      throw new ValidationError('Street is required', 'address.street');
    }
    if (!data.address?.city?.trim()) {
      throw new ValidationError('City is required', 'address.city');
    }
    if (!data.address?.country?.trim()) {
      throw new ValidationError('Country is required', 'address.country');
    }

    try {
      // Prisma nested create - both created in single transaction
      return await ctx.prisma.site.create({
        data: {
          name: data.name.trim(),
          address: {
            create: {
              street: data.address.street.trim(),
              city: data.address.city.trim(),
              zip: data.address.zip?.trim() || null,
              country: data.address.country.trim(),
            },
          },
        },
        include: { address: true },
      });
    } catch (error) {
      this.handlePrismaError(error);
    }
  }

  async update(ctx: ServiceContext, id: number, data: UpdateSiteInput): Promise<SiteWithAddress> {
    await this.checkPermission(ctx, 'update', id);

    const siteData: { name?: string } = {};
    const addressData: { street?: string; city?: string; zip?: string | null; country?: string } = {};

    if (data.name) siteData.name = data.name.trim();

    if (data.address) {
      if (data.address.street) addressData.street = data.address.street.trim();
      if (data.address.city) addressData.city = data.address.city.trim();
      if (data.address.zip !== undefined) addressData.zip = data.address.zip?.trim() || null;
      if (data.address.country) addressData.country = data.address.country.trim();
    }

    const hasAddressUpdate = Object.keys(addressData).length > 0;
    const hasSiteUpdate = Object.keys(siteData).length > 0;

    if (!hasSiteUpdate && !hasAddressUpdate) {
      throw new ValidationError('At least one field must be provided');
    }

    try {
      return await ctx.prisma.site.update({
        where: { id },
        data: {
          ...siteData,
          ...(hasAddressUpdate && { address: { update: addressData } }),
        },
        include: { address: true },
      });
    } catch (error) {
      this.handlePrismaError(error);
    }
  }

  async delete(ctx: ServiceContext, id: number): Promise<SiteWithAddress> {
    await this.checkPermission(ctx, 'delete', id);

    try {
      // Cascade deletes address due to onDelete: Cascade in schema
      return await ctx.prisma.site.delete({
        where: { id },
        include: { address: true },
      });
    } catch (error) {
      this.handlePrismaError(error);
    }
  }
}

export const siteService = new SiteService();
