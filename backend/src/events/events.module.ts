import { Module } from '@nestjs/common';
import { AppAuthModule } from '../auth/auth.module.js';
import { CommonModule } from '../common/common.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { EventsController } from './events.controller.js';
import { EventsService } from './events.service.js';
import { PublicEventsController } from './public-events.controller.js';

@Module({
  imports: [CommonModule, AppAuthModule, NotificationsModule],
  controllers: [EventsController, PublicEventsController],
  providers: [EventsService],
})
export class EventsModule {}
