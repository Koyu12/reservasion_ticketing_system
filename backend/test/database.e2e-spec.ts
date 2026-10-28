import 'dotenv/config';
import { jest } from '@jest/globals';
import { Test } from '@nestjs/testing';
import { PrismaModule } from '../src/prisma/prisma.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { randomUUID } from 'node:crypto';
import { Client } from 'pg';

import { requireTestDatabaseUrl } from './test-database.js';

describe('Database test target guard', () => {
  it('requires an explicit test connection', () => {
    expect(() => requireTestDatabaseUrl()).toThrow('TEST_DATABASE_URL');
  });

  it('accepts the dedicated PostgreSQL test database', () => {
    const url =
      'postgresql://postgres@localhost:5432/reservation_ticketing_system_test';
    expect(requireTestDatabaseUrl(url)).toBe(url);
  });

  it.each([
    'postgresql://postgres@localhost:5432/reservation_ticketing_system',
    'postgresql://postgres@localhost:5432/production',
    'postgresql://postgres@localhost:5432/postgres',
    'https://localhost/reservation_ticketing_system_test',
    'postgresql://postgres@localhost/reservation_ticketing_system_test?schema=other',
    'not-a-url',
  ])('rejects an unsafe or invalid target: %s', (url) => {
    expect(() => requireTestDatabaseUrl(url)).toThrow();
  });

  it('rejects the development target even with different credentials or schema', () => {
    expect(() =>
      requireTestDatabaseUrl(
        'postgresql://tester@127.0.0.1/reservation_ticketing_system_test?schema=public',
        'postgresql://developer@localhost:5432/reservation_ticketing_system_test?schema=other',
      ),
    ).toThrow('must differ');
  });
});

