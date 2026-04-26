import { graphqlServer } from '@hono/graphql-server'
import { schema, root } from './schema.js'

/**
 * Wire into your Hono app:
 *
 *   import { graphqlMiddleware } from './graphql/mount.js'
 *   app.use('/graphql', graphqlMiddleware)
 */
export const graphqlMiddleware = graphqlServer({ schema, rootResolver: () => root })
