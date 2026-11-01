import { Module } from '@nestjs/common';
import { AppAuthModule } from '../auth/auth.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { CommonModule } from '../common/common.module.js';
import { ReservationsController } from './reservations.controller.js';
import { AdminReservationsController } from './admin-reservations.controller.js';
import { ReservationsService } from './reservations.service.js';

@Module({
  imports: [CommonModule, AppAuthModule, NotificationsModule],
  controllers: [ReservationsController, AdminReservationsController],
  providers: [ReservationsService],
})
export class ReservationsModule {}
