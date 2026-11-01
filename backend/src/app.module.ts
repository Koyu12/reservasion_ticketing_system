import { Module } from '@nestjs/common';
import { WinstonModule } from 'nest-winston';
import { createLoggerOptions } from './common/logger.js';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { CommonModule } from './common/common.module.js';
import { EmailModule } from './email/email.module.js';
import { AppAuthModule } from './auth/auth.module.js';
import { EventsModule } from './events/events.module.js';
import { NotificationsModule } from './notifications/notifications.module.js';
import { ReservationsModule } from './reservations/reservations.module.js';

@Module({
  imports: [
    WinstonModule.forRootAsync({ useFactory: createLoggerOptions }),
    CommonModule,
    EmailModule,
    AppAuthModule,
    EventsModule,
    NotificationsModule,
    ReservationsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
