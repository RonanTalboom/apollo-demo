import { z } from 'zod';

/**
 * Validation schemas using Zod
 * Use z.infer<typeof Schema> to get TypeScript types
 */

// ============ User Schemas ============

export const CreateUserSchema = z.object({
  email: z.string().email('Invalid email format'),
  name: z.string().min(2, 'Name must be at least 2 characters').optional(),
});

export const UpdateUserSchema = z.object({
  email: z.string().email('Invalid email format').optional(),
  name: z.string().min(2, 'Name must be at least 2 characters').optional(),
});

export type CreateUserInput = z.infer<typeof CreateUserSchema>;
export type UpdateUserInput = z.infer<typeof UpdateUserSchema>;

// ============ Post Schemas ============

export const CreatePostSchema = z.object({
  title: z.string().min(3, 'Title must be at least 3 characters'),
  content: z.string().optional(),
  published: z.boolean().default(false),
  authorId: z.number().int().positive('Author ID must be a positive integer'),
});

export const UpdatePostSchema = z.object({
  title: z.string().min(3, 'Title must be at least 3 characters').optional(),
  content: z.string().optional(),
  published: z.boolean().optional(),
});

export type CreatePostInput = z.infer<typeof CreatePostSchema>;
export type UpdatePostInput = z.infer<typeof UpdatePostSchema>;

// ============ Media Schemas ============

export const MediaTypeSchema = z.enum(['IMAGE', 'VIDEO', 'AUDIO']);

export const CreateMediaSchema = z.object({
  type: MediaTypeSchema,
  url: z.string().url('Invalid URL format'),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  altText: z.string().optional(),
  duration: z.number().int().positive().optional(),
  title: z.string().optional(),
});

export type CreateMediaInput = z.infer<typeof CreateMediaSchema>;

// ============ Address Schemas ============

export const CreateAddressSchema = z.object({
  street: z.string().min(1, 'Street is required'),
  city: z.string().min(1, 'City is required'),
  zip: z.string().optional(),
  country: z.string().min(2).max(2, 'Use ISO country code (e.g., US)'),
});

export const UpdateAddressSchema = z.object({
  street: z.string().min(1).optional(),
  city: z.string().min(1).optional(),
  zip: z.string().optional(),
  country: z.string().min(2).max(2).optional(),
});

export type CreateAddressInput = z.infer<typeof CreateAddressSchema>;
export type UpdateAddressInput = z.infer<typeof UpdateAddressSchema>;

// ============ Site Schemas ============

export const CreateSiteSchema = z.object({
  name: z.string().min(1, 'Site name is required'),
  address: CreateAddressSchema,
});

export const UpdateSiteSchema = z.object({
  name: z.string().min(1).optional(),
  address: UpdateAddressSchema.optional(),
});

export type CreateSiteInput = z.infer<typeof CreateSiteSchema>;
export type UpdateSiteInput = z.infer<typeof UpdateSiteSchema>;

// ============ Validation Helper ============

export class ValidationError extends Error {
  constructor(
    message: string,
    public zodError: z.ZodError | null = null
  ) {
    super(message);
    this.name = 'ValidationError';
  }
}

/**
 * Validate input against a Zod schema
 * @throws ValidationError if validation fails
 */
export function validate<T>(schema: z.ZodSchema<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    const messages = result.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join(', ');
    throw new ValidationError(messages, result.error);
  }
  return result.data;
}
