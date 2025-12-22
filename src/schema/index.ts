import { builder } from '../builder';

// Import schema definitions - Prisma plugin handles circular dependencies automatically
import './user';
import './post';

// Build and export the schema
export const schema = builder.toSchema();
