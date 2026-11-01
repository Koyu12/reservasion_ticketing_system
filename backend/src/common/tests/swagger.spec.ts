import { APP_CONFIG } from '../config.js';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import type { Server } from 'node:http';
import request from 'supertest';
import { AppModule } from '../../app.module.js';
import { PrismaService } from '../prisma.service.js';
import { setupSwagger } from '../../main.js';

type SwaggerDocument = {
  info: { title: string };
  paths: Record<string, Record<'get' | 'post', { security?: unknown; responses: Record<string, { description: string }> }>>;
  components: { securitySchemes: Record<string, unknown>; schemas: Record<string, { properties: Record<string, unknown> }> };
};

describe('Application Swagger', () => {
  let app: INestApplication<Server>;
  const previous: Record<string, string | undefined> = {};

  beforeEach(() => {
    const settings = {
      DATABASE_URL: 'postgresql://unused:unused@localhost:5432/unused',
      BETTER_AUTH_SECRET: 'swagger-test-secret-with-at-least-32-characters',
      BETTER_AUTH_URL: 'http://localhost:3000',
      FRONTEND_URL: 'http://localhost:5173',
      NODE_ENV: 'test',
    };
    for (const [key, value] of Object.entries(settings)) {
      previous[key] = process.env[key];
      process.env[key] = value;
    }
  });
  afterEach(async () => {
    await app?.close();
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  async function start() {
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue({})
      .overrideProvider(APP_CONFIG)
      .useValue({ organizerContactEmail: 'organizer@example.invalid' })
      .compile();
    app = module.createNestApplication({ bodyParser: false, logger: false });
    setupSwagger(app);
    await app.init();
  }

  it('serves UI and typed JSON for documented feature modules without requiring a login', async () => {
    await start();
    const ui = await request(app.getHttpServer()).get('/api/docs/').expect(200);
    expect(ui.text).toContain('swagger-ui');
    const response = await request(app.getHttpServer()).get('/api/docs-json').expect(200);
    const body = response.body as SwaggerDocument;
    expect(body.info.title).toBe('Reservation Ticketing API');
    expect(Object.keys(body.paths)).toHaveLength(16);
    expect(
      Object.keys(body.paths).every(
        (path) =>
          path.startsWith('/api/events') ||
          path.startsWith('/api/admin/events') ||
          path.startsWith('/api/reservations') ||
          path.startsWith('/api/admin/reservations') ||
          path.startsWith('/api/admin/notifications') ||
          path === '/api/session' ||
          path === '/api/admin/access' ||
          path === '/',
      ),
    ).toBe(true);
    expect(body.paths['/api/admin/events'].post.responses['201'].description).toBeTruthy();
    expect(body.paths['/api/admin/events'].post.security).toEqual([{ session: [] }]);
    expect(body.paths['/api/events'].get.security ?? []).toEqual([]);
    expect(body.components.securitySchemes.session).toMatchObject({ in: 'cookie', name: 'better-auth.session_token' });
    expect(body.components.schemas.CreateEventDTO.properties.startsAt).toMatchObject({ type: 'string', format: 'date-time' });
    for (const [path, method] of [
      ['/api/reservations', 'post'],
      ['/api/reservations', 'get'],
      ['/api/reservations/{id}', 'get'],
      ['/api/reservations/{id}/cancel', 'post'],
      ['/api/admin/events/{eventId}/reservations', 'get'],
      ['/api/admin/reservations/{id}/cancel', 'post'],
      ['/api/admin/notifications/failed', 'get'],
      ['/api/admin/notifications/{id}/retry', 'post'],
    ] as const) {
      expect(body.paths[path][method].security).toEqual([{ session: [] }]);
      const status = method === 'post' && path === '/api/reservations' ? '201' : '200';
      expect(body.paths[path][method].responses[status].description).toBeTruthy();
    }
    expect(body.components.schemas.BookReservationDTO.properties.eventId).toMatchObject({ type: 'string', format: 'uuid' });
    expect(body.paths['/api/session'].get.security).toEqual([{ session: [] }]);
    expect(body.paths['/api/admin/access'].get.security).toEqual([{ session: [] }]);
    expect(body.components.schemas).not.toHaveProperty('EventResponse');
    await request(app.getHttpServer()).get('/api/docs-yaml').expect(404);
  });

  it('does not register UI or raw documents in production', async () => {
    process.env.NODE_ENV = 'production';
    await start();
    for (const path of ['/api/docs', '/api/docs-json', '/api/docs-yaml']) {
      await request(app.getHttpServer()).get(path).expect(404);
    }
  });
});
