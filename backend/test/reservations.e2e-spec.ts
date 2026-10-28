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
import { NotificationsService } from '../src/notifications/notifications.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { ReservationsService } from '../src/reservations/reservations.service.js';
import type { Prisma } from '../src/generated/prisma/client.js';
import { requireTestDatabaseUrl } from './test-database.js';

type Identity = { id: string; cookie: string[]; email: string };
type BookingResponse = {
  reservation: {
    id: string;
    eventId: string;
    bookingReference: string;
    status: string;
    createdAt: string;
  };
};
type ListedReservation = BookingResponse['reservation'] & {
  cancelledAt: string | null;
  affectedByChange: boolean;
  cancellationClosesAt: string;
  event: {
    id: string;
    title: string;
    startsAt: string;
    endsAt: string;
    venueName: string;
    status: string;
  };
};
type ReservationListResponse = {
  current: ListedReservation[];
  history: ListedReservation[];
  organizerContactEmail: string;
};

describe('Reservations (PostgreSQL)', () => {
  let app: INestApplication<Server>;
  let prisma: PrismaService;
  let service: ReservationsService;
  let notifications: NotificationsService;
  let attendee: Identity;
  let other: Identity;
  let admin: Identity;
  let unverified: Identity;
  let databaseUrl: string;
  const origin = 'http://localhost:5173';
  const previous: Record<string, string | undefined> = {};
  const users: Identity[] = [];
  let event: Awaited<ReturnType<typeof seedEvent>>;

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
      .useValue({ send: () => Promise.resolve({ id: 'mock-auth-message' }) })
      .compile();
    app = module.createNestApplication({ bodyParser: false });
    prisma = app.get(PrismaService);
    service = app.get(ReservationsService);
    notifications = app.get(NotificationsService);
    expect(
      (
        await prisma.$queryRaw<
          { database: string }[]
        >`SELECT current_database() AS database`
      )[0].database,
    ).toBe('reservation_ticketing_system_test');
    await app.init();
    for (let index = 0; index < 4; index++) {
      const email = `booking-${randomUUID()}@example.invalid`;
      const response = await request(app.getHttpServer())
        .post('/api/auth/sign-up/email')
        .set('Origin', origin)
        .send({
          name: `Booking user ${index}`,
          email,
          password: 'Booking-test-password-123!',
        })
        .expect(200);
      const body = response.body as { user: { id: string } };
      const identity = {
        id: body.user.id,
        email,
        cookie: (response.headers['set-cookie'] as unknown as string[]).map(
          (cookie) => cookie.split(';')[0],
        ),
      };
      users.push(identity);
      if (index < 3)
        await prisma.user.update({
          where: { id: identity.id },
          data: {
            emailVerified: true,
            role: index === 2 ? 'ADMIN' : 'ATTENDEE',
          },
        });
    }
    [attendee, other, admin, unverified] = users;
  });

  beforeEach(async () => {
    event = await seedEvent();
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    if (prisma && admin) {
      const owned = { createdById: admin.id };
      await prisma.emailJob.deleteMany({
        where: { reservation: { event: owned } },
      });
      await prisma.reservation.deleteMany({ where: { event: owned } });
      await prisma.eventChange.deleteMany({ where: { event: owned } });
      await prisma.event.deleteMany({ where: owned });
      await prisma.user.updateMany({
        where: { id: { in: [attendee.id, other.id, admin.id] } },
        data: { emailVerified: true },
      });
    }
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

  function seedEvent(extra: Partial<Prisma.EventUncheckedCreateInput> = {}) {
    return prisma.event.create({
      data: {
        createdById: admin.id,
        title: 'Safe booking workshop',
        description: 'An in-person workshop.',
        venueName: 'Main hall',
        venueAddress: '10 Example Road',
        capacity: 1,
        status: 'PUBLISHED',
        startsAt: new Date(Date.now() + 3 * 86400000),
        endsAt: new Date(Date.now() + 3 * 86400000 + 3600000),
        registrationClosesAt: new Date(Date.now() + 2 * 86400000),
        ...extra,
      },
    });
  }

  function book(identity = attendee, body: unknown = { eventId: event.id }) {
    return request(app.getHttpServer())
      .post('/api/reservations')
      .set('Origin', origin)
      .set('Cookie', identity.cookie)
      .send(body);
  }
  function get(id: string, identity = attendee) {
    return request(app.getHttpServer())
      .get(`/api/reservations/${id}`)
      .set('Cookie', identity.cookie);
  }
  function list(identity = attendee) {
    return request(app.getHttpServer())
      .get('/api/reservations')
      .set('Cookie', identity.cookie);
  }
  function cancel(id: string, identity = attendee, body: unknown = {}) {
    return request(app.getHttpServer())
      .post(`/api/reservations/${id}/cancel`)
      .set('Origin', origin)
      .set('Cookie', identity.cookie)
      .send(body);
  }
  async function expectCounts(reservations: number, jobs = reservations) {
    expect(
      await prisma.reservation.count({ where: { eventId: event.id } }),
    ).toBe(reservations);
    expect(
      await prisma.emailJob.count({
        where: { reservation: { eventId: event.id } },
      }),
    ).toBe(jobs);
  }

  it('books with the current revision and exactly one durable pending notification', async () => {
    await prisma.event.update({
      where: { id: event.id },
      data: { scheduleRevision: 2 },
    });
    const response = await book().expect(201);
    const { reservation } = response.body as BookingResponse;
    expect(reservation).toMatchObject({
      eventId: event.id,
      status: 'CONFIRMED',
    });
    expect(reservation.bookingReference).toMatch(/^[0-9A-F]{24}$/);
    expect(Object.keys(reservation).sort()).toEqual([
      'bookingReference',
      'createdAt',
      'eventId',
      'id',
      'status',
    ]);
    expect(
      await prisma.reservation.findUnique({ where: { id: reservation.id } }),
    ).toMatchObject({ userId: attendee.id, bookedRevision: 2 });
    expect(
      await prisma.emailJob.findFirst({
        where: { reservationId: reservation.id },
      }),
    ).toMatchObject({
      type: 'BOOKING_CONFIRMED',
      status: 'PENDING',
      recipientEmail: attendee.email,
      attemptCount: 0,
    });
    await expectCounts(1);
  });

  it('two_requests_for_last_place_create_one_booking', async () => {
    const results = await Promise.all([book(), book(other)]);
    expect(results.map((response) => response.status).sort()).toEqual([
      201, 409,
    ]);
    expect(
      (
        results.find((response) => response.status === 409)!.body as {
          code: string;
        }
      ).code,
    ).toBe('EVENT_FULL');
    await expectCounts(1);
  });

  it('duplicate_requests_create_one_confirmed_booking', async () => {
    const results = await Promise.all([book(), book()]);
    expect(results.map((response) => response.status).sort()).toEqual([
      201, 409,
    ]);
    const success = results.find((response) => response.status === 201)!
      .body as BookingResponse;
    expect(
      results.find((response) => response.status === 409)!.body,
    ).toMatchObject({
      code: 'ALREADY_RESERVED',
      reservationId: success.reservation.id,
    });
    await expectCounts(1);
  });

  it('rejects anonymous and unverified booking', async () => {
    await request(app.getHttpServer())
      .post('/api/reservations')
      .set('Origin', origin)
      .send({ eventId: event.id })
      .expect(401);
    await book(unverified)
      .expect(403)
      .expect(({ body }: { body: unknown }) =>
        expect(body).toMatchObject({ code: 'EMAIL_NOT_VERIFIED' }),
      );
    await expectCounts(0);
  });

  it.each([
    { eventId: 'invalid' },
    { userId: 'injected' },
    { bookingReference: 'injected' },
    { status: 'CONFIRMED' },
    { bookedRevision: 9 },
    { recipientEmail: 'injected@example.invalid' },
  ])('rejects invalid or server-owned input: %j', async (extra) => {
    await book(attendee, { eventId: event.id, ...extra }).expect(400);
    await expectCounts(0);
  });

  it('rejects an empty booking body and unknown workshop', async () => {
    await book(attendee, {}).expect(400);
    await book(attendee, { eventId: randomUUID() }).expect(404);
    await expectCounts(0);
  });

  it.each([undefined, 'https://untrusted.example'])(
    'rejects an untrusted mutation origin: %s',
    async (requestOrigin) => {
      const pending = request(app.getHttpServer())
        .post('/api/reservations')
        .set('Cookie', attendee.cookie)
        .send({ eventId: event.id });
      if (requestOrigin) pending.set('Origin', requestOrigin);
      await pending.expect(403);
      await expectCounts(0);
    },
  );

  it('rejects draft and cancelled events', async () => {
    await prisma.event.update({
      where: { id: event.id },
      data: { status: 'DRAFT' },
    });
    await book().expect(404);
    await prisma.event.update({
      where: { id: event.id },
      data: {
        status: 'CANCELLED',
        cancelledAt: new Date(),
        cancelledById: admin.id,
        cancellationReason: 'Test cancellation',
      },
    });
    await book()
      .expect(409)
      .expect(({ body }: { body: unknown }) =>
        expect(body).toMatchObject({ code: 'EVENT_CANCELLED' }),
      );
    await expectCounts(0);
  });

  it.each([0, 1])(
    'rejects booking %i ms at/after registration deadline',
    async (offset) => {
      jest
        .spyOn(Date, 'now')
        .mockReturnValue(event.registrationClosesAt.getTime() + offset);
      await book()
        .expect(409)
        .expect(({ body }: { body: unknown }) =>
          expect(body).toMatchObject({ code: 'REGISTRATION_CLOSED' }),
        );
      await expectCounts(0);
    },
  );

  it('accepts booking just before registration closes', async () => {
    jest
      .spyOn(Date, 'now')
      .mockReturnValue(event.registrationClosesAt.getTime() - 1);
    await book().expect(201);
    await expectCounts(1);
  });

  it.each([0, 1])(
    'rejects booking %i ms at/after event start',
    async (offset) => {
      jest
        .spyOn(Date, 'now')
        .mockReturnValue(event.startsAt.getTime() + offset);
      await book()
        .expect(409)
        .expect(({ body }: { body: unknown }) =>
          expect(body).toMatchObject({ code: 'EVENT_STARTED' }),
        );
      await expectCounts(0);
    },
  );

  it('admin personal bookings follow verification, duplicate, capacity and deadline rules', async () => {
    await prisma.user.update({
      where: { id: admin.id },
      data: { emailVerified: false },
    });
    await book(admin).expect(403);
    await prisma.user.update({
      where: { id: admin.id },
      data: { emailVerified: true },
    });
    await book().expect(201);
    await book(admin).expect(409);
    const next = await seedEvent();
    await book(admin, { eventId: next.id }).expect(201);
    await book(admin, { eventId: next.id }).expect(409);
    const closed = await seedEvent({
      registrationClosesAt: new Date(Date.now() - 1),
    });
    await book(admin, { eventId: closed.id }).expect(409);
    expect(
      await prisma.reservation.count({
        where: { userId: admin.id, eventId: next.id },
      }),
    ).toBe(1);
  });

  async function whileEventLocked(
    operation: () => PromiseLike<unknown>,
    beforeRelease: () => Promise<void> | void,
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
        [event.id],
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
      await beforeRelease();
      await blocker.query('COMMIT');
      await pending;
    } finally {
      await blocker.query('ROLLBACK');
      await blocker.end();
      await pending?.catch(() => undefined);
    }
  }

  it('deadline_crossed_while_waiting_rejects_booking', async () => {
    await whileEventLocked(
      () => book().expect(409),
      () => {
        jest
          .spyOn(Date, 'now')
          .mockReturnValue(event.registrationClosesAt.getTime());
      },
    );
    await expectCounts(0);
  });

  it.each([-1, 0, 1])(
    'self-service cancellation at %i ms relative to the 24-hour cutoff',
    async (offset) => {
      const { reservation } = (await book().expect(201))
        .body as BookingResponse;
      const now = event.startsAt.getTime() - 86400000 + offset;
      jest.spyOn(Date, 'now').mockReturnValue(now);
      const response = await cancel(reservation.id).expect(
        offset < 0 ? 200 : 409,
      );
      if (offset < 0) {
        expect(response.body).toEqual({
          reservation: {
            ...reservation,
            status: 'CANCELLED',
            cancelledAt: new Date(now).toISOString(),
          },
        });
        expect(
          await prisma.reservation.findUnique({
            where: { id: reservation.id },
          }),
        ).toMatchObject({
          status: 'CANCELLED',
          cancelledAt: new Date(now),
          cancelledById: attendee.id,
          cancellationSource: 'SELF_SERVICE',
          cancellationReason: null,
          bookedRevision: 0,
        });
        expect(
          await prisma.emailJob.findUnique({
            where: {
              deduplicationKey: `RESERVATION_CANCELLED:${reservation.id}`,
            },
          }),
        ).toMatchObject({
          type: 'RESERVATION_CANCELLED',
          status: 'PENDING',
          recipientEmail: attendee.email,
        });
      } else {
        expect(response.body).toMatchObject({ code: 'CANCELLATION_CLOSED' });
        expect(
          await prisma.reservation.findUnique({
            where: { id: reservation.id },
          }),
        ).toMatchObject({
          status: 'CONFIRMED',
          cancelledAt: null,
          cancelledById: null,
          cancellationSource: null,
        });
      }
      await expectCounts(1, offset < 0 ? 2 : 1);
    },
  );

  it.each([-1, 0, 1])(
    'affected reservation cancellation at %i ms relative to the revised start',
    async (offset) => {
      const { reservation } = (await book().expect(201))
        .body as BookingResponse;
      const revisedStart = new Date(event.startsAt.getTime() + 3600000);
      await prisma.event.update({
        where: { id: event.id },
        data: {
          startsAt: revisedStart,
          endsAt: new Date(revisedStart.getTime() + 3600000),
          scheduleRevision: 1,
        },
      });
      jest.spyOn(Date, 'now').mockReturnValue(revisedStart.getTime() + offset);
      await cancel(reservation.id).expect(offset < 0 ? 200 : 409);
      await expectCounts(1, offset < 0 ? 2 : 1);
    },
  );

  it.each([false, true])(
    'rechecks the cancellation cutoff after an event-lock wait (affected=%s)',
    async (affected) => {
      const { reservation } = (await book().expect(201))
        .body as BookingResponse;
      if (affected)
        await prisma.event.update({
          where: { id: event.id },
          data: { scheduleRevision: 1 },
        });
      const deadline = event.startsAt.getTime() - (affected ? 0 : 86400000);
      const clock = jest.spyOn(Date, 'now').mockReturnValue(deadline - 1);
      await whileEventLocked(
        () => cancel(reservation.id).expect(409),
        () => {
          clock.mockReturnValue(deadline);
        },
      );
      await expectCounts(1);
      expect(
        await prisma.reservation.findUnique({ where: { id: reservation.id } }),
      ).toMatchObject({ status: 'CONFIRMED', cancelledAt: null });
    },
  );

  it('rejects anonymous, unowned, malformed and injected cancellation requests', async () => {
    const { reservation } = (await book().expect(201)).body as BookingResponse;
    await request(app.getHttpServer())
      .post(`/api/reservations/${reservation.id}/cancel`)
      .set('Origin', origin)
      .send({})
      .expect(401);
    const foreign = await cancel(reservation.id, other).expect(404);
    const missing = await cancel(randomUUID(), other).expect(404);
    expect(foreign.body).toEqual(missing.body);
    await cancel(reservation.id, admin).expect(404);
    await cancel('invalid').expect(400);
    for (const body of [
      { userId: other.id },
      { status: 'CANCELLED' },
      { cancelledById: admin.id },
      { cancellationReason: 'Injected' },
      { cancellationSource: 'ADMIN' },
    ])
      await cancel(reservation.id, attendee, body).expect(400);
    for (const requestOrigin of [undefined, 'https://untrusted.example']) {
      const pending = request(app.getHttpServer())
        .post(`/api/reservations/${reservation.id}/cancel`)
        .set('Cookie', attendee.cookie)
        .send({});
      if (requestOrigin) pending.set('Origin', requestOrigin);
      await pending.expect(403);
    }
    await expectCounts(1);
  });

  it('allows cancellation without verified email and keeps admin personal cancellations on attendee rules', async () => {
    const { reservation } = (await book().expect(201)).body as BookingResponse;
    await prisma.user.update({
      where: { id: attendee.id },
      data: { emailVerified: false },
    });
    await cancel(reservation.id).expect(200);
    const personal = (await book(admin).expect(201)).body as BookingResponse;
    const clock = jest
      .spyOn(Date, 'now')
      .mockReturnValue(event.startsAt.getTime() - 86400000);
    await cancel(personal.reservation.id, admin).expect(409);
    clock.mockReturnValue(event.startsAt.getTime() - 86400000 - 1);
    await cancel(personal.reservation.id, admin).expect(200);
    expect(
      await prisma.reservation.findUnique({
        where: { id: personal.reservation.id },
      }),
    ).toMatchObject({
      cancelledById: admin.id,
      cancellationSource: 'SELF_SERVICE',
      cancellationReason: null,
    });
  });

  it('repeated and concurrent cancellation preserves the first metadata and one notice', async () => {
    const { reservation } = (await book().expect(201)).body as BookingResponse;
    const responses = await Promise.all([
      cancel(reservation.id).expect(200),
      cancel(reservation.id).expect(200),
    ]);
    expect(responses[0].body).toEqual(responses[1].body);
    const original = await prisma.reservation.findUniqueOrThrow({
      where: { id: reservation.id },
    });
    jest.spyOn(Date, 'now').mockReturnValue(event.endsAt.getTime());
    expect((await cancel(reservation.id).expect(200)).body).toEqual(
      responses[0].body,
    );
    expect(
      await prisma.reservation.findUniqueOrThrow({
        where: { id: reservation.id },
      }),
    ).toEqual(original);
    await expectCounts(1, 2);
  });

  it('cancellation and its notification roll back together on enqueue failure', async () => {
    const { reservation } = (await book().expect(201)).body as BookingResponse;
    const originalNotifications = new NotificationsService();
    jest
      .spyOn(notifications, 'enqueue')
      .mockImplementationOnce(async (tx, input) => {
        await originalNotifications.enqueue(tx, input);
        throw new Error('sensitive-cancellation-details');
      });
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const response = await cancel(reservation.id).expect(500);
    expect(JSON.stringify(response.body)).not.toContain(
      'sensitive-cancellation-details',
    );
    expect(
      await prisma.reservation.findUnique({ where: { id: reservation.id } }),
    ).toMatchObject({
      status: 'CONFIRMED',
      cancelledAt: null,
      cancelledById: null,
      cancellationSource: null,
    });
    await expectCounts(1);
    await cancel(reservation.id).expect(200);
    await expectCounts(1, 2);
  });

  it('cancel_rebook_cancel_preserves_all_history', async () => {
    const first = (await book().expect(201)).body as BookingResponse;
    await cancel(first.reservation.id).expect(200);
    const original = await prisma.reservation.findUniqueOrThrow({
      where: { id: first.reservation.id },
    });
    await prisma.event.update({
      where: { id: event.id },
      data: { scheduleRevision: 2 },
    });
    const second = (await book().expect(201)).body as BookingResponse;
    expect(second.reservation.id).not.toBe(first.reservation.id);
    expect(second.reservation.bookingReference).not.toBe(
      first.reservation.bookingReference,
    );
    expect(
      await prisma.reservation.findUnique({
        where: { id: second.reservation.id },
      }),
    ).toMatchObject({ bookedRevision: 2 });
    expect((await get(second.reservation.id).expect(200)).body).toMatchObject({
      reservation: { affectedByChange: false },
    });
    await cancel(second.reservation.id).expect(200);
    expect(
      await prisma.reservation.findUniqueOrThrow({
        where: { id: first.reservation.id },
      }),
    ).toEqual(original);
    const history = (await list().expect(200)).body as ReservationListResponse;
    expect(history.current).toEqual([]);
    expect(history.history.map((entry) => entry.id).sort()).toEqual(
      [first.reservation.id, second.reservation.id].sort(),
    );
    expect(history.history.every((entry) => entry.status === 'CANCELLED')).toBe(
      true,
    );
    await expectCounts(2, 4);
    const third = (await book().expect(201)).body as BookingResponse;
    await cancel(first.reservation.id).expect(200);
    expect(
      await prisma.reservation.findUnique({
        where: { id: third.reservation.id },
      }),
    ).toMatchObject({ status: 'CONFIRMED', bookedRevision: 2 });
    await expectCounts(3, 5);
  });

  it('rebooking after a change does not inherit the earlier cancellation exception', async () => {
    await prisma.event.update({
      where: { id: event.id },
      data: {
        registrationClosesAt: new Date(event.startsAt.getTime() - 3600000),
      },
    });
    const first = (await book().expect(201)).body as BookingResponse;
    await prisma.event.update({
      where: { id: event.id },
      data: { scheduleRevision: 1 },
    });
    jest
      .spyOn(Date, 'now')
      .mockReturnValue(event.startsAt.getTime() - 12 * 3600000);
    await cancel(first.reservation.id).expect(200);
    const second = (await book().expect(201)).body as BookingResponse;
    await cancel(second.reservation.id).expect(409);
    await expectCounts(2, 3);
  });

  it('cancellation releases capacity for only one competing new booking', async () => {
    const { reservation } = (await book().expect(201)).body as BookingResponse;
    const race = await Promise.all([
      cancel(reservation.id).expect(200),
      book(other),
    ]);
    expect([201, 409]).toContain(race[1].status);
    if (race[1].status === 409) await book(other).expect(201);
    await book(admin).expect(409);
    expect(
      await prisma.reservation.count({
        where: { eventId: event.id, status: 'CONFIRMED' },
      }),
    ).toBe(1);
    await expectCounts(2, 3);
  });

  it('cancelling after registration closes releases the place without reopening registration', async () => {
    const { reservation } = (await book().expect(201)).body as BookingResponse;
    await prisma.event.update({
      where: { id: event.id },
      data: { registrationClosesAt: new Date(Date.now() - 1000) },
    });
    await cancel(reservation.id).expect(200);
    const response = await book().expect(409);
    expect(response.body).toMatchObject({ code: 'REGISTRATION_CLOSED' });
    await book(other).expect(409);
    expect(
      await prisma.reservation.count({
        where: { eventId: event.id, status: 'CONFIRMED' },
      }),
    ).toBe(0);
    await expectCounts(1, 2);
  });

  it('rechecks attendee verification after waiting for the lock', async () => {
    await whileEventLocked(
      () => book().expect(403),
      async () => {
        await prisma.user.update({
          where: { id: attendee.id },
          data: { emailVerified: false },
        });
      },
    );
    await expectCounts(0);
  });

  it('notification failure rolls back the booking and queued job', async () => {
    const originalNotifications = new NotificationsService();
    jest
      .spyOn(notifications, 'enqueue')
      .mockImplementationOnce(async (tx, input) => {
        await originalNotifications.enqueue(tx, input);
        throw new Error('sensitive-provider-details');
      });
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const generator = jest.spyOn(
      service as unknown as { generateBookingReference(): string },
      'generateBookingReference',
    );
    const response = await book().expect(500);
    expect(JSON.stringify(response.body)).not.toContain(
      'sensitive-provider-details',
    );
    expect(generator).toHaveBeenCalledTimes(1);
    await expectCounts(0);
  });

  async function seedReferenceCollision() {
    const collisionEvent = await seedEvent();
    const reference = 'A'.repeat(24);
    await prisma.reservation.create({
      data: {
        eventId: collisionEvent.id,
        userId: other.id,
        bookedRevision: 0,
        bookingReference: reference,
      },
    });
    return reference;
  }

  it('retries a real reference collision in a fresh transaction', async () => {
    const reference = await seedReferenceCollision();
    const generator = jest
      .spyOn(
        service as unknown as { generateBookingReference(): string },
        'generateBookingReference',
      )
      .mockReturnValueOnce(reference);
    const response = await book().expect(201);
    expect(
      (response.body as BookingResponse).reservation.bookingReference,
    ).not.toBe(reference);
    expect(generator).toHaveBeenCalledTimes(2);
    await expectCounts(1);
  });

  it('stops after three reference collisions without orphan jobs', async () => {
    const reference = await seedReferenceCollision();
    const generator = jest
      .spyOn(
        service as unknown as { generateBookingReference(): string },
        'generateBookingReference',
      )
      .mockReturnValue(reference);
    await book().expect(503);
    expect(generator).toHaveBeenCalledTimes(3);
    await expectCounts(0);
  });

  it('returns owner-only current confirmation details without internal user or delivery fields', async () => {
    const response = await book().expect(201);
    const { reservation } = response.body as BookingResponse;
    await prisma.event.update({
      where: { id: event.id },
      data: {
        title: 'Updated title',
        venueName: 'Updated venue',
        scheduleRevision: 1,
      },
    });
    const details = await get(reservation.id).expect(200);
    expect(details.body).toMatchObject({
      reservation: {
        id: reservation.id,
        bookingReference: reservation.bookingReference,
        status: 'CONFIRMED',
        affectedByChange: true,
        cancellationClosesAt: event.startsAt.toISOString(),
        event: { title: 'Updated title', venueName: 'Updated venue' },
      },
      organizerContactEmail: 'organizer@example.invalid',
    });
    for (const field of [
      'userId',
      'attendee',
      'emailJob',
      'deduplicationKey',
      'cancelledById',
    ])
      expect(JSON.stringify(details.body)).not.toContain(`"${field}"`);
    const foreign = await get(reservation.id, other).expect(404);
    const missing = await get(randomUUID(), other).expect(404);
    expect(foreign.body).toEqual(missing.body);
    await request(app.getHttpServer())
      .get(`/api/reservations/${reservation.id}`)
      .expect(401);
    await get('invalid').expect(400);
    await get(reservation.bookingReference).expect(400);
  });

  it('lists only owned bookings and refreshes after booking', async () => {
    expect((await list().expect(200)).body).toEqual({
      current: [],
      history: [],
      organizerContactEmail: 'organizer@example.invalid',
    });
    const { reservation } = (await book().expect(201)).body as BookingResponse;
    const result = (await list().expect(200)).body as ReservationListResponse;
    expect(result.current.map((entry) => entry.id)).toEqual([reservation.id]);
    expect(result.current[0]).toMatchObject({
      bookingReference: reservation.bookingReference,
      status: 'CONFIRMED',
      affectedByChange: false,
      cancellationClosesAt: new Date(
        event.startsAt.getTime() - 86400000,
      ).toISOString(),
    });
    expect(result.history).toEqual([]);
    expect((await list(other).expect(200)).body).toMatchObject({
      current: [],
      history: [],
    });
    const foreign = await get(reservation.id, other).expect(404);
    const missing = await get(randomUUID(), other).expect(404);
    expect(foreign.body).toEqual(missing.body);
  });

  it('rejects anonymous list reads and unexpected identity/filter query parameters', async () => {
    await request(app.getHttpServer()).get('/api/reservations').expect(401);
    for (const query of [
      { userId: other.id },
      { status: 'CONFIRMED' },
      { bookingReference: randomUUID() },
    ])
      await list().query(query).expect(400);
  });

  it('allows unverified attendees to read existing owned bookings and keeps admin lists personal', async () => {
    const { reservation } = (await book().expect(201)).body as BookingResponse;
    await prisma.user.update({
      where: { id: attendee.id },
      data: { emailVerified: false },
    });
    const result = (await list().expect(200)).body as ReservationListResponse;
    expect(result.current.map((entry) => entry.id)).toEqual([reservation.id]);
    await get(reservation.id).expect(200);
    expect((await list(admin).expect(200)).body).toMatchObject({
      current: [],
      history: [],
    });
    const next = await seedEvent();
    const personal = (await book(admin, { eventId: next.id }).expect(201))
      .body as BookingResponse;
    expect(
      (
        (await list(admin).expect(200)).body as ReservationListResponse
      ).current.map((entry) => entry.id),
    ).toEqual([personal.reservation.id]);
  });

  it.each([-1, 0, 1])(
    'groups a confirmed reservation at %i ms relative to event end',
    async (offset) => {
      const { reservation } = (await book().expect(201))
        .body as BookingResponse;
      jest.spyOn(Date, 'now').mockReturnValue(event.endsAt.getTime() + offset);
      const result = (await list().expect(200)).body as ReservationListResponse;
      expect(result.current.map((entry) => entry.id)).toEqual(
        offset < 0 ? [reservation.id] : [],
      );
      expect(result.history.map((entry) => entry.id)).toEqual(
        offset < 0 ? [] : [reservation.id],
      );
    },
  );

  it('preserves cancelled booking history and later references for the same event', async () => {
    const earlier = await prisma.reservation.create({
      data: {
        eventId: event.id,
        userId: attendee.id,
        bookingReference: randomUUID(),
        bookedRevision: 0,
        status: 'CANCELLED',
        cancelledAt: new Date(),
        cancelledById: attendee.id,
        cancellationSource: 'SELF_SERVICE',
      },
    });
    const { reservation } = (await book().expect(201)).body as BookingResponse;
    const result = (await list().expect(200)).body as ReservationListResponse;
    expect(result.current.map((entry) => entry.bookingReference)).toEqual([
      reservation.bookingReference,
    ]);
    expect(result.history.map((entry) => entry.bookingReference)).toEqual([
      earlier.bookingReference,
    ]);
    expect(result.history[0].status).toBe('CANCELLED');
    expect(result.history[0].cancelledAt).toBe(
      earlier.cancelledAt!.toISOString(),
    );
  });

  it('puts cancelled events in history and returns updated event details and revised deadlines', async () => {
    const { reservation } = (await book().expect(201)).body as BookingResponse;
    await prisma.event.update({
      where: { id: event.id },
      data: {
        title: 'Revised workshop',
        venueName: 'New venue',
        scheduleRevision: 1,
      },
    });
    const changed = (await list().expect(200)).body as ReservationListResponse;
    const detail = (await get(reservation.id).expect(200)).body as {
      reservation: ListedReservation;
    };
    expect(changed.current[0]).toEqual(detail.reservation);
    expect(changed.current[0]).toMatchObject({
      affectedByChange: true,
      cancellationClosesAt: event.startsAt.toISOString(),
      event: { title: 'Revised workshop', venueName: 'New venue' },
    });
    await prisma.event.update({
      where: { id: event.id },
      data: {
        status: 'CANCELLED',
        cancelledAt: new Date(),
        cancelledById: admin.id,
        cancellationReason: 'Test cancellation',
      },
    });
    const cancelled = (await list().expect(200))
      .body as ReservationListResponse;
    expect(cancelled.current).toEqual([]);
    expect(cancelled.history[0]).toMatchObject({
      id: reservation.id,
      event: { status: 'CANCELLED' },
    });
  });

  it('orders current by event start and history by descending event start with stable booking ties', async () => {
    const createdAt = new Date('2026-01-01T00:00:00Z');
    const earlierEvent = await seedEvent({
      startsAt: new Date(event.startsAt.getTime() - 3600000),
      endsAt: new Date(event.endsAt.getTime() - 3600000),
    });
    const active = await prisma.reservation.create({
      data: {
        eventId: event.id,
        userId: attendee.id,
        bookedRevision: 0,
        bookingReference: randomUUID(),
        createdAt,
      },
    });
    const earlierActive = await prisma.reservation.create({
      data: {
        eventId: earlierEvent.id,
        userId: attendee.id,
        bookedRevision: 0,
        bookingReference: randomUUID(),
        createdAt,
      },
    });
    const cancelled = await prisma.reservation.createManyAndReturn({
      data: [event.id, event.id, event.id, earlierEvent.id].map(
        (eventId, index) => ({
          eventId,
          userId: attendee.id,
          bookedRevision: 0,
          bookingReference: randomUUID(),
          createdAt:
            index === 0 ? new Date(createdAt.getTime() + 1000) : createdAt,
          status: 'CANCELLED',
          cancelledAt: new Date(),
          cancelledById: attendee.id,
          cancellationSource: 'SELF_SERVICE',
        }),
      ),
    });
    const result = (await list().expect(200)).body as ReservationListResponse;
    expect(result.current.map((entry) => entry.id)).toEqual([
      earlierActive.id,
      active.id,
    ]);
    const ties = [cancelled[1].id, cancelled[2].id].sort().reverse();
    expect(result.history.map((entry) => entry.id)).toEqual([
      cancelled[0].id,
      ...ties,
      cancelled[3].id,
    ]);
  });

  it('returns safe list errors without exposing database details', async () => {
    jest
      .spyOn(prisma.reservation, 'findMany')
      .mockRejectedValueOnce(new Error('sensitive-database-details'));
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const failed = await list().expect(500);
    expect(failed.body).toMatchObject({ code: 'INTERNAL_ERROR' });
    expect(JSON.stringify(failed.body)).not.toContain(
      'sensitive-database-details',
    );
    await list().expect(200);
  });

  it('retains readable cancellation status and standard deadline on a reopened confirmation', async () => {
    const response = await book().expect(201);
    const { reservation } = response.body as BookingResponse;
    await prisma.reservation.update({
      where: { id: reservation.id },
      data: {
        status: 'CANCELLED',
        cancelledAt: new Date(),
        cancelledById: attendee.id,
        cancellationSource: 'SELF_SERVICE',
      },
    });
    await prisma.event.update({
      where: { id: event.id },
      data: {
        status: 'CANCELLED',
        cancelledAt: new Date(),
        cancelledById: admin.id,
        cancellationReason: 'Test cancellation',
      },
    });
    const details = await get(reservation.id).expect(200);
    expect(details.body).toMatchObject({
      reservation: {
        status: 'CANCELLED',
        affectedByChange: false,
        cancellationClosesAt: new Date(
          event.startsAt.getTime() - 86400000,
        ).toISOString(),
        event: { status: 'CANCELLED' },
      },
    });
  });
});
