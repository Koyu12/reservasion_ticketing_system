import { Body, Controller, Get, HttpCode, Param, Post, Query, UseFilters, UseGuards } from '@nestjs/common';
import { Session } from '@thallesp/nestjs-better-auth';
import type { UserSession } from '@thallesp/nestjs-better-auth';
import type { createAuth } from '../auth/auth.js';
import { AdminGuard } from '../auth/admin.guard.js';
import { ApplicationExceptionFilter } from '../common/application-exception.filter.js';
import { ApiTags, ApiCookieAuth, ApiOperation, ApiParam, ApiResponse } from '@nestjs/swagger';
import { AdminCancelReservationDTO } from './reservations.validation.js';
import { ReservationsService } from './reservations.service.js';

@ApiTags('Admin reservations')
@ApiCookieAuth('session')
@ApiResponse({ status: 400, description: 'Invalid request fields' })
@ApiResponse({ status: 401, description: 'Sign-in required' })
@ApiResponse({ status: 403, description: 'Access denied or trusted origin required' })
@ApiResponse({ status: 500, description: 'Unexpected request failure' })
@Controller('api/admin')
@UseGuards(AdminGuard)
@UseFilters(ApplicationExceptionFilter)
export class AdminReservationsController {
  constructor(private readonly reservations: ReservationsService) {}

  @Get('events/:eventId/reservations')
  @ApiOperation({ summary: 'List workshop attendees' })
  @ApiResponse({ status: 200, description: 'Successful operation' })
  @ApiParam({ name: 'eventId', type: String, format: 'uuid', description: 'Workshop UUID' })
  @ApiResponse({ status: 404, description: 'Reservation or workshop not found' })
  list(
    @Param('eventId')
    eventId: string,
    @Query() query: Record<string, never>,
  ) {
    return this.reservations.listForEvent(eventId, query);
  }

  @Post('reservations/:id/cancel')
  @HttpCode(200)
  @ApiOperation({ summary: 'Cancel a reservation as admin' })
  @ApiResponse({ status: 200, description: 'Successful operation' })
  @ApiParam({ name: 'id', type: String, format: 'uuid', description: 'Reservation UUID' })
  @ApiResponse({ status: 404, description: 'Reservation or workshop not found' })
  cancel(@Param('id') id: string, @Body() body: AdminCancelReservationDTO, @Session() session: UserSession<ReturnType<typeof createAuth>>) {
    return this.reservations.cancelAsAdmin(id, session.user.id, body);
  }
}
