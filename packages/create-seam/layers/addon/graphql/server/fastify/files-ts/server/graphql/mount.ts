import mercurius from 'mercurius'
import { schema, root } from './schema.js'

/**
 * Wire into your Fastify app:
 *
 *   import { graphqlPlugin, graphqlOptions } from './graphql/mount.js'
 *   await app.register(graphqlPlugin, graphqlOptions)
 */
export const graphqlPlugin = mercurius
export const graphqlOptions = { schema, resolvers: root, path: '/graphql' }
