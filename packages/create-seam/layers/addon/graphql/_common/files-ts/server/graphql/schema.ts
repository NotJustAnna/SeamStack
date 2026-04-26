import { buildSchema } from 'graphql'

export const schema = buildSchema(/* GraphQL */ `
  type Query {
    hello: String!
  }
`)

export const root = {
  hello: () => 'hi from graphql',
}
