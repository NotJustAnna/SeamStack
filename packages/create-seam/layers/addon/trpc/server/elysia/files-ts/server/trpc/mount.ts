import { Elysia } from 'elysia'
import { fetchRequestHandler } from '@trpc/server/adapters/fetch'
import { appRouter } from './router.js'

export const trpcPlugin = new Elysia().all('/trpc/*', ({ request }) =>
  fetchRequestHandler({ endpoint: '/trpc', router: appRouter, req: request }),
)
