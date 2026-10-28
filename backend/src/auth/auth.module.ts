import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AuthModule } from '@thallesp/nestjs-better-auth';
import { PrismaModule } from '../prisma/prisma.module.js';
import { PrismaService } from '../prisma/prisma.service.js';
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
    PrismaModule,
    AuthModule.forRootAsync({
      imports: [PrismaModule, EmailModule],
      inject: [PrismaService, EmailService],
      useFactory: (prisma: PrismaService, emailService: EmailService) => ({
        auth: createAuth(prisma, emailService),
      }),
    }),
  ],
  controllers: [SessionController, AdminAccessController],
  providers: [
    { provide: APP_GUARD, useClass: ApplicationOriginGuard },
    VerifiedEmailGuard,
    AdminGuard,
  ],
  exports: [VerifiedEmailGuard, AdminGuard],
})
export class AppAuthModule {}