describe('PrismaModule PostgreSQL integration', () => {
  it('queries the test database through a shared provider and disconnects on shutdown', async () => {
    const url = requireTestDatabaseUrl(
      process.env.TEST_DATABASE_URL,
      process.env.DATABASE_URL,
    );
    const originalUrl = process.env.DATABASE_URL;
    const moduleBuilder = Test.createTestingModule({ imports: [PrismaModule] });
    let app: Awaited<ReturnType<typeof moduleBuilder.compile>> | undefined;
    try {
      process.env.DATABASE_URL = url;
      app = await moduleBuilder.compile();
    } finally {
      if (originalUrl === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = originalUrl;
    }

    try {
      await app.init();
      const prisma = app.get(PrismaService);
      expect(await app.resolve(PrismaService)).toBe(prisma);
      const target = await prisma.$queryRaw<{ database: string }[]>`
        SELECT current_database() AS database
      `;
      expect(target[0].database).toBe('reservation_ticketing_system_test');
      await expect(
        prisma.$transaction((transaction) => transaction.event.count()),
      ).resolves.toEqual(expect.any(Number));

      const disconnect = jest.spyOn(prisma, '$disconnect');
      try {
        await app.close();
        app = undefined;
        expect(disconnect).toHaveBeenCalledTimes(1);
      } finally {
        disconnect.mockRestore();
      }
    } finally {
      await app?.close();
    }
  });
});

describe('PostgreSQL business constraints', () => {
  let database: Client;
  let userId: string;
  let eventId: string;
  let changeId: string;
  let reservationId: string;
  let jobId: string;
  let transactionStarted = false;
  const now = new Date('2030-01-01T00:00:00Z');

  beforeAll(async () => {
    database = new Client({
      connectionString: requireTestDatabaseUrl(
        process.env.TEST_DATABASE_URL,
        process.env.DATABASE_URL,
      ),
      connectionTimeoutMillis: 5000,
      options: '-c search_path=public -c statement_timeout=5000',
    });
    await database.connect();
    const result = await database.query<{ database: string }>(
      'SELECT current_database() AS database',
    );
    expect(result.rows[0].database).toBe('reservation_ticketing_system_test');
  });

  beforeEach(async () => {
    userId = randomUUID();
    eventId = randomUUID();
    changeId = randomUUID();
    reservationId = randomUUID();
    jobId = randomUUID();
    await database.query('BEGIN');
    transactionStarted = true;
    await database.query(
      `INSERT INTO "User" ("id", "name", "email") VALUES ($1, 'Test attendee', $2)`,
      [userId, `${userId}@example.invalid`],
    );
    await database.query(
      `INSERT INTO "Event" (
        "id", "createdById", "title", "description", "venueName", "venueAddress",
        "startsAt", "endsAt", "registrationClosesAt", "capacity"
      ) VALUES ($1, $2, 'Test workshop', 'Description', 'Venue', 'Address',
        '2030-01-10 09:00+07', '2030-01-10 12:00+07', '2030-01-09 09:00+07', 10)`,
      [eventId, userId],
    );
    await database.query(
      `INSERT INTO "EventChange" (
        "id", "eventId", "revision", "oldStartsAt", "oldEndsAt", "newStartsAt",
        "newEndsAt", "oldVenueName", "oldVenueAddress", "newVenueName",
        "newVenueAddress", "changedById", "reason"
      ) VALUES ($1, $2, 1, '2030-01-10 09:00+07', '2030-01-10 12:00+07',
        '2030-01-11 09:00+07', '2030-01-11 12:00+07',
        'Old venue', 'Old address', 'New venue', 'New address', $3, 'Schedule changed')`,
      [changeId, eventId, userId],
    );
    await createReservation(reservationId);
    await database.query(
      `INSERT INTO "EmailJob" (
        "id", "reservationId", "eventChangeId", "type", "recipientEmail",
        "deduplicationKey", "nextAttemptAt"
      ) VALUES ($1::uuid, $2, $3, 'EVENT_CHANGED', $4, $1::text, $5)`,
      [jobId, reservationId, changeId, `${userId}@example.invalid`, now],
    );
  });

  afterEach(async () => {
    if (!transactionStarted) return;
    await database.query('ROLLBACK');
    transactionStarted = false;
    if (userId) {
      const result = await database.query<{ count: number }>(
        `SELECT count(*)::int AS count FROM "User" WHERE "id" = $1`,
        [userId],
      );
      expect(result.rows[0].count).toBe(0);
    }
  });

  afterAll(async () => {
    await database?.end();
  });

  function createReservation(id: string, cancelled = false) {
    return database.query(
      `INSERT INTO "Reservation" (
        "id", "eventId", "userId", "bookingReference", "bookedRevision", "status",
        "cancelledAt", "cancelledById", "cancellationSource"
      ) VALUES ($1::uuid, $2, $3, $1::text, 0, $4, $5, $6, $7)`,
      [
        id,
        eventId,
        userId,
        cancelled ? 'CANCELLED' : 'CONFIRMED',
        cancelled ? now : null,
        cancelled ? userId : null,
        cancelled ? 'SELF_SERVICE' : null,
      ],
    );
  }

  function update(
    table: 'Event' | 'EventChange' | 'Reservation' | 'EmailJob',
    id: string,
    fields: Record<string, unknown>,
  ) {
    // Identifiers come only from the fixed test cases below; values are parameters.
    const entries = Object.entries(fields);
    return database.query(
      `UPDATE "${table}" SET ${entries
        .map(([key], index) => `"${key}" = $${index + 1}`)
        .join(', ')} WHERE "id" = $${entries.length + 1}`,
      [...entries.map(([, value]) => value), id],
    );
  }

  it('rejects a second confirmed booking for the same attendee and event', async () => {
    await expect(createReservation(randomUUID())).rejects.toMatchObject({
      code: '23505',
      constraint: 'reservation_one_confirmed_per_attendee',
    });
  });

  it('retains multiple cancelled bookings and permits a new booking after cancellation', async () => {
    await createReservation(randomUUID(), true);
    await createReservation(randomUUID(), true);
    await update('Reservation', reservationId, {
      status: 'CANCELLED',
      cancelledAt: now,
      cancelledById: userId,
      cancellationSource: 'SELF_SERVICE',
    });
    await createReservation(randomUUID());
    const result = await database.query<{ status: string; count: number }>(
      `SELECT "status", count(*)::int AS count FROM "Reservation"
       WHERE "eventId" = $1 GROUP BY "status" ORDER BY "status"`,
      [eventId],
    );
    expect(result.rows).toEqual([
      { status: 'CONFIRMED', count: 1 },
      { status: 'CANCELLED', count: 3 },
    ]);
  });

  it.each([
    ['zero capacity', { capacity: 0 }, 'Event_capacity_positive'],
    ['negative capacity', { capacity: -1 }, 'Event_capacity_positive'],
    [
      'end equal to start',
      { endsAt: '2030-01-10 09:00+07' },
      'Event_schedule_valid',
    ],
    [
      'end before start',
      { endsAt: '2030-01-10 08:00+07' },
      'Event_schedule_valid',
    ],
    [
      'late registration deadline',
      { registrationClosesAt: '2030-01-10 10:00+07' },
      'Event_registration_deadline_valid',
    ],
    [
      'negative revision',
      { scheduleRevision: -1 },
      'Event_revision_nonnegative',
    ],
  ])('rejects an event with %s', async (_label, fields, constraint) => {
    await expect(update('Event', eventId, fields)).rejects.toMatchObject({
      code: '23514',
      constraint,
    });
  });

  it('accepts a deadline equal to the start and positive capacity', async () => {
    await expect(
      update('Event', eventId, {
        capacity: 1,
        registrationClosesAt: '2030-01-10 09:00+07',
      }),
    ).resolves.toMatchObject({ rowCount: 1 });
  });

  it.each([null, '', ' \t\n'])(
    'rejects event cancellation reason %p',
    async (reason) => {
      await expect(
        update('Event', eventId, {
          status: 'CANCELLED',
          cancelledAt: now,
          cancelledById: userId,
          cancellationReason: reason,
        }),
      ).rejects.toMatchObject({
        code: '23514',
        constraint: 'Event_cancellation_metadata_valid',
      });
    },
  );

  it('accepts an event cancellation with its actor, time, and reason', async () => {
    await expect(
      update('Event', eventId, {
        status: 'CANCELLED',
        cancelledAt: now,
        cancelledById: userId,
        cancellationReason: 'Organizer unavailable',
      }),
    ).resolves.toMatchObject({ rowCount: 1 });
  });

  it.each([
    ['zero revision', { revision: 0 }, 'EventChange_revision_positive'],
    [
      'invalid old schedule',
      { oldEndsAt: '2030-01-10 08:00+07' },
      'EventChange_old_schedule_valid',
    ],
    [
      'invalid new schedule',
      { newEndsAt: '2030-01-11 09:00+07' },
      'EventChange_new_schedule_valid',
    ],
    ['empty reason', { reason: '' }, 'EventChange_reason_nonblank'],
    ['whitespace reason', { reason: ' \t\n' }, 'EventChange_reason_nonblank'],
  ])('rejects a change with %s', async (_label, fields, constraint) => {
    await expect(update('EventChange', changeId, fields)).rejects.toMatchObject(
      { code: '23514', constraint },
    );
  });

  it('rejects a negative booked revision', async () => {
    await expect(
      update('Reservation', reservationId, { bookedRevision: -1 }),
    ).rejects.toMatchObject({
      code: '23514',
      constraint: 'Reservation_booked_revision_nonnegative',
    });
  });

  describe.each(['ADMIN', 'EVENT_CANCELLED'])(
    '%s reservation cancellation',
    (source) => {
      it.each([null, '', ' \t\n'])('rejects reason %p', async (reason) => {
        await expect(
          update('Reservation', reservationId, {
            status: 'CANCELLED',
            cancelledAt: now,
            cancelledById: userId,
            cancellationSource: source,
            cancellationReason: reason,
          }),
        ).rejects.toMatchObject({
          code: '23514',
          constraint: 'Reservation_cancellation_metadata_valid',
        });
      });

      it('accepts a nonblank reason', async () => {
        await expect(
          update('Reservation', reservationId, {
            status: 'CANCELLED',
            cancelledAt: now,
            cancelledById: userId,
            cancellationSource: source,
            cancellationReason: 'Organizer cancelled',
          }),
        ).resolves.toMatchObject({ rowCount: 1 });
      });
    },
  );

  it.each([
    [
      'negative total attempts',
      { attemptCount: -1 },
      'EmailJob_attempt_counts_valid',
    ],
    [
      'negative cycle attempts',
      { retryCycleAttemptCount: -1 },
      'EmailJob_attempt_counts_valid',
    ],
    [
      'cycle greater than total',
      { attemptCount: 1, retryCycleAttemptCount: 2 },
      'EmailJob_attempt_counts_valid',
    ],
    [
      'missing change context',
      { eventChangeId: null },
      'EmailJob_change_context_valid',
    ],
    [
      'unexpected change context',
      { type: 'BOOKING_CONFIRMED' },
      'EmailJob_change_context_valid',
    ],
    [
      'manual retry time without actor',
      { lastManualRetryAt: now },
      'EmailJob_manual_retry_metadata_valid',
    ],
    [
      'pending job without retry time',
      { nextAttemptAt: null },
      'EmailJob_state_metadata_valid',
    ],
    [
      'pending job with a claim',
      { claimToken: randomUUID() },
      'EmailJob_state_metadata_valid',
    ],
    [
      'pending job with sent time',
      { sentAt: now },
      'EmailJob_state_metadata_valid',
    ],
    [
      'pending job with skip metadata',
      { skippedAt: now, skipReason: 'Obsolete' },
      'EmailJob_state_metadata_valid',
    ],
    [
      'processing job without expiry',
      { status: 'PROCESSING', nextAttemptAt: null, claimToken: randomUUID() },
      'EmailJob_state_metadata_valid',
    ],
    [
      'sent job without sent time',
      { status: 'SENT', nextAttemptAt: null },
      'EmailJob_state_metadata_valid',
    ],
    [
      'failed job without error',
      { status: 'FAILED', nextAttemptAt: null },
      'EmailJob_state_metadata_valid',
    ],
    [
      'failed job with blank error',
      { status: 'FAILED', nextAttemptAt: null, lastError: ' \t\n' },
      'EmailJob_state_metadata_valid',
    ],
    [
      'skipped job without reason',
      { status: 'SKIPPED', nextAttemptAt: null, skippedAt: now },
      'EmailJob_state_metadata_valid',
    ],
    [
      'skipped job with blank reason',
      {
        status: 'SKIPPED',
        nextAttemptAt: null,
        skippedAt: now,
        skipReason: ' \t\n',
      },
      'EmailJob_state_metadata_valid',
    ],
  ])('rejects email metadata: %s', async (_label, fields, constraint) => {
    await expect(update('EmailJob', jobId, fields)).rejects.toMatchObject({
      code: '23514',
      constraint,
    });
  });

  it('rejects a manual retry actor without a timestamp', async () => {
    await expect(
      update('EmailJob', jobId, { lastManualRetryById: userId }),
    ).rejects.toMatchObject({
      code: '23514',
      constraint: 'EmailJob_manual_retry_metadata_valid',
    });
  });

  it('accepts complete manual retry metadata and reset cycle counters', async () => {
    await expect(
      update('EmailJob', jobId, {
        lastManualRetryById: userId,
        lastManualRetryAt: now,
        attemptCount: 3,
        retryCycleAttemptCount: 0,
      }),
    ).resolves.toMatchObject({ rowCount: 1 });
  });

  it.each([
    ['PENDING', { nextAttemptAt: now }],
    [
      'PROCESSING',
      { nextAttemptAt: null, claimToken: randomUUID(), claimExpiresAt: now },
    ],
    [
      'SENT',
      { nextAttemptAt: null, sentAt: now, lastError: 'Earlier timeout' },
    ],
    ['FAILED', { nextAttemptAt: null, lastError: 'Provider timeout' }],
    [
      'SKIPPED',
      { nextAttemptAt: null, skippedAt: now, skipReason: 'Obsolete notice' },
    ],
  ])('accepts a valid %s email state', async (status, fields) => {
    await expect(
      update('EmailJob', jobId, { ...fields, status }),
    ).resolves.toMatchObject({ rowCount: 1 });
  });

  it.each(['User', 'Event', 'EventChange', 'Reservation'] as const)(
    'prevents deletion of referenced %s history',
    async (table) => {
      const ids = {
        User: userId,
        Event: eventId,
        EventChange: changeId,
        Reservation: reservationId,
      };
      await expect(
        database.query(`DELETE FROM "${table}" WHERE "id" = $1`, [ids[table]]),
      ).rejects.toMatchObject({ code: '23503' });
    },
  );
});
