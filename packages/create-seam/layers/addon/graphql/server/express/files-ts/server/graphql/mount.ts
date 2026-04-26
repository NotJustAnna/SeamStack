import { createHandler } from 'graphql-http/lib/use/express'
import { schema, root } from './schema.js'

/**
 * Wire into your Express app:
 *
 *   import { graphqlHandler } from './graphql/mount.js'
 *   app.all('/graphql', graphqlHandler)
 */
export const graphqlHandler = createHandler({ schema, rootValue: root })
