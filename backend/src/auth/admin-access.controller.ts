import { Controller, Get, UseGuards } from '@nestjs/common';
import { AdminGuard } from './admin.guard.js';

@Controller('api/admin')
@UseGuards(AdminGuard)
export class AdminAccessController {
  @Get('access')
  checkAccess() {
    return { allowed: true };
  }
}
