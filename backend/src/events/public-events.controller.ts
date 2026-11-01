import { Controller, Get, Param, Query, UseFilters } from '@nestjs/common';
import { AllowAnonymous } from '@thallesp/nestjs-better-auth';
import { ApplicationExceptionFilter } from '../common/application-exception.filter.js';
import { ApiTags, ApiOperation, ApiParam, ApiQuery, ApiResponse } from '@nestjs/swagger';
import { PublicEventQueryDTO } from './events.validation.js';
import { EventsService } from './events.service.js';

@ApiTags('Events')
@ApiResponse({ status: 400, description: 'Invalid request fields' })
@ApiResponse({ status: 500, description: 'Unexpected request failure' })
@Controller('api/events')
@UseFilters(ApplicationExceptionFilter)
export class PublicEventsController {
  constructor(private readonly events: EventsService) {}

  @Get()
  @AllowAnonymous()
  @ApiOperation({ summary: 'Find upcoming published workshops' })
  @ApiQuery({ name: 'q', required: false, type: String })
  @ApiQuery({ name: 'from', required: false, type: String, format: 'date', description: 'First date in WIB (Asia/Jakarta)' })
  @ApiQuery({ name: 'to', required: false, type: String, format: 'date', description: 'Last date in WIB (Asia/Jakarta), inclusive' })
  @ApiResponse({ status: 200, description: 'Successful operation' })
  list(@Query() query: PublicEventQueryDTO) {
    return this.events.listPublic(query);
  }

  @Get(':id')
  @AllowAnonymous()
  @ApiOperation({ summary: 'Get public workshop details' })
  @ApiParam({ name: 'id', type: String, format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Successful operation' })
  @ApiResponse({ status: 404, description: 'Workshop not found' })
  get(@Param('id') id: string) {
    return this.events.getPublic(id);
  }
}
