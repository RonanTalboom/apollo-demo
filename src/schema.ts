import gql from 'graphql-tag';

export const typeDefs = gql`
  type User {
    id: Int!
    email: String!
    name: String
  }

  input CreateUserInput {
    email: String!
    name: String
  }

  input UpdateUserInput {
    email: String
    name: String
  }

  type Query {
    users: [User!]!
    user(id: Int!): User
    userByEmail(email: String!): User
  }

  type Mutation {
    createUser(input: CreateUserInput!): User!
    updateUser(id: Int!, input: UpdateUserInput!): User
    deleteUser(id: Int!): User
  }
`;
