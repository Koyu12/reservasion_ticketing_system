import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  UseFilters,
  UseGuards,
} from '@nestjs/common';
import { Session } from '@thallesp/nestjs-better-auth';
import type { UserSession } from '@thallesp/nestjs-better-auth';
import type { createAuth } from '../auth/auth.js';
import { AdminGuard } from '../auth/admin.guard.js';
import { ApplicationExceptionFilter } from '../common/application-exception.filter.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import {
  adminCancelReservationSchema,
  reservationIdSchema,
  reservationListQuerySchema,
} from './reservations.schemas.js';
import type { AdminCancelReservationInput } from './reservations.schemas.js';
import { ReservationsService } from './reservations.service.js';

@Controller('api/admin')
@UseGuards(AdminGuard)
@UseFilters(ApplicationExceptionFilter)
export class AdminReservationsController {
  constructor(private readonly reservations: ReservationsService) {}

  @Get('events/:eventId/reservations')
  list(
    @Param('eventId', new ZodValidationPipe(reservationIdSchema))
    eventId: string,
    @Query(new ZodValidationPipe(reservationListQuerySchema))
    query: Record<string, never>,
  ) {
    void query;
    return this.reservations.listForEvent(eventId);
  }

  @Post('reservations/:id/cancel')
  @HttpCode(200)
  cancel(
    @Param('id', new ZodValidationPipe(reservationIdSchema)) id: string,
    @Body(new ZodValidationPipe(adminCancelReservationSchema))
    body: AdminCancelReservationInput,
    @Session() session: UserSession<ReturnType<typeof createAuth>>,
  ) {
    return this.reservations.cancelAsAdmin(id, session.user.id, body.reason);
  }
}
