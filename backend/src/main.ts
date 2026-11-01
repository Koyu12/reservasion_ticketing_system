import { NestFactory } from '@nestjs/core';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { AppModule } from './app.module.js';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { AppAuthModule } from './auth/auth.module.js';
import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { cleanupOpenApiDoc } from 'nestjs-zod';
import { getCookies } from 'better-auth/cookies';
import { getAuthOrigins } from './auth/auth.js';
import { EventsModule } from './events/events.module.js';
import { NotificationsModule } from './notifications/notifications.module.js';
import { ReservationsModule } from './reservations/reservations.module.js';

export function setupSwagger(app: INestApplication): void {
  if (process.env.NODE_ENV === 'production') return;

  const cookieName = getCookies({ baseURL: getAuthOrigins()[0] }).sessionToken.name;
  const config = new DocumentBuilder()
    .setTitle('Reservation Ticketing API')
    .setDescription(
      'Application API. Admin operations require an existing browser login session and admin access. Sign in through the application on the same host before using protected operations.',
    )
    .setVersion('1.0')
    .addCookieAuth(cookieName, { type: 'apiKey', in: 'cookie' }, 'session')
    .build();

  const document = () =>
    cleanupOpenApiDoc(
      SwaggerModule.createDocument(app, config, {
        include: [AppModule, AppAuthModule, EventsModule, ReservationsModule, NotificationsModule],
      }),
    );
  SwaggerModule.setup('api/docs', app, document, {
    jsonDocumentUrl: 'api/docs-json',
    raw: ['json'],
    swaggerOptions: { withCredentials: true },
  });
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bodyParser: false, bufferLogs: true });
  app.useLogger(app.get(WINSTON_MODULE_NEST_PROVIDER));
  app.enableShutdownHooks();
  setupSwagger(app);
  await app.listen(process.env.PORT ?? 3000);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) void bootstrap();
