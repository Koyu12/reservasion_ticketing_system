import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseFilters,
  UseGuards,
} from '@nestjs/common';
import { Session } from '@thallesp/nestjs-better-auth';
import type { UserSession } from '@thallesp/nestjs-better-auth';
import type { createAuth } from '../auth/auth.js';
import { VerifiedEmailGuard } from '../auth/verified-email.guard.js';
import { ApplicationExceptionFilter } from '../common/application-exception.filter.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import {
  bookReservationSchema,
  reservationIdSchema,
  reservationListQuerySchema,
} from './reservations.schemas.js';
import type { BookReservationInput } from './reservations.schemas.js';
import { ReservationsService } from './reservations.service.js';

type AttendeeSession = UserSession<ReturnType<typeof createAuth>>;

@Controller('api/reservations')
@UseFilters(ApplicationExceptionFilter)
export class ReservationsController {
  constructor(private readonly reservations: ReservationsService) {}

  @Post()
  @UseGuards(VerifiedEmailGuard)
  book(
    @Body(new ZodValidationPipe(bookReservationSchema))
    body: BookReservationInput,
    @Session() session: AttendeeSession,
  ) {
    return this.reservations.book(body.eventId, session.user.id);
  }

  @Get()
  list(
    @Query(new ZodValidationPipe(reservationListQuerySchema))
    query: Record<string, never>,
    @Session() session: AttendeeSession,
  ) {
    void query;
    return this.reservations.list(session.user.id);
  }

  @Get(':id')
  get(
    @Param('id', new ZodValidationPipe(reservationIdSchema)) id: string,
    @Session() session: AttendeeSession,
  ) {
    return this.reservations.get(id, session.user.id);
  }
}
