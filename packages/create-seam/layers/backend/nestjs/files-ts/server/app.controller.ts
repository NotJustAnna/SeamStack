import { Controller, Get } from '@nestjs/common'

@Controller()
export class AppController {
  @Get('/api/hello')
  hello(): { msg: string } {
    return { msg: 'hi from nestjs' }
  }
}
