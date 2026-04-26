import { createYoga } from 'graphql-yoga'
import { schema, root } from './schema.js'

/**
 * Wire into your Elysia app:
 *
 *   import { yogaHandler } from './graphql/mount.js'
 *   new Elysia().all('/graphql', ({ request }) => yogaHandler.handle(request))
 */
export const yogaHandler = createYoga({ schema, rootValue: root })
