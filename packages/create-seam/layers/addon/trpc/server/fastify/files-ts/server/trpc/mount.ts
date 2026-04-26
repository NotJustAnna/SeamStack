import { fastifyTRPCPlugin } from '@trpc/server/adapters/fastify'
import { appRouter } from './router.js'

/**
 * Wire into your Fastify app:
 *
 *   import { trpcPlugin } from './trpc/mount.js'
 *   await app.register(trpcPlugin, { prefix: '/trpc' })
 */
export const trpcPlugin = fastifyTRPCPlugin
export const trpcOptions = { router: appRouter }
