import {
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { CanActivate, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { UserSession } from '@thallesp/nestjs-better-auth';
import type { createAuth } from './auth.js';

@Injectable()
export class VerifiedEmailGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<
      Request & {
        session?: UserSession<ReturnType<typeof createAuth>> | null;
      }
    >();
    if (!request.session) throw new UnauthorizedException();
    if (request.session.user.emailVerified !== true) {
      throw new ForbiddenException({
        code: 'EMAIL_NOT_VERIFIED',
        message: 'Verify your email before booking.',
      });
    }
    return true;
  }
}
