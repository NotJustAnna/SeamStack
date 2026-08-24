import 'reflect-metadata'
import { NestFactory } from '@nestjs/core'
import { SeamModule } from '@seamstack/nestjs'
import { AppModule } from './app.module.js'

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule)
  await SeamModule.stitch(app).defaultPort(3000).listen()
}

void bootstrap()
