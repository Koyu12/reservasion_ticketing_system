import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query, UseFilters, UseGuards } from '@nestjs/common';
import { Session } from '@thallesp/nestjs-better-auth';
import type { UserSession } from '@thallesp/nestjs-better-auth';
import type { createAuth } from '../auth/auth.js';
import { AdminGuard } from '../auth/admin.guard.js';
import { ApplicationExceptionFilter } from '../common/application-exception.filter.js';
import { ApiTags, ApiOperation, ApiParam, ApiResponse, ApiCookieAuth } from '@nestjs/swagger';
import { CreateEventDTO, UpdateEventDTO, CancelEventDTO, EmptyEventDTO } from './events.validation.js';
import { EventsService } from './events.service.js';

type AdminSession = UserSession<ReturnType<typeof createAuth>>;

@ApiTags('Admin events')
@ApiCookieAuth('session')
@ApiResponse({ status: 400, description: 'Invalid request fields' })
@ApiResponse({ status: 401, description: 'Sign-in required' })
@ApiResponse({ status: 403, description: 'Admin access or trusted origin required' })
@ApiResponse({ status: 500, description: 'Unexpected request failure' })
@Controller('api/admin/events')
@UseGuards(AdminGuard)
@UseFilters(ApplicationExceptionFilter)
export class EventsController {
  constructor(private readonly events: EventsService) {}

  @Get()
  @ApiOperation({ summary: 'List admin workshops' })
  @ApiResponse({ status: 200, description: 'Successful operation' })
  list(@Query() query: Record<string, never>) {
    return this.events.list(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get workshop for editing' })
  @ApiResponse({ status: 404, description: 'Workshop not found' })
  @ApiResponse({ status: 200, description: 'Successful operation' })
  @ApiParam({ name: 'id', format: 'uuid', type: String })
  get(@Param('id') id: string) {
    return this.events.get(id);
  }

  @Post()
  @ApiOperation({ summary: 'Create a draft workshop' })
  @ApiResponse({ status: 409, description: 'Workshop operation conflicts with its current state' })
  @ApiResponse({ status: 201, description: 'Successful operation' })
  create(@Body() body: CreateEventDTO, @Session() session: AdminSession) {
    return this.events.create(body, session.user.id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a workshop' })
  @ApiResponse({ status: 409, description: 'Workshop operation conflicts with its current state' })
  @ApiResponse({ status: 404, description: 'Workshop not found' })
  @ApiResponse({ status: 200, description: 'Successful operation' })
  @ApiParam({ name: 'id', format: 'uuid', type: String })
  update(@Param('id') id: string, @Body() body: UpdateEventDTO, @Session() session: AdminSession) {
    return this.events.update(id, body, session.user.id);
  }

  @Post(':id/cancel')
  @HttpCode(200)
  @ApiOperation({ summary: 'Cancel a published workshop' })
  @ApiResponse({ status: 409, description: 'Workshop operation conflicts with its current state' })
  @ApiResponse({ status: 404, description: 'Workshop not found' })
  @ApiResponse({ status: 200, description: 'Successful operation' })
  @ApiParam({ name: 'id', format: 'uuid', type: String })
  cancel(@Param('id') id: string, @Body() body: CancelEventDTO, @Session() session: AdminSession) {
    return this.events.cancel(id, body, session.user.id);
  }

  @Post(':id/publish')
  @HttpCode(200)
  @ApiOperation({ summary: 'Publish a workshop' })
  @ApiResponse({ status: 409, description: 'Workshop operation conflicts with its current state' })
  @ApiResponse({ status: 404, description: 'Workshop not found' })
  @ApiResponse({ status: 200, description: 'Successful operation' })
  @ApiParam({ name: 'id', format: 'uuid', type: String })
  publish(@Param('id') id: string, @Body() body: EmptyEventDTO) {
    return this.events.publish(id, body);
  }
}
