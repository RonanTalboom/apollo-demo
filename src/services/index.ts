/**
 * Service Layer Exports
 *
 * Services encapsulate business logic and provide a clean API for resolvers.
 * Each service handles validation, security, and database operations.
 *
 * Architecture:
 *   Resolver → Mediator → Service → Prisma/DataLoader
 */

// Base service with common functionality
export { BaseService, NotFoundError, UnauthorizedError, ForbiddenError, ValidationError } from './base.service';
export type { ServiceContext } from './base.service';

// Domain services
export { UserService } from './user.service';
export { PostService } from './post.service';
export { SiteService } from './site.service';

// Keep factory for reference (alternative pattern)
export * from './crud.factory';
