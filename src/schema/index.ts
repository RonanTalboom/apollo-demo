import { builder } from '../builder';

// Import post first (it depends on UserType from user)
// But user needs PostType for the posts field
// We handle this with lazy field resolution
import { registerUserType } from './user';
import { PostType } from './post';

// Register User type with Post reference
registerUserType(PostType);

// Build and export the schema
export const schema = builder.toSchema();
