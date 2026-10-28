import { ForbiddenException, Injectable } from '@nestjs/common';
import type { CanActivate, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import { getAuthOrigins } from './auth.js';

@Injectable()
export class ApplicationOriginGuard implements CanActivate {
  private readonly origins = getAuthOrigins();

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    if (
      ['GET', 'HEAD', 'OPTIONS'].includes(request.method) ||
      !request.headers.cookie
    )
      return true;
    let origin = request.get('origin');
    if (!origin && request.get('referer')) {
      try {
        origin = new URL(request.get('referer')!).origin;
      } catch {
        /* Invalid referers fail below. */
      }
    }
    if (!origin || !this.origins.includes(origin)) {
      throw new ForbiddenException('A trusted request origin is required');
    }
    return true;
  }
}
