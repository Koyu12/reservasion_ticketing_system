import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AuthModule } from '@thallesp/nestjs-better-auth';
import { CommonModule } from '../common/common.module.js';
import { PrismaService } from '../common/prisma.service.js';
import { createAuth } from './auth.js';
import { ApplicationOriginGuard } from './application-origin.guard.js';
import { SessionController } from './session.controller.js';
import { EmailModule } from '../email/email.module.js';
import { EmailService } from '../email/email.service.js';
import { VerifiedEmailGuard } from './verified-email.guard.js';
import { AdminGuard } from './admin.guard.js';
import { AdminAccessController } from './admin-access.controller.js';

@Module({
  imports: [
    CommonModule,
    AuthModule.forRootAsync({
      imports: [CommonModule, EmailModule],
      inject: [PrismaService, EmailService],
      useFactory: (prisma: PrismaService, emailService: EmailService) => ({ auth: createAuth(prisma, emailService) }),
    }),
  ],
  controllers: [SessionController, AdminAccessController],
  providers: [{ provide: APP_GUARD, useClass: ApplicationOriginGuard }, VerifiedEmailGuard, AdminGuard],
  exports: [VerifiedEmailGuard, AdminGuard],
})
export class AppAuthModule {}
