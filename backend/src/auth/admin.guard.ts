import {
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { CanActivate, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { UserSession } from '@thallesp/nestjs-better-auth';
import { PrismaService } from '../prisma/prisma.service.js';
import type { createAuth } from './auth.js';

@Injectable()
export class AdminGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<
      Request & {
        session?: UserSession<ReturnType<typeof createAuth>> | null;
      }
    >();
    if (!request.session) throw new UnauthorizedException();
    const user = await this.prisma.user.findUnique({
      where: { id: request.session.user.id },
      select: { role: true },
    });
    if (!user) throw new UnauthorizedException();
    if (user.role !== 'ADMIN')
      throw new ForbiddenException('Admin access is required');
    return true;
  }
}
