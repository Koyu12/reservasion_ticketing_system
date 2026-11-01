import { ApiTags, ApiCookieAuth, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { Controller, Get } from '@nestjs/common';
import { Session } from '@thallesp/nestjs-better-auth';
import type { UserSession } from '@thallesp/nestjs-better-auth';
import type { createAuth } from './auth.js';

@ApiTags('Session')
@ApiCookieAuth('session')
@Controller('api/session')
export class SessionController {
  @Get()
  @ApiOperation({ summary: 'Get current session user' })
  @ApiResponse({ status: 200, description: 'Successful operation' })
  @ApiResponse({ status: 401, description: 'Sign-in required' })
  getSession(@Session() session: UserSession<ReturnType<typeof createAuth>>) {
    const { id, name, email, emailVerified, role } = session.user;
    return { user: { id, name, email, emailVerified, role } };
  }
}
