import { Module } from '@nestjs/common'
import { GraphQLModule } from '@nestjs/graphql'
import { ApolloDriver, type ApolloDriverConfig } from '@nestjs/apollo'
import { printSchema } from 'graphql'
import { schema, root } from './schema.js'

@Module({
  imports: [
    GraphQLModule.forRoot<ApolloDriverConfig>({
      driver: ApolloDriver,
      typeDefs: printSchema(schema),
      resolvers: { Query: root },
      playground: false,
    }),
  ],
})
export class GraphqlModule {}
