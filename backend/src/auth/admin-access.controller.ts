import { ApiTags, ApiCookieAuth, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { Controller, Get, UseGuards } from '@nestjs/common';
import { AdminGuard } from './admin.guard.js';

@ApiTags('Admin access')
@ApiCookieAuth('session')
@Controller('api/admin')
@UseGuards(AdminGuard)
export class AdminAccessController {
  @Get('access')
  @ApiOperation({ summary: 'Check current admin access' })
  @ApiResponse({ status: 200, description: 'Successful operation' })
  @ApiResponse({ status: 401, description: 'Sign-in required' })
  @ApiResponse({ status: 403, description: 'Admin access required' })
  checkAccess() {
    return { allowed: true };
  }
}
