import { createTRPCClient, httpBatchLink } from '@trpc/client'

export const trpc = createTRPCClient({
  links: [
    httpBatchLink({
      url: '/trpc',
    }),
  ],
})
