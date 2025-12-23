import { builder } from '../builder';
import { registerPostType } from './user';
import { PostType } from './post';

// Register Post type with User to resolve circular dependency
registerPostType(PostType);

// Build and export the schema
export const schema = builder.toSchema();
