import { Body, Controller, Get, HttpCode, Param, Post, Query, UseFilters, UseGuards } from '@nestjs/common';
import { Session } from '@thallesp/nestjs-better-auth';
import type { UserSession } from '@thallesp/nestjs-better-auth';
import type { createAuth } from '../auth/auth.js';
import { AdminGuard } from '../auth/admin.guard.js';
import { ApplicationExceptionFilter } from '../common/application-exception.filter.js';
import { ApiTags, ApiCookieAuth, ApiOperation, ApiParam, ApiResponse } from '@nestjs/swagger';
import { EmptyNotificationDTO } from './notifications.validation.js';
import { NotificationAdminService } from './notification-admin.service.js';

@ApiTags('Admin notifications')
@ApiCookieAuth('session')
@ApiResponse({ status: 400, description: 'Invalid request fields' })
@ApiResponse({ status: 401, description: 'Sign-in required' })
@ApiResponse({ status: 403, description: 'Admin access or trusted origin required' })
@ApiResponse({ status: 500, description: 'Unexpected request failure' })
@Controller('api/admin/notifications')
@UseGuards(AdminGuard)
@UseFilters(ApplicationExceptionFilter)
export class NotificationAdminController {
  constructor(private readonly notifications: NotificationAdminService) {}

  @Get('failed')
  @ApiOperation({ summary: 'List failed business emails' })
  @ApiResponse({ status: 200, description: 'Successful operation' })
  list(@Query() query: Record<string, never>) {
    return this.notifications.listFailed(query);
  }

  @Post(':id/retry')
  @HttpCode(200)
  @ApiOperation({ summary: 'Schedule a failed business email for retry' })
  @ApiParam({ name: 'id', type: String, format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Successful operation' })
  @ApiResponse({ status: 404, description: 'Notification not found' })
  @ApiResponse({ status: 409, description: 'Only failed emails can be retried' })
  retry(@Param('id') id: string, @Body() body: EmptyNotificationDTO, @Session() session: UserSession<ReturnType<typeof createAuth>>) {
    return this.notifications.retry(id, session.user.id, body);
  }
}
