import { Controller, Get, Param, Query, UseFilters } from '@nestjs/common';
import { AllowAnonymous } from '@thallesp/nestjs-better-auth';
import { ApplicationExceptionFilter } from '../common/application-exception.filter.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { eventIdSchema, publicEventQuerySchema } from './events.schemas.js';
import type { PublicEventQuery } from './events.schemas.js';
import { EventsService } from './events.service.js';

@Controller('api/events')
@UseFilters(ApplicationExceptionFilter)
export class PublicEventsController {
  constructor(private readonly events: EventsService) {}

  @Get()
  @AllowAnonymous()
  list(
    @Query(new ZodValidationPipe(publicEventQuerySchema))
    query: PublicEventQuery,
  ) {
    return this.events.listPublic(query);
  }

  @Get(':id')
  @AllowAnonymous()
  get(@Param('id', new ZodValidationPipe(eventIdSchema)) id: string) {
    return this.events.getPublic(id);
  }
}
