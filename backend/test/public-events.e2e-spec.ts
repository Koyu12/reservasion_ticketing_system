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
import type { Prisma } from '../src/generated/prisma/client.js';
import { requireTestDatabaseUrl } from './test-database.js';

type PublicEvent = {
  id: string;
  title: string;
  startsAt: string;
  endsAt: string;
  venueName: string;
  registrationClosesAt: string;
  status: string;
  capacity: number;
  confirmedCount: number;
  remainingPlaces: number;
  availability: string;
};
type EventList = { events: PublicEvent[]; organizerContactEmail: string };
type EventDetail = {
  event: PublicEvent & {
    description: string;
    venueAddress: string;
    cancellationClosesAt: string;
    cancelledAt: string | null;
    cancellationReason: string | null;
  };
  organizerContactEmail: string;
};
const now = Date.parse('2035-01-01T00:00:00Z');

describe('Public workshop discovery (PostgreSQL)', () => {
  let app: INestApplication<Server>;
  let prisma: PrismaService;
  const adminId = randomUUID();
  const attendeeId = randomUUID();
  const previous: Record<string, string | undefined> = {};

  beforeAll(async () => {
    const url = requireTestDatabaseUrl(
      process.env.TEST_DATABASE_URL,
      process.env.DATABASE_URL,
    );
    const settings = {
      DATABASE_URL: url,
      BETTER_AUTH_SECRET: randomBytes(32).toString('hex'),
      BETTER_AUTH_URL: 'http://localhost:3000',
      FRONTEND_URL: 'http://localhost:5173',
      ORGANIZER_CONTACT_EMAIL: 'organizer@example.invalid',
    };
    for (const [key, value] of Object.entries(settings)) {
      previous[key] = process.env[key];
      process.env[key] = value;
    }
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(EmailService)
      .useValue({ send: () => Promise.reject(new Error('No email expected')) })
      .compile();
    app = module.createNestApplication({ bodyParser: false });
    prisma = app.get(PrismaService);
    expect(
      (
        await prisma.$queryRaw<
          { database: string }[]
        >`SELECT current_database() AS database`
      )[0].database,
    ).toBe('reservation_ticketing_system_test');
    await app.init();
    await prisma.user.createMany({
      data: [
        {
          id: adminId,
          name: 'Private organizer',
          email: `public-admin-${adminId}@example.invalid`,
          role: 'ADMIN',
        },
        {
          id: attendeeId,
          name: 'Private attendee',
          email: `public-attendee-${attendeeId}@example.invalid`,
        },
      ],
    });
  });

  beforeEach(() => {
    jest.spyOn(Date, 'now').mockReturnValue(now);
  });
  afterEach(async () => {
    jest.restoreAllMocks();
    if (prisma) {
      const event = { createdById: adminId };
      await prisma.eventChange.deleteMany({ where: { event } });
      await prisma.reservation.deleteMany({ where: { event } });
      await prisma.event.deleteMany({ where: event });
    }
  });
  afterAll(async () => {
    try {
      await prisma?.user.deleteMany({
        where: { id: { in: [adminId, attendeeId] } },
      });
    } finally {
      await app?.close();
      for (const [key, value] of Object.entries(previous)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  });

  function seed(overrides: Partial<Prisma.EventUncheckedCreateInput> = {}) {
    const startsAt = overrides.startsAt
      ? new Date(overrides.startsAt)
      : new Date('2035-01-02T09:00:00+07:00');
    return prisma.event.create({
      data: {
        createdById: adminId,
        title: 'Practical TypeScript',
        description: 'An in-person workshop.',
        venueName: 'Main hall',
        venueAddress: '10 Example Road',
        capacity: 4,
        status: 'PUBLISHED',
        startsAt,
        endsAt: new Date(startsAt.getTime() + 3600000),
        registrationClosesAt: new Date(startsAt.getTime() - 3600000),
        ...overrides,
      },
    });
  }
  function cancelled(startsAt?: Date) {
    return seed({
      status: 'CANCELLED',
      cancelledAt: new Date(now),
      cancelledById: adminId,
      cancellationReason: 'Workshop venue unavailable',
      ...(startsAt ? { startsAt } : {}),
    });
  }
  function get(path = '') {
    return request(app.getHttpServer()).get(`/api/events${path}`);
  }
  async function list(path = '') {
    const response = await get(path).expect(200);
    return response.body as EventList;
  }
  async function detail(id: string) {
    const response = await get(`/${id}`).expect(200);
    return response.body as EventDetail;
  }

  it('allows anonymous discovery, filters by publication/start, and orders consistently', async () => {
    const late = await seed({
      startsAt: new Date('2035-01-03T09:00:00+07:00'),
    });
    const first = await seed();
    const tied = await seed();
    await seed({ status: 'DRAFT' });
    await cancelled();
    await seed({ startsAt: new Date(now) });
    await seed({ startsAt: new Date(now - 7200000) });
    const response = await list();
    expect(response.events.map((event) => event.id)).toEqual([
      ...[first.id, tied.id].sort(),
      late.id,
    ]);
    expect(response.organizerContactEmail).toBe('organizer@example.invalid');
    await request(app.getHttpServer()).get('/api/admin/events').expect(401);
  });

  it('combines trimmed case-insensitive literal title search with a WIB date range', async () => {
    const target = await seed({ title: 'Practical TypeScript 100%_hands-on' });
    await seed({ title: 'Practical TypeScript 100xhands-on' });
    await seed({
      title: target.title,
      startsAt: new Date('2035-01-03T09:00:00+07:00'),
    });
    expect(
      (
        await list(
          `?q=${encodeURIComponent('  TYPESCRIPT 100%_  ')}&from=2035-01-02&to=2035-01-02`,
        )
      ).events.map((event) => event.id),
    ).toEqual([target.id]);
    expect((await list('?q=not-found')).events).toEqual([]);
    expect((await list('?q=%20%20')).events).toHaveLength(3);
  });

  it('uses inclusive/exclusive WIB day boundaries independently of process timezone', async () => {
    await seed({ startsAt: new Date('2035-01-01T16:59:59.999Z') });
    const midnight = await seed({ startsAt: new Date('2035-01-01T17:00:00Z') });
    const last = await seed({ startsAt: new Date('2035-01-02T16:59:59.999Z') });
    await seed({ startsAt: new Date('2035-01-02T17:00:00Z') });
    const timezone = process.env.TZ;
    try {
      for (const zone of ['America/Los_Angeles', 'Asia/Jakarta']) {
        process.env.TZ = zone;
        expect(
          (await list('?from=2035-01-02&to=2035-01-02')).events.map(
            (event) => event.id,
          ),
        ).toEqual([midnight.id, last.id]);
      }
    } finally {
      if (timezone === undefined) delete process.env.TZ;
      else process.env.TZ = timezone;
    }
  });

  it('rejects malformed dates, repeated/unknown parameters, and invalid UUIDs', async () => {
    expect((await list('?to=0001-01-01')).events).toEqual([]);
    for (const query of [
      'from=2035-02-30',
      'to=2035-02-30',
      'from=2035-13-01',
      'to=2035-13-01',
      'from=0000-01-01',
      'to=0000-01-01',
      'from=tomorrow',
      'to=tomorrow',
      'from=',
      'to=',
      'q=one&q=two',
      'from=2035-01-02&from=2035-01-03',
      'to=2035-01-02&to=2035-01-03',
      'date=2035-01-02',
      'status=DRAFT',
    ]) {
      await get(`?${query}`).expect(400);
    }
    await get('/not-a-uuid').expect(400);
    const draft = await seed({ status: 'DRAFT' });
    const hidden = await get(`/${draft.id}`).expect(404);
    const missing = await get(`/${randomUUID()}`).expect(404);
    expect(hidden.body).toEqual(missing.body);
  });

  it('supports either date bound and inclusive ranges across multiple WIB days', async () => {
    const first = await seed({
      startsAt: new Date('2035-01-02T00:00:00+07:00'),
    });
    const middle = await seed({
      startsAt: new Date('2035-01-03T10:00:00+07:00'),
    });
    const last = await seed({
      startsAt: new Date('2035-01-04T23:59:59.999+07:00'),
    });
    const outside = await seed({
      startsAt: new Date('2035-01-05T00:00:00+07:00'),
    });
    expect(
      (await list('?from=2035-01-03')).events.map((event) => event.id),
    ).toEqual([middle.id, last.id, outside.id]);
    expect(
      (await list('?to=2035-01-03')).events.map((event) => event.id),
    ).toEqual([first.id, middle.id]);
    expect(
      (await list('?from=2035-01-02&to=2035-01-04')).events.map(
        (event) => event.id,
      ),
    ).toEqual([first.id, middle.id, last.id]);
    expect(
      (await list('?from=0001-01-01')).events.map((event) => event.id),
    ).toEqual([first.id, middle.id, last.id, outside.id]);
    expect((await list()).events).toHaveLength(4);
    expect((await list('?from=2035-01-06')).events).toEqual([]);
    expect((await list('?to=2034-12-31')).events).toEqual([]);
  });

  it('rejects a reversed range with a useful error on the To field', async () => {
    const response = await get('?from=2035-01-04&to=2035-01-02').expect(400);
    expect(response.body).toMatchObject({
      code: 'VALIDATION_ERROR',
      fieldErrors: [
        { field: 'to', message: 'To date must be on or after From date.' },
      ],
    });
  });

  it('returns complete public details, confirmed-only counts, and no private data', async () => {
    const event = await seed({ scheduleRevision: 1 });
    await prisma.reservation.create({
      data: {
        eventId: event.id,
        userId: adminId,
        bookedRevision: 1,
        bookingReference: randomUUID(),
      },
    });
    await prisma.reservation.create({
      data: {
        eventId: event.id,
        userId: attendeeId,
        bookedRevision: 0,
        bookingReference: randomUUID(),
        status: 'CANCELLED',
        cancelledAt: new Date(now),
        cancelledById: attendeeId,
        cancellationSource: 'SELF_SERVICE',
      },
    });
    await prisma.eventChange.create({
      data: {
        eventId: event.id,
        revision: 1,
        changedById: adminId,
        reason: 'Private change reason',
        oldStartsAt: event.startsAt,
        newStartsAt: event.startsAt,
        oldEndsAt: event.endsAt,
        newEndsAt: event.endsAt,
        oldVenueName: 'Old hall',
        newVenueName: event.venueName,
        oldVenueAddress: 'Old address',
        newVenueAddress: event.venueAddress,
      },
    });
    const response = await detail(event.id);
    expect(response.event).toMatchObject({
      title: event.title,
      description: event.description,
      venueName: event.venueName,
      venueAddress: event.venueAddress,
      startsAt: event.startsAt.toISOString(),
      endsAt: event.endsAt.toISOString(),
      registrationClosesAt: event.registrationClosesAt.toISOString(),
      cancellationClosesAt: new Date(
        event.startsAt.getTime() - 86400000,
      ).toISOString(),
      capacity: 4,
      confirmedCount: 1,
      remainingPlaces: 3,
      availability: 'AVAILABLE',
    });
    const listed = (await list()).events[0];
    expect(Object.keys(listed).sort()).toEqual(
      [
        'id',
        'title',
        'startsAt',
        'endsAt',
        'venueName',
        'registrationClosesAt',
        'status',
        'capacity',
        'confirmedCount',
        'remainingPlaces',
        'availability',
      ].sort(),
    );
    expect(Object.keys(response.event).sort()).toEqual(
      [
        ...Object.keys(listed),
        'description',
        'venueAddress',
        'cancellationClosesAt',
        'cancelledAt',
        'cancellationReason',
      ].sort(),
    );
    const json = JSON.stringify(response);
    expect(json).not.toContain(adminId);
    expect(json).not.toContain(attendeeId);
    expect(json).not.toContain('Private change reason');
  });

  it('calculates availability precedence at exact registration/start/end boundaries', async () => {
    const opens = await seed({
      startsAt: new Date(now + 60000),
      endsAt: new Date(now + 120000),
      registrationClosesAt: new Date(now + 10000),
    });
    const full = await seed({
      startsAt: opens.startsAt,
      endsAt: opens.endsAt,
      registrationClosesAt: opens.registrationClosesAt,
      capacity: 1,
    });
    await prisma.reservation.create({
      data: {
        eventId: full.id,
        userId: attendeeId,
        bookedRevision: 0,
        bookingReference: randomUUID(),
      },
    });
    expect((await detail(opens.id)).event.availability).toBe('AVAILABLE');
    expect((await detail(full.id)).event).toMatchObject({
      availability: 'FULL',
      remainingPlaces: 0,
    });
    expect((await list()).events).toHaveLength(2);
    const clock = jest.spyOn(Date, 'now');
    clock.mockReturnValue(now + 9999);
    expect((await detail(opens.id)).event.availability).toBe('AVAILABLE');
    clock.mockReturnValue(now + 10000);
    expect((await detail(opens.id)).event.availability).toBe(
      'REGISTRATION_CLOSED',
    );
    expect((await detail(full.id)).event.availability).toBe(
      'REGISTRATION_CLOSED',
    );
    expect((await list()).events).toHaveLength(2);
    clock.mockReturnValue(now + 60000);
    expect((await detail(opens.id)).event.availability).toBe('STARTED');
    expect((await list()).events).toEqual([]);
    clock.mockReturnValue(now + 120000);
    expect((await detail(opens.id)).event.availability).toBe('ENDED');
    const event = await cancelled(new Date(now - 7200000));
    expect((await detail(event.id)).event.availability).toBe('CANCELLED');
  });

  it('keeps cancelled direct links public while excluding them from discovery', async () => {
    const event = await cancelled();
    expect((await list()).events).toEqual([]);
    const response = await detail(event.id);
    expect(response.event).toMatchObject({
      id: event.id,
      status: 'CANCELLED',
      availability: 'CANCELLED',
      cancellationReason: 'Workshop venue unavailable',
      cancelledAt: new Date(now).toISOString(),
    });
    expect(JSON.stringify(response)).not.toContain(adminId);
  });

  it('returns a useful empty result when no workshops are published', async () => {
    await seed({ status: 'DRAFT' });
    const response = await list();
    expect(response.events).toEqual([]);
  });
});
