import { Module, type MiddlewareConsumer, type NestModule } from '@nestjs/common'
import { createExpressMiddleware } from '@trpc/server/adapters/express'
import { appRouter } from './router.js'

const trpcMiddleware = createExpressMiddleware({ router: appRouter })

@Module({})
export class TrpcModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(trpcMiddleware).forRoutes('/trpc')
  }
}
