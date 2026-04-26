import 'reflect-metadata'
import { NestFactory } from '@nestjs/core'
import { SeamModule } from '@seamstack/nestjs'
import { AppModule } from './app.module.js'

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule)
  const host = SeamModule.host('127.0.0.1')
  const port = SeamModule.port(3000)
  await app.listen(port, host)
}

void bootstrap()
