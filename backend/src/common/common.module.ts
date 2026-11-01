import { APP_CONFIG, createAppConfig } from './config.js';
import { Module } from '@nestjs/common';
import { PrismaService } from './prisma.service.js';
import { ValidationService } from './validation.service.js';

@Module({
  providers: [{ provide: APP_CONFIG, useFactory: createAppConfig }, PrismaService, ValidationService],
  exports: [APP_CONFIG, PrismaService, ValidationService],
})
export class CommonModule {}
