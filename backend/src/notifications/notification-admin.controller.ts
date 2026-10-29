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
import { z } from 'zod';
import type { createAuth } from '../auth/auth.js';
import { AdminGuard } from '../auth/admin.guard.js';
import { ApplicationExceptionFilter } from '../common/application-exception.filter.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { NotificationAdminService } from './notification-admin.service.js';

const idSchema = z.uuid().toLowerCase();
const emptySchema = z.strictObject({});

@Controller('api/admin/notifications')
@UseGuards(AdminGuard)
@UseFilters(ApplicationExceptionFilter)
export class NotificationAdminController {
  constructor(private readonly notifications: NotificationAdminService) {}

  @Get('failed')
  list(
    @Query(new ZodValidationPipe(emptySchema)) query: Record<string, never>,
  ) {
    void query;
    return this.notifications.listFailed();
  }

  @Post(':id/retry')
  @HttpCode(200)
  retry(
    @Param('id', new ZodValidationPipe(idSchema)) id: string,
    @Body(new ZodValidationPipe(emptySchema)) body: Record<string, never>,
    @Session() session: UserSession<ReturnType<typeof createAuth>>,
  ) {
    void body;
    return this.notifications.retry(id, session.user.id);
  }
}
