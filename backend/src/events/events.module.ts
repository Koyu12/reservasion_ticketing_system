import { Module } from '@nestjs/common';
import { AppAuthModule } from '../auth/auth.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { EventsController } from './events.controller.js';
import { EventsService } from './events.service.js';
import { PublicEventsController } from './public-events.controller.js';

@Module({
  imports: [PrismaModule, AppAuthModule],
  controllers: [EventsController, PublicEventsController],
  providers: [EventsService],
})
export class EventsModule {}
