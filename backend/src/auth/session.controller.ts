import { Controller, Get } from '@nestjs/common';
import { Session } from '@thallesp/nestjs-better-auth';
import type { UserSession } from '@thallesp/nestjs-better-auth';
import type { createAuth } from './auth.js';

@Controller('api/session')
export class SessionController {
  @Get()
  getSession(@Session() session: UserSession<ReturnType<typeof createAuth>>) {
    const { id, name, email, emailVerified, role } = session.user;
    return { user: { id, name, email, emailVerified, role } };
  }
}
