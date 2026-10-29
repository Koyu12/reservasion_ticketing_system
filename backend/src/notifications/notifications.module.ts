import { Module } from '@nestjs/common';
import { NotificationsService } from './notifications.service.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { EmailModule } from '../email/email.module.js';
import { NotificationSender } from './notification-sender.service.js';
import { AppAuthModule } from '../auth/auth.module.js';
import { NotificationAdminController } from './notification-admin.controller.js';
import { NotificationAdminService } from './notification-admin.service.js';

@Module({
  imports: [PrismaModule, EmailModule, AppAuthModule],
  controllers: [NotificationAdminController],
  providers: [
    NotificationsService,
    NotificationSender,
    NotificationAdminService,
  ],
  exports: [NotificationsService],
})
export class NotificationsModule {}
