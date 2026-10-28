import 'dotenv/config';
import { Logger } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { jest } from '@jest/globals';
import { randomBytes, randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import { Client } from 'pg';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { EmailService } from '../src/email/email.service.js';
import { EventsService } from '../src/events/events.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { requireTestDatabaseUrl } from './test-database.js';

type EventResponse = {
  event: {
    id: string;
    title: string;
    status: string;
    startsAt: string;
    endsAt: string;
    venueName: string;
    venueAddress: string;
    capacity: number;
    scheduleRevision: number;
    confirmedCount: number;
  };
  organizerContactEmail: string;
};

describe('Admin workshops (PostgreSQL)', () => {
  let app: INestApplication<Server>;
  let prisma: PrismaService;
  let service: EventsService;
  let adminId: string;
  let attendeeId: string;
  let adminCookie: string[];
  let attendeeCookie: string[];
  let databaseUrl: string;
  const origin = 'http://localhost:5173';
  const previous: Record<string, string | undefined> = {};
  const users: string[] = [];
  const prefix = '/api/admin/events';

  beforeAll(async () => {
    databaseUrl = requireTestDatabaseUrl(
      process.env.TEST_DATABASE_URL,
      process.env.DATABASE_URL,
    );
    const settings = {
      DATABASE_URL: databaseUrl,
      BETTER_AUTH_SECRET: randomBytes(32).toString('hex'),
      BETTER_AUTH_URL: 'http://localhost:3000',
      FRONTEND_URL: origin,
      ORGANIZER_CONTACT_EMAIL: 'organizer@example.invalid',
    };
    for (const [key, value] of Object.entries(settings)) {
      previous[key] = process.env[key];
      process.env[key] = value;
    }
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(EmailService)
      .useValue({ send: () => Promise.resolve({ id: 'mock-message' }) })
      .compile();
    app = module.createNestApplication({ bodyParser: false });
    prisma = app.get(PrismaService);
    service = app.get(EventsService);
    expect(
      (
        await prisma.$queryRaw<
          { database: string }[]
        >`SELECT current_database() AS database`
      )[0].database,
    ).toBe('reservation_ticketing_system_test');
    await app.init();
    for (const role of ['ADMIN', 'ATTENDEE'] as const) {
      const response = await request(app.getHttpServer())
        .post('/api/auth/sign-up/email')
        .set('Origin', origin)
        .send({
          name: `Workshop ${role}`,
          email: `events-${randomUUID()}@example.invalid`,
          password: 'Events-test-password-123!',
        })
        .expect(200);
      const { user } = response.body as { user: { id: string } };
      users.push(user.id);
      const cookies = (
        response.headers['set-cookie'] as unknown as string[]
      ).map((value) => value.split(';')[0]);
      if (role === 'ADMIN') {
        adminId = user.id;
        adminCookie = cookies;
        await prisma.user.update({ where: { id: user.id }, data: { role } });
      } else {
        attendeeId = user.id;
        attendeeCookie = cookies;
      }
    }
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });
  afterAll(async () => {
    try {
      if (prisma && users.length) {
        const events = { createdById: { in: users } };
        await prisma.eventChange.deleteMany({ where: { event: events } });
        await prisma.reservation.deleteMany({ where: { event: events } });
        await prisma.event.deleteMany({ where: events });
        await prisma.user.deleteMany({ where: { id: { in: users } } });
      }
    } finally {
      await app?.close();
      for (const [key, value] of Object.entries(previous)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  });

  function valid() {
    return {
      title: 'Practical workshop',
      description: 'Learn together in person.',
      venueName: 'Workshop room',
      venueAddress: '10 Example Road',
      capacity: 5,
      startsAt: new Date(Date.now() + 3 * 86400000).toISOString(),
      endsAt: new Date(Date.now() + 3 * 86400000 + 3600000).toISOString(),
      registrationClosesAt: new Date(Date.now() + 2 * 86400000).toISOString(),
    };
  }
  function post(path: string, data: unknown, cookie = adminCookie) {
    return request(app.getHttpServer())
      .post(`${prefix}${path}`)
      .set('Origin', origin)
      .set('Cookie', cookie)
      .send(data);
  }
  function patch(id: string, data: unknown) {
    return request(app.getHttpServer())
      .patch(`${prefix}/${id}`)
      .set('Origin', origin)
      .set('Cookie', adminCookie)
      .send(data);
  }
  async function draft(extra: Record<string, unknown> = {}) {
    const response = await post('', { ...valid(), ...extra }).expect(201);
    return (response.body as EventResponse).event;
  }

  it('rejects anonymous, attendee, stale admin roles, and untrusted origins', async () => {
    await request(app.getHttpServer()).get(prefix).expect(401);
    await request(app.getHttpServer())
      .get(prefix)
      .set('Cookie', attendeeCookie)
      .expect(403);
    await post('', valid(), attendeeCookie).expect(403);
    await request(app.getHttpServer())
      .post(prefix)
      .set('Origin', 'https://untrusted.invalid')
      .set('Cookie', adminCookie)
      .send(valid())
      .expect(403);
    await prisma.user.update({
      where: { id: adminId },
      data: { role: 'ATTENDEE' },
    });
    try {
      await post('', valid()).expect(403);
    } finally {
      await prisma.user.update({
        where: { id: adminId },
        data: { role: 'ADMIN' },
      });
    }
  });

  it('rejects malformed fields, server-owned input, and invalid schedule/deadline values', async () => {
    for (const invalid of [
      { title: ' ' },
      { capacity: 0 },
      { capacity: 1.2 },
      { capacity: 2147483648 },
      { startsAt: '2030-02-30T09:00:00+07:00' },
      { startsAt: '2030-01-01T09:00' },
      { status: 'PUBLISHED' },
      { createdById: attendeeId },
      { scheduleRevision: 10 },
      { cancelledAt: new Date().toISOString() },
      { role: 'ADMIN' },
    ])
      await post('', { ...valid(), ...invalid }).expect(400);
    const fields = valid();
    await post('', { ...fields, endsAt: fields.startsAt }).expect(400);
    await post('', { ...fields, registrationClosesAt: fields.endsAt }).expect(
      400,
    );
    await request(app.getHttpServer())
      .get(`${prefix}/bad-id`)
      .set('Cookie', adminCookie)
      .expect(400);
    await request(app.getHttpServer())
      .get(`${prefix}/${randomUUID()}`)
      .set('Cookie', adminCookie)
      .expect(404);
    const event = await draft();
    await patch(event.id, {}).expect(400);
    await patch(event.id, { reason: 'Only a reason' }).expect(400);
    await patch(event.id, { endsAt: event.startsAt }).expect(400);
    await post(`/${event.id}/publish`, { status: 'PUBLISHED' }).expect(400);
  });

  it('creates complete drafts, preserves WIB instants, lists, edits, and publishes', async () => {
    const event = await draft({
      startsAt: '2035-01-20T09:00:00+07:00',
      endsAt: '2035-01-20T10:00:00+07:00',
      registrationClosesAt: '2035-01-19T09:00:00+07:00',
    });
    expect(event).toMatchObject({
      status: 'DRAFT',
      scheduleRevision: 0,
      confirmedCount: 0,
      startsAt: '2035-01-20T02:00:00.000Z',
    });
    expect(
      (await prisma.event.findUniqueOrThrow({ where: { id: event.id } }))
        .createdById,
    ).toBe(adminId);
    await patch(event.id, {
      title: 'Updated title',
      description: 'Updated description',
      capacity: 8,
    }).expect(200);
    const published = await post(`/${event.id}/publish`, {}).expect(200);
    expect((published.body as EventResponse).event).toMatchObject({
      status: 'PUBLISHED',
      scheduleRevision: 0,
      capacity: 8,
    });
    await post(`/${event.id}/publish`, {}).expect(200);
    expect(
      await prisma.eventChange.count({ where: { eventId: event.id } }),
    ).toBe(0);
    const list = await request(app.getHttpServer())
      .get(prefix)
      .set('Cookie', adminCookie)
      .expect(200);
    const listed = list.body as {
      organizerContactEmail: string;
      events: { id: string }[];
    };
    expect(listed.organizerContactEmail).toBe('organizer@example.invalid');
    expect(listed.events.some((item) => item.id === event.id)).toBe(true);
    await patch(event.id, { description: 'Published ordinary edit' }).expect(
      200,
    );
    await patch(event.id, { venueName: 'New venue', reason: 'Moving' }).expect(
      409,
    );
    await patch(event.id, { startsAt: event.startsAt }).expect(200);
    await request(app.getHttpServer())
      .get('/api/auth/get-session')
      .set('Cookie', adminCookie)
      .expect(200);
  });

  it('preserves one complete history row per actual significant change', async () => {
    const event = await draft();
    await patch(event.id, { venueName: 'Second room' }).expect(400);
    await patch(event.id, { venueName: 'Second room', reason: '  ' }).expect(
      400,
    );
    const nextStart = new Date(
      new Date(event.startsAt).getTime() + 60000,
    ).toISOString();
    await patch(event.id, {
      venueName: 'Second room',
      startsAt: nextStart,
      reason: 'More room',
    }).expect(200);
    await patch(event.id, {
      venueName: 'Second room',
      startsAt: nextStart,
    }).expect(200);
    await patch(event.id, {
      venueName: event.venueName,
      startsAt: event.startsAt,
      reason: 'Restore original details',
    }).expect(200);
    const changes = await prisma.eventChange.findMany({
      where: { eventId: event.id },
      orderBy: { revision: 'asc' },
    });
    expect(changes).toHaveLength(2);
    expect(changes[0]).toMatchObject({
      revision: 1,
      changedById: adminId,
      oldVenueName: event.venueName,
      newVenueName: 'Second room',
      oldVenueAddress: event.venueAddress,
      newVenueAddress: event.venueAddress,
      oldStartsAt: new Date(event.startsAt),
      newStartsAt: new Date(nextStart),
      oldEndsAt: new Date(event.endsAt),
      newEndsAt: new Date(event.endsAt),
    });
    expect(changes[1]).toMatchObject({
      revision: 2,
      oldVenueName: 'Second room',
      newVenueName: event.venueName,
    });
    expect(
      (await prisma.event.findUniqueOrThrow({ where: { id: event.id } }))
        .scheduleRevision,
    ).toBe(2);
  });

  it('rejects capacity below confirmed reservations and permits equality', async () => {
    const event = await draft();
    await prisma.reservation.createMany({
      data: [adminId, attendeeId].map((userId) => ({
        eventId: event.id,
        userId,
        bookedRevision: 0,
        bookingReference: randomUUID(),
      })),
    });
    await patch(event.id, { capacity: 1 }).expect(409);
    const response = await patch(event.id, { capacity: 2 }).expect(200);
    expect((response.body as EventResponse).event).toMatchObject({
      capacity: 2,
      confirmedCount: 2,
    });
  });

  it('rolls back history if the corresponding event mutation fails', async () => {
    const event = await draft();
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    jest
      .spyOn(prisma, '$transaction')
      .mockRejectedValueOnce(new Error('database credentials secret'));
    const failed = await patch(event.id, { title: 'Failure' }).expect(500);
    expect(JSON.stringify(failed.body)).not.toContain('secret');
    jest.restoreAllMocks();
    // A missing history actor makes the history insert fail inside the real transaction.
    await expect(
      service.update(
        event.id,
        { venueName: 'Never saved', reason: 'Test rollback' },
        'missing-admin',
      ),
    ).rejects.toThrow();
    expect(
      await prisma.eventChange.count({ where: { eventId: event.id } }),
    ).toBe(0);
    expect(
      (await prisma.event.findUniqueOrThrow({ where: { id: event.id } }))
        .venueName,
    ).toBe(event.venueName);
    // Fail after history insertion to prove that insertion rolls back too.
    await expect(
      service.update(
        event.id,
        { venueName: 'Never saved', reason: 'Test rollback', capacity: 0 },
        adminId,
      ),
    ).rejects.toThrow();
    expect(
      await prisma.eventChange.count({ where: { eventId: event.id } }),
    ).toBe(0);
  });

  it('enforces future creation, publication deadlines, and edit cutoffs', async () => {
    await post('', {
      ...valid(),
      startsAt: new Date(Date.now() - 1000).toISOString(),
      registrationClosesAt: new Date(Date.now() - 2000).toISOString(),
    }).expect(409);
    const closed = await draft({
      registrationClosesAt: new Date(Date.now() - 1000).toISOString(),
    });
    await post(`/${closed.id}/publish`, {}).expect(409);
    const event = await draft();
    await post(`/${event.id}/publish`, {}).expect(200);
    const starts = new Date(event.startsAt).getTime();
    const clock = jest.spyOn(Date, 'now').mockReturnValue(starts - 1);
    await patch(event.id, { description: 'Just before start' }).expect(200);
    clock.mockReturnValue(starts);
    await patch(event.id, { description: 'At start' }).expect(409);
    clock.mockReturnValue(starts + 1);
    await patch(event.id, { description: 'After start' }).expect(409);
    clock.mockRestore();
    const cancelled = await draft();
    await prisma.event.update({
      where: { id: cancelled.id },
      data: {
        status: 'CANCELLED',
        cancelledAt: new Date(),
        cancelledById: adminId,
        cancellationReason: 'Test cancellation',
      },
    });
    await patch(cancelled.id, { title: 'Reopen' }).expect(409);
    await post(`/${cancelled.id}/publish`, {}).expect(409);
  });

  async function lockedRequest(
    eventId: string,
    operation: () => PromiseLike<unknown>,
    beforeRelease: () => void,
  ) {
    const blocker = new Client({
      connectionString: databaseUrl,
      connectionTimeoutMillis: 5000,
    });
    await blocker.connect();
    let pending: Promise<unknown> | undefined;
    try {
      await blocker.query('BEGIN');
      await blocker.query(
        'SELECT "id" FROM "Event" WHERE "id" = $1::uuid FOR UPDATE',
        [eventId],
      );
      pending = Promise.resolve(operation());
      let waiting = false;
      for (let attempt = 0; attempt < 100; attempt++) {
        await blocker.query('SELECT pg_stat_clear_snapshot()');
        const result = await blocker.query<{
          waiting: boolean;
        }>(`SELECT EXISTS (
          SELECT 1 FROM pg_stat_activity WHERE datname = current_database()
          AND pid <> pg_backend_pid() AND wait_event_type = 'Lock'
          AND query LIKE '%FROM "Event"%FOR UPDATE%') AS waiting`);
        if (result.rows[0].waiting) {
          waiting = true;
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      expect(waiting).toBe(true);
      beforeRelease();
      await blocker.query('COMMIT');
      await pending;
    } finally {
      await blocker.query('ROLLBACK');
      await blocker.end();
      await pending?.catch(() => undefined);
    }
  }

  it('rechecks publication time after waiting for the event lock', async () => {
    const event = await draft();
    const stored = await prisma.event.findUniqueOrThrow({
      where: { id: event.id },
    });
    await lockedRequest(
      event.id,
      () => post(`/${event.id}/publish`, {}).expect(409),
      () => {
        jest
          .spyOn(Date, 'now')
          .mockReturnValue(stored.registrationClosesAt.getTime());
      },
    );
    expect(
      (await prisma.event.findUniqueOrThrow({ where: { id: event.id } }))
        .status,
    ).toBe('DRAFT');
  });

  it('rechecks the edit cutoff after waiting for the event lock', async () => {
    const event = await draft();
    await lockedRequest(
      event.id,
      () => patch(event.id, { capacity: 8 }).expect(409),
      () => {
        jest
          .spyOn(Date, 'now')
          .mockReturnValue(new Date(event.startsAt).getTime());
      },
    );
    expect(
      (await prisma.event.findUniqueOrThrow({ where: { id: event.id } }))
        .capacity,
    ).toBe(5);
  });

  it('serializes simultaneous significant draft edits into consecutive history', async () => {
    const event = await draft();
    await Promise.all([
      patch(event.id, { venueName: 'Room A', reason: 'First update' }).expect(
        200,
      ),
      patch(event.id, { venueName: 'Room B', reason: 'Second update' }).expect(
        200,
      ),
    ]);
    const history = await prisma.eventChange.findMany({
      where: { eventId: event.id },
      orderBy: { revision: 'asc' },
    });
    expect(history.map((change) => change.revision)).toEqual([1, 2]);
    expect(history[1].oldVenueName).toBe(history[0].newVenueName);
    const current = await prisma.event.findUniqueOrThrow({
      where: { id: event.id },
    });
    expect(current.venueName).toBe(history[1].newVenueName);
    expect(current.scheduleRevision).toBe(2);
  });

  it('reports invalid contact configuration without exposing it', async () => {
    process.env.ORGANIZER_CONTACT_EMAIL = 'invalid-secret-value';
    try {
      const response = await request(app.getHttpServer())
        .get(prefix)
        .set('Cookie', adminCookie)
        .expect(503);
      expect(JSON.stringify(response.body)).not.toContain(
        'invalid-secret-value',
      );
    } finally {
      process.env.ORGANIZER_CONTACT_EMAIL = 'organizer@example.invalid';
    }
  });
});
