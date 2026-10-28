import { Module } from '@nestjs/common';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { EmailModule } from './email/email.module.js';
import { AppAuthModule } from './auth/auth.module.js';
import { EventsModule } from './events/events.module.js';

@Module({
  imports: [PrismaModule, EmailModule, AppAuthModule, EventsModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
