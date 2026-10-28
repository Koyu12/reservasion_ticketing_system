import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Patch,
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
  emptyObjectSchema,
  eventFieldsSchema,
  eventIdSchema,
  updateEventSchema,
} from './events.schemas.js';
import type { CreateEventInput, UpdateEventInput } from './events.schemas.js';
import { EventsService } from './events.service.js';

type AdminSession = UserSession<ReturnType<typeof createAuth>>;
const idPipe = new ZodValidationPipe(eventIdSchema);

@Controller('api/admin/events')
@UseGuards(AdminGuard)
@UseFilters(ApplicationExceptionFilter)
export class EventsController {
  constructor(private readonly events: EventsService) {}

  @Get()
  list(
    @Query(new ZodValidationPipe(emptyObjectSchema))
    query: Record<string, never>,
  ) {
    void query;
    return this.events.list();
  }

  @Get(':id')
  get(@Param('id', idPipe) id: string) {
    return this.events.get(id);
  }

  @Post()
  create(
    @Body(new ZodValidationPipe(eventFieldsSchema)) body: CreateEventInput,
    @Session() session: AdminSession,
  ) {
    return this.events.create(body, session.user.id);
  }

  @Patch(':id')
  update(
    @Param('id', idPipe) id: string,
    @Body(new ZodValidationPipe(updateEventSchema)) body: UpdateEventInput,
    @Session() session: AdminSession,
  ) {
    return this.events.update(id, body, session.user.id);
  }

  @Post(':id/publish')
  @HttpCode(200)
  publish(
    @Param('id', idPipe) id: string,
    @Body(new ZodValidationPipe(emptyObjectSchema))
    body: Record<string, never>,
  ) {
    void body;
    return this.events.publish(id);
  }
}
