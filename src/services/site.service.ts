import { Site, Address } from '../generated/prisma';
import {
  CreateSiteSchema,
  UpdateSiteSchema,
  CreateSiteInput,
  UpdateSiteInput,
} from '../dto';
import { BaseService, ServiceContext } from './base.service';

/**
 * Site Service - handles site and address operations
 * Demonstrates nested create pattern
 */
export class SiteService extends BaseService {
  protected entityName = 'Site';

  /**
   * Get all sites with addresses
   */
  async findMany(ctx: ServiceContext): Promise<Site[]> {
    return ctx.prisma.site.findMany({
      include: { address: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Get site by ID (uses DataLoader)
   */
  async findById(ctx: ServiceContext, id: number): Promise<Site | null> {
    return ctx.loaders.site.load(id);
  }

  /**
   * Create a site with nested address in one transaction
   */
  async create(ctx: ServiceContext, input: unknown): Promise<Site> {
    const data = this.validate(CreateSiteSchema, input);

    // Security: must be authenticated
    this.checkSecurity(ctx, { requireAuth: true });

    // Prisma nested create - creates both Site and Address atomically
    return ctx.prisma.site.create({
      data: {
        name: data.name,
        address: {
          create: data.address,
        },
      },
      include: { address: true },
    });
  }

  /**
   * Update a site and optionally its address
   */
  async update(
    ctx: ServiceContext,
    id: number,
    input: unknown
  ): Promise<Site | null> {
    const data = this.validate(UpdateSiteSchema, input);

    // Security: must be authenticated
    this.checkSecurity(ctx, { requireAuth: true });

    const site = await ctx.prisma.site.findUnique({ where: { id } });
    this.ensureExists(site, id);

    // Update site name if provided
    if (data.name) {
      await ctx.prisma.site.update({
        where: { id },
        data: { name: data.name },
      });
    }

    // Update address if provided
    if (data.address && site) {
      await ctx.prisma.address.update({
        where: { id: site.addressId },
        data: data.address,
      });
    }

    // Return updated site with address
    return ctx.prisma.site.findUnique({
      where: { id },
      include: { address: true },
    });
  }

  /**
   * Delete a site (cascades to address)
   */
  async delete(ctx: ServiceContext, id: number): Promise<Site | null> {
    // Security: admin only
    this.checkSecurity(ctx, { requireAuth: true, roles: ['ADMIN'] });

    const site = await ctx.prisma.site.findUnique({ where: { id } });
    this.ensureExists(site, id);

    return ctx.prisma.site.delete({
      where: { id },
    });
  }

  /**
   * Get address for a site (uses DataLoader)
   */
  async getAddress(ctx: ServiceContext, addressId: number): Promise<Address | null> {
    return ctx.loaders.address.load(addressId);
  }
}
