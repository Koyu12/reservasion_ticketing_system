import 'dotenv/config';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { jest } from '@jest/globals';
import { randomBytes, randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { EmailService } from '../src/email/email.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { NotificationSender } from '../src/notifications/notification-sender.service.js';
import type { EmailJob } from '../src/generated/prisma/client.js';
import { requireTestDatabaseUrl } from './test-database.js';

describe('Admin failed notifications (PostgreSQL)', () => {
  let app: INestApplication<Server>;
  let prisma: PrismaService;
  let sender: NotificationSender;
  const send = jest
    .fn<EmailService['send']>()
    .mockResolvedValue({ id: 'mock-email' });
  const users: { id: string; cookie: string[] }[] = [];
  const origin = 'http://localhost:5173';
  const previous: Record<string, string | undefined> = {};
  let eventId: string;
  let job: EmailJob;

  beforeAll(async () => {
    const settings = {
      DATABASE_URL: requireTestDatabaseUrl(
        process.env.TEST_DATABASE_URL,
        process.env.DATABASE_URL,
      ),
      BETTER_AUTH_SECRET: randomBytes(32).toString('hex'),
      BETTER_AUTH_URL: 'http://localhost:3000',
      FRONTEND_URL: origin,
      ORGANIZER_CONTACT_EMAIL: 'organizer@example.invalid',
      EMAIL_WORKER_ENABLED: 'false',
    };
    for (const [key, value] of Object.entries(settings)) {
      previous[key] = process.env[key];
      process.env[key] = value;
    }
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(EmailService)
      .useValue({ send })
      .compile();
    app = module.createNestApplication({ bodyParser: false });
    prisma = app.get(PrismaService);
    sender = app.get(NotificationSender);
    await app.init();
    for (const role of ['ADMIN', 'ATTENDEE'] as const) {
      const response = await request(app.getHttpServer())
        .post('/api/auth/sign-up/email')
        .set('Origin', origin)
        .send({
          name: `Email ${role}`,
          email: `email-admin-${randomUUID()}@example.invalid`,
          password: 'Notification-test-password-123!',
        })
        .expect(200);
      const body = response.body as { user: { id: string } };
      users.push({
        id: body.user.id,
        cookie: (response.headers['set-cookie'] as unknown as string[]).map(
          (cookie) => cookie.split(';')[0],
        ),
      });
      await prisma.user.update({
        where: { id: body.user.id },
        data: { role, emailVerified: true },
      });
    }
  });

  beforeEach(async () => {
    const event = await prisma.event.create({
      data: {
        createdById: users[0].id,
        title: 'Admin email workshop',
        description: 'Test',
        venueName: 'Sample hall',
        venueAddress: 'Sample address',
        capacity: 10,
        status: 'PUBLISHED',
        startsAt: new Date('2035-01-10T02:00:00Z'),
        endsAt: new Date('2035-01-10T05:00:00Z'),
        registrationClosesAt: new Date('2035-01-09T02:00:00Z'),
      },
    });
    eventId = event.id;
    const booking = await prisma.reservation.create({
      data: {
        eventId,
        userId: users[1].id,
        bookingReference: randomUUID(),
        bookedRevision: 0,
      },
    });
    job = await prisma.emailJob.create({
      data: {
        reservationId: booking.id,
        type: 'BOOKING_CONFIRMED',
        recipientEmail: 'attendee@example.invalid',
        deduplicationKey: `BOOKING_CONFIRMED:${booking.id}`,
        status: 'FAILED',
        attemptCount: 8,
        retryCycleAttemptCount: 5,
        lastAttemptAt: new Date(),
        lastError: 'Email delivery request failed',
      },
    });
    send.mockClear();
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    const event = { createdById: users[0].id };
    await prisma.emailJob.deleteMany({ where: { reservation: { event } } });
    await prisma.reservation.deleteMany({ where: { event } });
    await prisma.event.deleteMany({ where: event });
    await prisma.user.update({
      where: { id: users[0].id },
      data: { role: 'ADMIN' },
    });
  });
  afterAll(async () => {
    try {
      await prisma?.user.deleteMany({
        where: { id: { in: users.map((user) => user.id) } },
      });
    } finally {
      await app?.close();
      for (const [key, value] of Object.entries(previous)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  });

  function retry(id = job.id, body: Record<string, unknown> = {}) {
    return request(app.getHttpServer())
      .post(`/api/admin/notifications/${id}/retry`)
      .set('Cookie', users[0].cookie)
      .set('Origin', origin)
      .send(body);
  }
  const read = () =>
    prisma.emailJob.findUniqueOrThrow({ where: { id: job.id } });

  it('protects both operations from anonymous users and attendees', async () => {
    for (const user of [null, users[1]]) {
      const list = request(app.getHttpServer()).get(
        '/api/admin/notifications/failed',
      );
      if (user) list.set('Cookie', user.cookie);
      await list.expect(user ? 403 : 401);
      const action = request(app.getHttpServer())
        .post(`/api/admin/notifications/${job.id}/retry`)
        .set('Origin', origin);
      if (user) action.set('Cookie', user.cookie);
      await action.send({}).expect(user ? 403 : 401);
    }
    expect((await read()).status).toBe('FAILED');
  });

  it('checks the current admin role and trusted mutation origin', async () => {
    await request(app.getHttpServer())
      .post(`/api/admin/notifications/${job.id}/retry`)
      .set('Cookie', users[0].cookie)
      .set('Origin', 'https://untrusted.example')
      .send({})
      .expect(403);
    await prisma.user.update({
      where: { id: users[0].id },
      data: { role: 'ATTENDEE' },
    });
    await retry().expect(403);
  });

  it('lists useful metadata without exposing claim/session/auth data', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/admin/notifications/failed')
      .set('Cookie', users[0].cookie)
      .expect(200);
    const body = response.body as { jobs: Record<string, unknown>[] };
    expect(body.jobs).toHaveLength(1);
    expect(body.jobs[0]).toMatchObject({
      id: job.id,
      status: 'FAILED',
      recipientEmail: job.recipientEmail,
      attemptCount: 8,
      retryCycleAttemptCount: 5,
      lastError: 'Email delivery request failed',
      reservation: { event: { title: 'Admin email workshop' } },
    });
    for (const field of [
      'claimToken',
      'claimExpiresAt',
      'deduplicationKey',
      'password',
      'token',
      'providerMessageId',
    ])
      expect(body.jobs[0]).not.toHaveProperty(field);
    await retry().expect(200);
    const empty = await request(app.getHttpServer())
      .get('/api/admin/notifications/failed')
      .set('Cookie', users[0].cookie)
      .expect(200);
    expect(empty.body).toEqual({ jobs: [] });
  });

  it('retains logical identity and total attempts while recording the real admin', async () => {
    const beforeBooking = await prisma.reservation.findUniqueOrThrow({
      where: { id: job.reservationId },
    });
    const response = await retry().expect(200);
    expect(response.body).toEqual({ job: { id: job.id, status: 'PENDING' } });
    expect(await read()).toMatchObject({
      status: 'PENDING',
      deduplicationKey: job.deduplicationKey,
      attemptCount: 8,
      retryCycleAttemptCount: 0,
      lastManualRetryById: users[0].id,
    });
    expect((await read()).lastManualRetryAt).toBeInstanceOf(Date);
    expect(send).not.toHaveBeenCalled();
    await sender.runOnce();
    expect(await read()).toMatchObject({
      status: 'SENT',
      attemptCount: 9,
      retryCycleAttemptCount: 1,
    });
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({ idempotencyKey: `email-job/${job.id}` }),
    );
    expect(
      await prisma.reservation.findUnique({ where: { id: job.reservationId } }),
    ).toEqual(beforeBooking);
  });

  it('concurrent retries accept one request without losing total attempts', async () => {
    const responses = await Promise.all([retry(), retry()]);
    expect(responses.map((response) => response.status).sort()).toEqual([
      200, 409,
    ]);
    expect(await read()).toMatchObject({
      attemptCount: 8,
      retryCycleAttemptCount: 0,
      status: 'PENDING',
    });
  });

  it('validates UUID, empty body, query parameters, and missing jobs', async () => {
    await retry('not-a-uuid').expect(400);
    await retry(job.id, { attemptCount: 0, role: 'ADMIN' }).expect(400);
    await request(app.getHttpServer())
      .get('/api/admin/notifications/failed?status=SENT')
      .set('Cookie', users[0].cookie)
      .expect(400);
    await retry(randomUUID()).expect(404);
    expect((await read()).status).toBe('FAILED');
  });

  it.each(['PENDING', 'PROCESSING', 'SENT', 'SKIPPED'] as const)(
    'rejects retry of %s',
    async (status) => {
      await prisma.emailJob.update({
        where: { id: job.id },
        data: {
          status,
          nextAttemptAt: status === 'PENDING' ? new Date() : null,
          claimToken: status === 'PROCESSING' ? randomUUID() : null,
          claimExpiresAt:
            status === 'PROCESSING' ? new Date(Date.now() + 60_000) : null,
          sentAt: status === 'SENT' ? new Date() : null,
          skippedAt: status === 'SKIPPED' ? new Date() : null,
          skipReason:
            status === 'SKIPPED' ? 'Reservation was cancelled.' : null,
        },
      });
      await retry().expect(409);
      expect((await read()).status).toBe(status);
    },
  );

  it('manual retry racing recovery has one coherent transition', async () => {
    await prisma.emailJob.update({
      where: { id: job.id },
      data: {
        status: 'PROCESSING',
        claimToken: randomUUID(),
        claimExpiresAt: new Date(Date.now() - 1000),
      },
    });
    const [, response] = await Promise.all([sender.recoverExpired(), retry()]);
    expect([200, 409]).toContain(response.status);
    expect((await read()).status).toBe(
      response.status === 200 ? 'PENDING' : 'FAILED',
    );
    expect((await read()).attemptCount).toBe(8);
  });

  it('manual retry still skips obsolete messages', async () => {
    await prisma.reservation.update({
      where: { id: job.reservationId },
      data: {
        status: 'CANCELLED',
        cancelledAt: new Date(),
        cancelledById: users[1].id,
        cancellationSource: 'SELF_SERVICE',
      },
    });
    await retry().expect(200);
    await sender.runOnce();
    expect(await read()).toMatchObject({
      status: 'SKIPPED',
      attemptCount: 8,
      retryCycleAttemptCount: 0,
    });
    expect(send).not.toHaveBeenCalled();
  });

  it('a stale sender cannot overwrite a manually retried job', async () => {
    await prisma.emailJob.update({
      where: { id: job.id },
      data: {
        status: 'PROCESSING',
        claimToken: randomUUID(),
        claimExpiresAt: new Date(Date.now() - 1000),
      },
    });
    const stale = await read();
    await sender.recoverExpired();
    await retry().expect(200);
    await sender.deliver(stale);
    expect(await read()).toMatchObject({
      status: 'PENDING',
      attemptCount: 8,
      retryCycleAttemptCount: 0,
    });
    expect(send).not.toHaveBeenCalled();
  });
});
