import { initTRPC } from '@trpc/server'

const t = initTRPC.create()

export const appRouter = t.router({
  hello: t.procedure.query(() => ({ msg: 'hi from trpc' })),
})

export type AppRouter = typeof appRouter
