import { Body, Controller, Get, HttpCode, Param, Post, Query, UseFilters, UseGuards } from '@nestjs/common';
import { Session } from '@thallesp/nestjs-better-auth';
import type { UserSession } from '@thallesp/nestjs-better-auth';
import type { createAuth } from '../auth/auth.js';
import { VerifiedEmailGuard } from '../auth/verified-email.guard.js';
import { ApplicationExceptionFilter } from '../common/application-exception.filter.js';
import { ApiTags, ApiCookieAuth, ApiOperation, ApiParam, ApiResponse } from '@nestjs/swagger';
import { BookReservationDTO, EmptyReservationDTO } from './reservations.validation.js';
import { ReservationsService } from './reservations.service.js';

type AttendeeSession = UserSession<ReturnType<typeof createAuth>>;

@ApiTags('Reservations')
@ApiCookieAuth('session')
@ApiResponse({ status: 400, description: 'Invalid request fields' })
@ApiResponse({ status: 401, description: 'Sign-in required' })
@ApiResponse({ status: 403, description: 'Access denied or trusted origin required' })
@ApiResponse({ status: 500, description: 'Unexpected request failure' })
@Controller('api/reservations')
@UseFilters(ApplicationExceptionFilter)
export class ReservationsController {
  constructor(private readonly reservations: ReservationsService) {}

  @Post()
  @UseGuards(VerifiedEmailGuard)
  @ApiOperation({ summary: 'Reserve one workshop place' })
  @ApiResponse({ status: 201, description: 'Successful operation' })
  @ApiResponse({ status: 404, description: 'Reservation or workshop not found' })
  @ApiResponse({ status: 409, description: 'Operation conflicts with current reservation or workshop state' })
  @ApiResponse({ status: 503, description: 'Required service or booking reference is unavailable' })
  book(@Body() body: BookReservationDTO, @Session() session: AttendeeSession) {
    return this.reservations.book(body, session.user.id);
  }

  @Get()
  @ApiOperation({ summary: 'List personal current and past reservations' })
  @ApiResponse({ status: 200, description: 'Successful operation' })
  list(@Query() query: Record<string, never>, @Session() session: AttendeeSession) {
    return this.reservations.list(session.user.id, query);
  }

  @Post(':id/cancel')
  @HttpCode(200)
  @ApiOperation({ summary: 'Cancel an owned reservation' })
  @ApiResponse({ status: 200, description: 'Successful operation' })
  @ApiParam({ name: 'id', type: String, format: 'uuid', description: 'Reservation UUID' })
  @ApiResponse({ status: 404, description: 'Reservation or workshop not found' })
  @ApiResponse({ status: 409, description: 'Operation conflicts with current reservation or workshop state' })
  cancel(@Param('id') id: string, @Body() body: EmptyReservationDTO, @Session() session: AttendeeSession) {
    return this.reservations.cancel(id, session.user.id, body);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get an owned reservation' })
  @ApiResponse({ status: 200, description: 'Successful operation' })
  @ApiParam({ name: 'id', type: String, format: 'uuid', description: 'Reservation UUID' })
  @ApiResponse({ status: 404, description: 'Reservation or workshop not found' })
  get(@Param('id') id: string, @Session() session: AttendeeSession) {
    return this.reservations.get(id, session.user.id);
  }
}
