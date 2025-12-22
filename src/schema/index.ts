import { builder } from '../builder';

// Import all type definitions
import './user';

// Build and export the schema
export const schema = builder.toSchema();
