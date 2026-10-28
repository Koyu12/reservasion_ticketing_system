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
import { NotificationsService } from '../src/notifications/notifications.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { requireTestDatabaseUrl } from './test-database.js';

type EventResponse = {
  event: {
    id: string;
    title: string;
    status: string;
    startsAt: string;
    endsAt: string;
    registrationClosesAt: string;
    venueName: string;
    venueAddress: string;
    capacity: number;
    scheduleRevision: number;
    confirmedCount: number;
    cancelledAt: string | null;
    cancelledById: string | null;
    cancellationReason: string | null;
  };
  organizerContactEmail: string;
};

describe('Admin workshops (PostgreSQL)', () => {
  let app: INestApplication<Server>;
  let prisma: PrismaService;
  let service: EventsService;
  let notifications: NotificationsService;
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
    notifications = app.get(NotificationsService);
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
      await prisma.user.update({
        where: { id: user.id },
        data: { emailVerified: true },
      });
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
        await prisma.emailJob.deleteMany({
          where: { reservation: { event: events } },
        });
        await prisma.reservation.deleteMany({ where: { event: events } });
        await prisma.eventChange.deleteMany({ where: { event: events } });
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
  async function published() {
    const event = await draft();
    await post(`/${event.id}/publish`, {}).expect(200);
    return event;
  }
  async function reserve(eventId: string, cookie = attendeeCookie) {
    const response = await request(app.getHttpServer())
      .post('/api/reservations')
      .set('Origin', origin)
      .set('Cookie', cookie)
      .send({ eventId })
      .expect(201);
    return (
      response.body as { reservation: { id: string; bookingReference: string } }
    ).reservation;
  }
  function cancelBooking(id: string) {
    return request(app.getHttpServer())
      .post(`/api/reservations/${id}/cancel`)
      .set('Origin', origin)
      .set('Cookie', attendeeCookie)
      .send({});
  }
  function reservationDetails(id: string, cookie = attendeeCookie) {
    return request(app.getHttpServer())
      .get(`/api/reservations/${id}`)
      .set('Cookie', cookie);
  }
  function changeJobs(eventId: string) {
    return prisma.emailJob.findMany({
      where: { type: 'EVENT_CHANGED', reservation: { eventId } },
    });
  }
  function cancelWorkshop(id: string, reason = 'Venue unavailable') {
    return post(`/${id}/cancel`, { reason });
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
      200,
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

  async function waitForEventLocks(client: Client, count: number) {
    for (let attempt = 0; attempt < 100; attempt++) {
      await client.query('SELECT pg_stat_clear_snapshot()');
      const result = await client.query<{
        count: number;
      }>(`SELECT COUNT(*)::int AS count
        FROM pg_stat_activity WHERE datname = current_database()
        AND pid <> pg_backend_pid() AND wait_event_type = 'Lock'
        AND query LIKE '%FROM "Event"%FOR UPDATE%'`);
      if (result.rows[0].count >= count) return;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    throw new Error(`Expected ${count} event lock waiters`);
  }

  async function lockedRequest(
    eventId: string,
    operation: () => PromiseLike<unknown>,
    beforeRelease: (client: Client) => void | Promise<void>,
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
      await waitForEventLocks(blocker, 1);
      await beforeRelease(blocker);
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

  it('commits a combined published change and notices only for confirmed reservations', async () => {
    const event = await published();
    const cancelled = await reserve(event.id);
    await cancelBooking(cancelled.id).expect(200);
    const attendee = await reserve(event.id);
    const personal = await reserve(event.id, adminCookie);
    const before = await prisma.reservation.findMany({
      where: { eventId: event.id },
      orderBy: { id: 'asc' },
    });
    const nextStart = new Date(
      new Date(event.startsAt).getTime() + 3600000,
    ).toISOString();
    const nextEnd = new Date(
      new Date(event.endsAt).getTime() + 3600000,
    ).toISOString();
    const response = await patch(event.id, {
      startsAt: nextStart,
      endsAt: nextEnd,
      venueName: 'New hall',
      venueAddress: '20 Example Road',
      description: 'Updated details',
      capacity: 4,
      reason: '  Larger space  ',
    }).expect(200);
    expect((response.body as EventResponse).event).toMatchObject({
      scheduleRevision: 1,
      confirmedCount: 2,
      startsAt: nextStart,
    });
    const changes = await prisma.eventChange.findMany({
      where: { eventId: event.id },
    });
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({
      revision: 1,
      changedById: adminId,
      reason: 'Larger space',
      oldStartsAt: new Date(event.startsAt),
      oldEndsAt: new Date(event.endsAt),
      newStartsAt: new Date(nextStart),
      newEndsAt: new Date(nextEnd),
      oldVenueName: event.venueName,
      oldVenueAddress: event.venueAddress,
      newVenueName: 'New hall',
      newVenueAddress: '20 Example Road',
    });
    expect(changes[0].createdAt).toBeInstanceOf(Date);
    expect(
      await prisma.reservation.findMany({
        where: { eventId: event.id },
        orderBy: { id: 'asc' },
      }),
    ).toEqual(before);
    const jobs = await changeJobs(event.id);
    expect(jobs).toHaveLength(2);
    expect(jobs.map((job) => job.reservationId).sort()).toEqual(
      [attendee.id, personal.id].sort(),
    );
    for (const job of jobs)
      expect(job).toMatchObject({
        eventChangeId: changes[0].id,
        status: 'PENDING',
        attemptCount: 0,
        deduplicationKey: `EVENT_CHANGED:${job.reservationId}:${changes[0].id}`,
      });
    const details = await reservationDetails(attendee.id).expect(200);
    expect(details.body).toMatchObject({
      reservation: {
        bookingReference: attendee.bookingReference,
        affectedByChange: true,
        cancellationClosesAt: nextStart,
        event: {
          startsAt: nextStart,
          venueName: 'New hall',
          venueAddress: '20 Example Road',
        },
      },
    });
    const publicDetails = await request(app.getHttpServer())
      .get(`/api/events/${event.id}`)
      .expect(200);
    expect(publicDetails.body).toMatchObject({
      event: { startsAt: nextStart, venueName: 'New hall', confirmedCount: 2 },
    });
    await patch(event.id, {
      startsAt: nextStart,
      endsAt: nextEnd,
      venueName: 'New hall',
      venueAddress: '20 Example Road',
      reason: 'Retry the same request',
    }).expect(200);
    expect(
      await prisma.eventChange.count({ where: { eventId: event.id } }),
    ).toBe(1);
    expect(await changeJobs(event.id)).toHaveLength(2);
  });

  it.each(['startsAt', 'endsAt', 'venueName', 'venueAddress'] as const)(
    'records a published %s change with a complete snapshot',
    async (field) => {
      const event = await published();
      const value =
        field === 'startsAt' || field === 'endsAt'
          ? new Date(new Date(event[field]).getTime() + 60000).toISOString()
          : 'Replacement location';
      await patch(event.id, { [field]: value, reason: 'Correction' }).expect(
        200,
      );
      const next = { ...event, [field]: value };
      expect(
        await prisma.eventChange.findMany({ where: { eventId: event.id } }),
      ).toMatchObject([
        {
          revision: 1,
          oldStartsAt: new Date(event.startsAt),
          oldEndsAt: new Date(event.endsAt),
          newStartsAt: new Date(next.startsAt),
          newEndsAt: new Date(next.endsAt),
          oldVenueName: event.venueName,
          oldVenueAddress: event.venueAddress,
          newVenueName: next.venueName,
          newVenueAddress: next.venueAddress,
        },
      ]);
      expect(await changeJobs(event.id)).toHaveLength(0);
    },
  );

  it('requires a reason and validates the entire resulting published workshop before writing', async () => {
    const event = await published();
    await reserve(event.id);
    await reserve(event.id, adminCookie);
    for (const change of [
      { venueName: 'Other room' },
      { venueName: 'Other room', reason: ' ' },
      { venueName: 'Other room', reason: 'Change', changedById: attendeeId },
      { endsAt: event.startsAt, reason: 'Invalid end' },
      { registrationClosesAt: event.endsAt, reason: 'Invalid deadline' },
    ])
      await patch(event.id, change).expect(400);
    const now = Date.now();
    await patch(event.id, {
      startsAt: new Date(now).toISOString(),
      registrationClosesAt: new Date(now - 1).toISOString(),
      reason: 'Too late',
    }).expect(409);
    await patch(event.id, {
      venueName: 'Other room',
      capacity: 1,
      reason: 'Too small',
    }).expect(409);
    expect(
      await prisma.eventChange.count({ where: { eventId: event.id } }),
    ).toBe(0);
    expect(await changeJobs(event.id)).toHaveLength(0);
    expect(
      await prisma.event.findUnique({ where: { id: event.id } }),
    ).toMatchObject({ scheduleRevision: 0, venueName: event.venueName });
  });

  it('does not advance revisions or enqueue notices for ordinary and no-op published edits', async () => {
    const event = await published();
    await reserve(event.id);
    await patch(event.id, {
      venueName: event.venueName,
      startsAt: event.startsAt,
      reason: 'No actual change',
    }).expect(200);
    await patch(event.id, {
      title: 'New title',
      description: 'New description',
      capacity: 6,
      registrationClosesAt: new Date(
        new Date(event.startsAt).getTime() - 3600000,
      ).toISOString(),
    }).expect(200);
    expect(
      await prisma.eventChange.count({ where: { eventId: event.id } }),
    ).toBe(0);
    expect(await changeJobs(event.id)).toHaveLength(0);
    expect(
      await prisma.event.findUnique({ where: { id: event.id } }),
    ).toMatchObject({ scheduleRevision: 0 });
  });

  it.each([-1, 0, 1])(
    'checks published significant edits at %i ms relative to the current start',
    async (offset) => {
      const event = await published();
      await reserve(event.id);
      const currentStart = new Date(event.startsAt).getTime();
      jest.spyOn(Date, 'now').mockReturnValue(currentStart + offset);
      await patch(event.id, {
        startsAt: new Date(currentStart + 3600000).toISOString(),
        endsAt: new Date(currentStart + 7200000).toISOString(),
        reason: 'Later session',
      }).expect(offset < 0 ? 200 : 409);
      expect(
        await prisma.eventChange.count({ where: { eventId: event.id } }),
      ).toBe(offset < 0 ? 1 : 0);
      expect(await changeJobs(event.id)).toHaveLength(offset < 0 ? 1 : 0);
      if (offset < 0) {
        expect(
          await prisma.eventChange.findFirst({ where: { eventId: event.id } }),
        ).toMatchObject({ createdAt: new Date(currentStart + offset) });
      }
    },
  );

  it('rejects a published change that waits across the current start', async () => {
    const event = await published();
    await reserve(event.id);
    const clock = jest
      .spyOn(Date, 'now')
      .mockReturnValue(new Date(event.startsAt).getTime() - 1);
    await lockedRequest(
      event.id,
      () =>
        patch(event.id, {
          venueName: 'Too late',
          reason: 'Late change',
        }).expect(409),
      () => {
        clock.mockReturnValue(new Date(event.startsAt).getTime());
      },
    );
    expect(
      await prisma.eventChange.count({ where: { eventId: event.id } }),
    ).toBe(0);
    expect(await changeJobs(event.id)).toHaveLength(0);
  });

  it('rolls back published details, history, revision and earlier recipient jobs when enqueueing fails', async () => {
    const event = await published();
    await reserve(event.id);
    await reserve(event.id, adminCookie);
    const original = await prisma.event.findUniqueOrThrow({
      where: { id: event.id },
    });
    const enqueue = new NotificationsService();
    let count = 0;
    jest
      .spyOn(notifications, 'enqueue')
      .mockImplementation(async (tx, input) => {
        const job = await enqueue.enqueue(tx, input);
        if (++count === 2) throw new Error('secret-event-change');
        return job;
      });
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const response = await patch(event.id, {
      venueName: 'Not saved',
      reason: 'Rollback',
    }).expect(500);
    expect(JSON.stringify(response.body)).not.toContain('secret-event-change');
    expect(count).toBe(2);
    expect(
      await prisma.event.findUniqueOrThrow({ where: { id: event.id } }),
    ).toEqual(original);
    expect(
      await prisma.eventChange.count({ where: { eventId: event.id } }),
    ).toBe(0);
    expect(await changeJobs(event.id)).toHaveLength(0);
  });

  it('keeps affected bookings distinguishable across consecutive changes and restoration, including rebooking', async () => {
    const event = await published();
    const original = await reserve(event.id);
    await patch(event.id, {
      venueName: 'Second room',
      reason: 'First move',
    }).expect(200);
    const later = await reserve(event.id, adminCookie);
    expect(
      (await reservationDetails(later.id, adminCookie).expect(200)).body,
    ).toMatchObject({ reservation: { affectedByChange: false } });
    const lateClock = jest
      .spyOn(Date, 'now')
      .mockReturnValue(new Date(event.startsAt).getTime() - 86400000);
    await request(app.getHttpServer())
      .post(`/api/reservations/${later.id}/cancel`)
      .set('Origin', origin)
      .set('Cookie', adminCookie)
      .send({})
      .expect(409);
    lateClock.mockRestore();
    await patch(event.id, {
      venueName: event.venueName,
      reason: 'Restore original',
    }).expect(200);
    const history = await prisma.eventChange.findMany({
      where: { eventId: event.id },
      orderBy: { revision: 'asc' },
    });
    expect(history.map((change) => change.revision)).toEqual([1, 2]);
    expect(history[1].oldVenueName).toBe(history[0].newVenueName);
    expect(history[1].newVenueName).toBe(event.venueName);
    expect(await changeJobs(event.id)).toHaveLength(3);
    for (const [id, cookie] of [
      [original.id, attendeeCookie],
      [later.id, adminCookie],
    ] as const) {
      expect(
        (await reservationDetails(id, cookie).expect(200)).body,
      ).toMatchObject({
        reservation: {
          affectedByChange: true,
          cancellationClosesAt: event.startsAt,
        },
      });
    }
    await cancelBooking(original.id).expect(200);
    const rebooked = await reserve(event.id);
    expect(rebooked.bookingReference).not.toBe(original.bookingReference);
    expect(
      await prisma.reservation.findUnique({ where: { id: rebooked.id } }),
    ).toMatchObject({ bookedRevision: 2 });
    expect(
      (await reservationDetails(rebooked.id).expect(200)).body,
    ).toMatchObject({ reservation: { affectedByChange: false } });
    const clock = jest
      .spyOn(Date, 'now')
      .mockReturnValue(new Date(event.startsAt).getTime() - 1);
    await cancelBooking(rebooked.id).expect(409);
    await request(app.getHttpServer())
      .post(`/api/reservations/${later.id}/cancel`)
      .set('Origin', origin)
      .set('Cookie', adminCookie)
      .send({})
      .expect(200);
    clock.mockReturnValue(new Date(event.startsAt).getTime());
    await cancelBooking(rebooked.id).expect(409);
  });

  it.each(['booking-first', 'change-first'] as const)(
    'serializes booking and change with %s',
    async (order) => {
      const event = await published();
      const booking = () => reserve(event.id);
      const change = () =>
        patch(event.id, {
          venueName: 'Moved room',
          reason: 'Concurrent change',
        }).expect(200);
      let second: Promise<unknown> | undefined;
      try {
        await lockedRequest(
          event.id,
          order === 'booking-first' ? booking : change,
          async (client) => {
            second = Promise.resolve(
              order === 'booking-first' ? change() : booking(),
            );
            await waitForEventLocks(client, 2);
          },
        );
        await second;
      } finally {
        await second?.catch(() => undefined);
      }
      const reservation = await prisma.reservation.findFirstOrThrow({
        where: { eventId: event.id },
      });
      expect(reservation.bookedRevision).toBe(
        order === 'booking-first' ? 0 : 1,
      );
      expect(await changeJobs(event.id)).toHaveLength(
        order === 'booking-first' ? 1 : 0,
      );
      expect(
        (await reservationDetails(reservation.id).expect(200)).body,
      ).toMatchObject({
        reservation: { affectedByChange: order === 'booking-first' },
      });
    },
  );

  it('serializes simultaneous published changes into coherent revisions and recipient jobs', async () => {
    const event = await published();
    const booking = await reserve(event.id);
    await Promise.all([
      patch(event.id, { venueName: 'Room A', reason: 'First proposal' }).expect(
        200,
      ),
      patch(event.id, {
        venueName: 'Room B',
        reason: 'Second proposal',
      }).expect(200),
    ]);
    const history = await prisma.eventChange.findMany({
      where: { eventId: event.id },
      orderBy: { revision: 'asc' },
    });
    expect(history.map((change) => change.revision)).toEqual([1, 2]);
    expect(history[1].oldVenueName).toBe(history[0].newVenueName);
    expect(
      await prisma.event.findUnique({ where: { id: event.id } }),
    ).toMatchObject({
      scheduleRevision: 2,
      venueName: history[1].newVenueName,
    });
    const jobs = await changeJobs(event.id);
    expect(jobs).toHaveLength(2);
    expect(jobs.map((job) => job.eventChangeId).sort()).toEqual(
      history.map((change) => change.id).sort(),
    );
    expect(jobs.every((job) => job.reservationId === booking.id)).toBe(true);
  });

  it('protects whole-workshop cancellation with current admin permission and trusted origins', async () => {
    const event = await published();
    const path = `${prefix}/${event.id}/cancel`;
    await request(app.getHttpServer())
      .post(path)
      .set('Origin', origin)
      .send({ reason: 'Unavailable' })
      .expect(401);
    await post(
      `/${event.id}/cancel`,
      { reason: 'Unavailable' },
      attendeeCookie,
    ).expect(403);
    for (const requestOrigin of [undefined, 'https://untrusted.example']) {
      const pending = request(app.getHttpServer())
        .post(path)
        .set('Cookie', adminCookie)
        .send({ reason: 'Unavailable' });
      if (requestOrigin) pending.set('Origin', requestOrigin);
      await pending.expect(403);
    }
    await prisma.user.update({
      where: { id: adminId },
      data: { role: 'ATTENDEE' },
    });
    try {
      await cancelWorkshop(event.id).expect(403);
    } finally {
      await prisma.user.update({
        where: { id: adminId },
        data: { role: 'ADMIN' },
      });
    }
    expect(
      await prisma.event.findUnique({ where: { id: event.id } }),
    ).toMatchObject({ status: 'PUBLISHED', cancelledAt: null });
  });

  it('requires a nonblank workshop reason, rejects injected fields, and keeps drafts private', async () => {
    const event = await published();
    for (const body of [
      {},
      { reason: '' },
      { reason: '  ' },
      { reason: null },
      { reason: 3 },
      { reason: 'Unavailable', cancelledById: attendeeId },
      { reason: 'Unavailable', cancelledAt: new Date().toISOString() },
      { reason: 'Unavailable', status: 'CANCELLED' },
      { reason: 'Unavailable', startsAt: event.startsAt },
    ])
      await post(`/${event.id}/cancel`, body).expect(400);
    await cancelWorkshop('invalid').expect(400);
    await cancelWorkshop(randomUUID()).expect(404);
    const unpublished = await draft();
    expect(
      (await cancelWorkshop(unpublished.id).expect(409)).body,
    ).toMatchObject({ code: 'EVENT_NOT_PUBLISHED' });
    await request(app.getHttpServer())
      .get(`/api/events/${unpublished.id}`)
      .expect(404);
    expect(
      await prisma.event.findUnique({ where: { id: unpublished.id } }),
    ).toMatchObject({ status: 'DRAFT', cancelledAt: null });
    expect(
      await prisma.event.findUnique({ where: { id: event.id } }),
    ).toMatchObject({ status: 'PUBLISHED', cancellationReason: null });
  });

  it('cancels remaining confirmed bookings atomically while preserving earlier history, schedule and queued messages', async () => {
    const event = await published();
    const selfCancelled = await reserve(event.id);
    await cancelBooking(selfCancelled.id).expect(200);
    const adminCancelled = await reserve(event.id);
    await request(app.getHttpServer())
      .post(`/api/admin/reservations/${adminCancelled.id}/cancel`)
      .set('Origin', origin)
      .set('Cookie', adminCookie)
      .send({ reason: 'Earlier individual request' })
      .expect(200);
    const confirmed = [
      await reserve(event.id),
      await reserve(event.id, adminCookie),
    ];
    await patch(event.id, {
      venueName: 'Revised hall',
      reason: 'Larger venue',
    }).expect(200);
    const previousEvent = await prisma.event.findUniqueOrThrow({
      where: { id: event.id },
    });
    const previousReservations = await prisma.reservation.findMany({
      where: { eventId: event.id },
      orderBy: { id: 'asc' },
    });
    const previousJobs = await prisma.emailJob.findMany({
      where: { reservation: { eventId: event.id } },
      orderBy: { id: 'asc' },
    });
    const now = new Date(event.startsAt).getTime() + 1000;
    jest.spyOn(Date, 'now').mockReturnValue(now);
    const reason = 'Venue unavailable.\nPlease contact the organizer.';
    const response = await cancelWorkshop(event.id, `  ${reason}  `).expect(
      200,
    );
    expect((response.body as EventResponse).event).toMatchObject({
      status: 'CANCELLED',
      confirmedCount: 0,
      cancelledById: adminId,
      cancelledAt: new Date(now).toISOString(),
      cancellationReason: reason,
    });
    const stored = await prisma.event.findUniqueOrThrow({
      where: { id: event.id },
    });
    expect(stored).toEqual({
      ...previousEvent,
      status: 'CANCELLED',
      cancelledAt: new Date(now),
      cancelledById: adminId,
      cancellationReason: reason,
      updatedAt: stored.updatedAt,
    });
    for (const previous of previousReservations) {
      const current = await prisma.reservation.findUniqueOrThrow({
        where: { id: previous.id },
      });
      if (previous.status === 'CANCELLED') expect(current).toEqual(previous);
      else
        expect(current).toEqual({
          ...previous,
          status: 'CANCELLED',
          cancelledAt: new Date(now),
          cancelledById: adminId,
          cancellationSource: 'EVENT_CANCELLED',
          cancellationReason: reason,
          updatedAt: current.updatedAt,
        });
    }
    const jobs = await prisma.emailJob.findMany({
      where: { type: 'EVENT_CANCELLED', reservation: { eventId: event.id } },
    });
    expect(jobs).toHaveLength(2);
    expect(jobs.map((job) => job.reservationId).sort()).toEqual(
      confirmed.map((row) => row.id).sort(),
    );
    for (const job of jobs)
      expect(job).toMatchObject({
        status: 'PENDING',
        attemptCount: 0,
        eventChangeId: null,
        deduplicationKey: `EVENT_CANCELLED:${job.reservationId}`,
      });
    expect(
      await prisma.emailJob.findMany({
        where: { id: { in: previousJobs.map((job) => job.id) } },
        orderBy: { id: 'asc' },
      }),
    ).toEqual(previousJobs);
    expect(
      await prisma.eventChange.count({ where: { eventId: event.id } }),
    ).toBe(1);
    const details = await request(app.getHttpServer())
      .get(`/api/events/${event.id}`)
      .expect(200);
    expect(details.body).toMatchObject({
      event: {
        status: 'CANCELLED',
        cancellationReason: reason,
        cancelledAt: new Date(now).toISOString(),
        startsAt: event.startsAt,
        endsAt: event.endsAt,
      },
    });
    expect(JSON.stringify(details.body)).not.toContain(adminId);
    for (const field of [
      'cancelledById',
      'createdById',
      'emailJob',
      'deduplicationKey',
    ])
      expect(JSON.stringify(details.body)).not.toContain(`"${field}"`);
    const owned = await reservationDetails(confirmed[0].id).expect(200);
    expect(owned.body).toMatchObject({
      reservation: {
        status: 'CANCELLED',
        bookingReference: confirmed[0].bookingReference,
        event: {
          cancellationReason: reason,
          cancelledAt: new Date(now).toISOString(),
        },
      },
    });
    expect(JSON.stringify(owned.body)).not.toContain('cancelledById');
    await reservationDetails(confirmed[1].id).expect(404);
    const history = await request(app.getHttpServer())
      .get('/api/reservations')
      .set('Cookie', attendeeCookie)
      .expect(200);
    const historyData = history.body as {
      current: { eventId: string }[];
      history: { event: { id: string; cancellationReason: string } }[];
    };
    expect(historyData.current.some((row) => row.eventId === event.id)).toBe(
      false,
    );
    const rows = historyData.history.filter((row) => row.event.id === event.id);
    expect(rows).toHaveLength(3);
    expect(rows.every((row) => row.event.cancellationReason === reason)).toBe(
      true,
    );
    await patch(event.id, { description: 'Cannot edit' }).expect(409);
    await post(`/${event.id}/publish`, {}).expect(409);
  });

  it.each([
    'before-start',
    'during-session',
    'last-millisecond',
    'at-end',
    'after-end',
  ] as const)(
    'enforces the whole-workshop cancellation boundary for %s',
    async (when) => {
      const event = await published();
      const booking = await reserve(event.id);
      const start = new Date(event.startsAt).getTime();
      const end = new Date(event.endsAt).getTime();
      const now =
        when === 'before-start'
          ? start - 1
          : when === 'during-session'
            ? start
            : when === 'last-millisecond'
              ? end - 1
              : when === 'at-end'
                ? end
                : end + 1;
      const allowed = now < end;
      jest.spyOn(Date, 'now').mockReturnValue(now);
      const response = await cancelWorkshop(event.id).expect(
        allowed ? 200 : 409,
      );
      expect(
        await prisma.event.findUnique({ where: { id: event.id } }),
      ).toMatchObject({
        status: allowed ? 'CANCELLED' : 'PUBLISHED',
        cancelledAt: allowed ? new Date(now) : null,
      });
      expect(
        await prisma.reservation.findUnique({ where: { id: booking.id } }),
      ).toMatchObject({ status: allowed ? 'CANCELLED' : 'CONFIRMED' });
      expect(
        await prisma.emailJob.count({
          where: { type: 'EVENT_CANCELLED', reservationId: booking.id },
        }),
      ).toBe(allowed ? 1 : 0);
      if (!allowed)
        expect(response.body).toMatchObject({ code: 'EVENT_ENDED' });
    },
  );

  it.each([false, true])(
    'samples cancellation time after the event lock and rejects a crossed end (crossed=%s)',
    async (crossed) => {
      const event = await published();
      await reserve(event.id);
      const end = new Date(event.endsAt).getTime();
      const clock = jest.spyOn(Date, 'now').mockReturnValue(end - 1000);
      await lockedRequest(
        event.id,
        () => cancelWorkshop(event.id).expect(crossed ? 409 : 200),
        () => {
          clock.mockReturnValue(crossed ? end : end - 1);
        },
      );
      expect(
        await prisma.event.findUnique({ where: { id: event.id } }),
      ).toMatchObject({
        status: crossed ? 'PUBLISHED' : 'CANCELLED',
        cancelledAt: crossed ? null : new Date(end - 1),
      });
    },
  );

  it('cancels a workshop with no bookings without creating notification jobs', async () => {
    const event = await published();
    expect((await cancelWorkshop(event.id).expect(200)).body).toMatchObject({
      event: { status: 'CANCELLED', confirmedCount: 0 },
    });
    expect(
      await prisma.emailJob.count({
        where: { reservation: { eventId: event.id } },
      }),
    ).toBe(0);
  });

  it('preserves the first cancellation on concurrent repeats and retries by another admin after the end', async () => {
    const event = await published();
    await reserve(event.id);
    const responses = await Promise.all([
      cancelWorkshop(event.id, 'First proposal').expect(200),
      cancelWorkshop(event.id, 'Second proposal').expect(200),
    ]);
    expect(responses[0].body).toEqual(responses[1].body);
    const original = await prisma.event.findUniqueOrThrow({
      where: { id: event.id },
    });
    const reservations = await prisma.reservation.findMany({
      where: { eventId: event.id },
    });
    const jobs = await prisma.emailJob.findMany({
      where: { reservation: { eventId: event.id } },
      orderBy: { id: 'asc' },
    });
    jest
      .spyOn(Date, 'now')
      .mockReturnValue(new Date(event.endsAt).getTime() + 1);
    await prisma.user.update({
      where: { id: attendeeId },
      data: { role: 'ADMIN' },
    });
    try {
      const repeated = await post(
        `/${event.id}/cancel`,
        { reason: 'Do not overwrite' },
        attendeeCookie,
      ).expect(200);
      expect(repeated.body).toEqual(responses[0].body);
    } finally {
      await prisma.user.update({
        where: { id: attendeeId },
        data: { role: 'ATTENDEE' },
      });
    }
    expect(
      await prisma.event.findUniqueOrThrow({ where: { id: event.id } }),
    ).toEqual(original);
    expect(
      await prisma.reservation.findMany({ where: { eventId: event.id } }),
    ).toEqual(reservations);
    expect(
      await prisma.emailJob.findMany({
        where: { reservation: { eventId: event.id } },
        orderBy: { id: 'asc' },
      }),
    ).toEqual(jobs);
  });

  it('rolls back the event, every reservation and partial cancellation jobs on enqueue failure', async () => {
    const event = await published();
    await reserve(event.id);
    await reserve(event.id, adminCookie);
    const original = await prisma.event.findUniqueOrThrow({
      where: { id: event.id },
    });
    const reservations = await prisma.reservation.findMany({
      where: { eventId: event.id },
      orderBy: { id: 'asc' },
    });
    const jobs = await prisma.emailJob.findMany({
      where: { reservation: { eventId: event.id } },
      orderBy: { id: 'asc' },
    });
    const enqueue = new NotificationsService();
    let count = 0;
    jest
      .spyOn(notifications, 'enqueue')
      .mockImplementation(async (tx, input) => {
        const job = await enqueue.enqueue(tx, input);
        if (++count === 2) throw new Error('secret-workshop-cancellation');
        return job;
      });
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const response = await cancelWorkshop(event.id).expect(500);
    expect(count).toBe(2);
    expect(JSON.stringify(response.body)).not.toContain(
      'secret-workshop-cancellation',
    );
    expect(
      await prisma.event.findUniqueOrThrow({ where: { id: event.id } }),
    ).toEqual(original);
    expect(
      await prisma.reservation.findMany({
        where: { eventId: event.id },
        orderBy: { id: 'asc' },
      }),
    ).toEqual(reservations);
    expect(
      await prisma.emailJob.findMany({
        where: { reservation: { eventId: event.id } },
        orderBy: { id: 'asc' },
      }),
    ).toEqual(jobs);
    jest.restoreAllMocks();
    await cancelWorkshop(event.id).expect(200);
  });

  it.each(['booking-first', 'cancellation-first'] as const)(
    'serializes a competing booking with %s',
    async (order) => {
      const event = await published();
      const booking = () =>
        request(app.getHttpServer())
          .post('/api/reservations')
          .set('Origin', origin)
          .set('Cookie', attendeeCookie)
          .send({ eventId: event.id })
          .expect(order === 'booking-first' ? 201 : 409);
      const cancellation = () => cancelWorkshop(event.id).expect(200);
      let second: Promise<unknown> | undefined;
      try {
        await lockedRequest(
          event.id,
          order === 'booking-first' ? booking : cancellation,
          async (client) => {
            second = Promise.resolve(
              order === 'booking-first' ? cancellation() : booking(),
            );
            await waitForEventLocks(client, 2);
          },
        );
        await second;
      } finally {
        await second?.catch(() => undefined);
      }
      expect(
        await prisma.reservation.count({
          where: { eventId: event.id, status: 'CONFIRMED' },
        }),
      ).toBe(0);
      expect(
        await prisma.reservation.count({
          where: { eventId: event.id, status: 'CANCELLED' },
        }),
      ).toBe(order === 'booking-first' ? 1 : 0);
      expect(
        await prisma.emailJob.count({
          where: {
            type: 'EVENT_CANCELLED',
            reservation: { eventId: event.id },
          },
        }),
      ).toBe(order === 'booking-first' ? 1 : 0);
      await bookingAfterCancellation(event.id);
    },
  );

  async function bookingAfterCancellation(eventId: string) {
    const response = await request(app.getHttpServer())
      .post('/api/reservations')
      .set('Origin', origin)
      .set('Cookie', attendeeCookie)
      .send({ eventId })
      .expect(409);
    expect(response.body).toMatchObject({ code: 'EVENT_CANCELLED' });
  }

  it.each(['individual-first', 'workshop-first'] as const)(
    'preserves the first cancellation source with %s',
    async (order) => {
      const event = await published();
      const reservation = await reserve(event.id);
      const individual = () =>
        request(app.getHttpServer())
          .post(`/api/admin/reservations/${reservation.id}/cancel`)
          .set('Origin', origin)
          .set('Cookie', adminCookie)
          .send({ reason: 'Individual request' })
          .expect(200);
      const workshop = () => cancelWorkshop(event.id).expect(200);
      let second: Promise<unknown> | undefined;
      try {
        await lockedRequest(
          event.id,
          order === 'individual-first' ? individual : workshop,
          async (client) => {
            second = Promise.resolve(
              order === 'individual-first' ? workshop() : individual(),
            );
            await waitForEventLocks(client, 2);
          },
        );
        await second;
      } finally {
        await second?.catch(() => undefined);
      }
      expect(
        await prisma.reservation.findUnique({ where: { id: reservation.id } }),
      ).toMatchObject({
        cancellationSource:
          order === 'individual-first' ? 'ADMIN' : 'EVENT_CANCELLED',
        cancellationReason:
          order === 'individual-first'
            ? 'Individual request'
            : 'Venue unavailable',
      });
      const notices = await prisma.emailJob.findMany({
        where: {
          reservationId: reservation.id,
          type: { in: ['EVENT_CANCELLED', 'RESERVATION_CANCELLED'] },
        },
      });
      expect(notices).toHaveLength(1);
      expect(notices[0].type).toBe(
        order === 'individual-first'
          ? 'RESERVATION_CANCELLED'
          : 'EVENT_CANCELLED',
      );
    },
  );

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
