import 'dotenv/config';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { TestingModule } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import type { Prisma } from '../src/generated/prisma/client.js';
import { NotificationsModule } from '../src/notifications/notifications.module.js';
import { NotificationsService } from '../src/notifications/notifications.service.js';
import type { EnqueueNotificationInput } from '../src/notifications/notifications.service.js';
import { PrismaModule } from '../src/prisma/prisma.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { requireTestDatabaseUrl } from './test-database.js';

describe('Transactional notification enqueue (PostgreSQL)', () => {
  let module: TestingModule;
  let prisma: PrismaService;
  let service: NotificationsService;
  const userId = randomUUID();
  const email = `notifications-${userId}@example.invalid`;
  let eventId: string;
  let reservationId: string;

  beforeAll(async () => {
    const url = requireTestDatabaseUrl(
      process.env.TEST_DATABASE_URL,
      process.env.DATABASE_URL,
    );
    const previousUrl = process.env.DATABASE_URL;
    try {
      process.env.DATABASE_URL = url;
      module = await Test.createTestingModule({
        imports: [PrismaModule, NotificationsModule],
      }).compile();
    } finally {
      if (previousUrl === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = previousUrl;
    }
    prisma = module.get(PrismaService);
    service = module.get(NotificationsService);
    await module.init();
    expect(
      (
        await prisma.$queryRaw<
          { database: string }[]
        >`SELECT current_database() AS database`
      )[0].database,
    ).toBe('reservation_ticketing_system_test');
    await prisma.user.create({
      data: { id: userId, name: 'Notification attendee', email },
    });
  });

  beforeEach(async () => {
    const event = await createEvent();
    eventId = event.id;
    reservationId = (await createReservation(prisma)).id;
  });

  afterEach(async () => {
    if (!prisma) return;
    const event = { createdById: userId };
    await prisma.emailJob.deleteMany({ where: { reservation: { event } } });
    await prisma.reservation.deleteMany({ where: { event } });
    await prisma.eventChange.deleteMany({ where: { event } });
    await prisma.event.deleteMany({ where: event });
    await prisma.user.update({ where: { id: userId }, data: { email } });
  });

  afterAll(async () => {
    try {
      await prisma?.user.deleteMany({ where: { id: userId } });
    } finally {
      await module?.close();
    }
  });

  function createEvent() {
    return prisma.event.create({
      data: {
        createdById: userId,
        title: 'Notification test workshop',
        description: 'Test workshop',
        venueName: 'Main hall',
        venueAddress: '10 Example Road',
        startsAt: new Date('2035-01-10T02:00:00Z'),
        endsAt: new Date('2035-01-10T05:00:00Z'),
        registrationClosesAt: new Date('2035-01-09T02:00:00Z'),
        capacity: 10,
      },
    });
  }

  function createReservation(tx: Prisma.TransactionClient) {
    return tx.reservation.create({
      data: {
        eventId,
        userId,
        bookingReference: randomUUID(),
        bookedRevision: 0,
      },
    });
  }

  function createChange(changeEventId = eventId, revision = 1) {
    return prisma.eventChange.create({
      data: {
        eventId: changeEventId,
        revision,
        oldStartsAt: new Date('2035-01-10T02:00:00Z'),
        oldEndsAt: new Date('2035-01-10T05:00:00Z'),
        newStartsAt: new Date('2035-01-11T02:00:00Z'),
        newEndsAt: new Date('2035-01-11T05:00:00Z'),
        oldVenueName: 'Main hall',
        oldVenueAddress: '10 Example Road',
        newVenueName: 'New hall',
        newVenueAddress: '20 Example Road',
        changedById: userId,
        reason: 'Venue unavailable',
      },
    });
  }

  function enqueue(input: EnqueueNotificationInput) {
    return prisma.$transaction((tx) => service.enqueue(tx, input), {
      isolationLevel: 'ReadCommitted',
    });
  }

  it.each([
    'BOOKING_CONFIRMED',
    'RESERVATION_CANCELLED',
    'EVENT_CANCELLED',
    'EVENT_CHANGED',
  ] as const)('creates a valid pending %s job', async (type) => {
    const before = Date.now();
    const change = type === 'EVENT_CHANGED' ? await createChange() : undefined;
    const input: EnqueueNotificationInput =
      type === 'EVENT_CHANGED'
        ? { type, reservationId, eventChangeId: change!.id }
        : { type, reservationId };
    const job = await enqueue(input);
    expect(job).toMatchObject({
      type,
      reservationId,
      eventChangeId: change?.id ?? null,
      recipientEmail: email,
      deduplicationKey: `${type}:${reservationId}${change ? `:${change.id}` : ''}`,
      status: 'PENDING',
      attemptCount: 0,
      retryCycleAttemptCount: 0,
      lastAttemptAt: null,
      claimToken: null,
      claimExpiresAt: null,
      providerMessageId: null,
      sentAt: null,
      lastError: null,
      skippedAt: null,
      skipReason: null,
      lastManualRetryById: null,
      lastManualRetryAt: null,
    });
    expect(job.nextAttemptAt!.getTime()).toBeGreaterThanOrEqual(before);
    expect(job.nextAttemptAt!.getTime()).toBeLessThanOrEqual(Date.now());
    expect(await prisma.emailJob.findUnique({ where: { id: job.id } })).toEqual(
      job,
    );
  });

  it('business_rollback_removes_pending_job', async () => {
    let rolledBackId: string | undefined;
    await expect(
      prisma.$transaction(async (tx) => {
        await tx.reservation.update({
          where: { id: reservationId },
          data: {
            status: 'CANCELLED',
            cancelledAt: new Date(),
            cancelledById: userId,
            cancellationSource: 'SELF_SERVICE',
          },
        });
        const reservation = await createReservation(tx);
        rolledBackId = reservation.id;
        await service.enqueue(tx, {
          type: 'BOOKING_CONFIRMED',
          reservationId: reservation.id,
        });
        throw new Error('Deliberate rollback');
      }),
    ).rejects.toThrow('Deliberate rollback');
    expect(rolledBackId).toBeDefined();
    expect(
      await prisma.reservation.findUnique({ where: { id: rolledBackId! } }),
    ).toBeNull();
    expect(
      await prisma.emailJob.count({ where: { reservationId: rolledBackId! } }),
    ).toBe(0);
    expect(
      (
        await prisma.reservation.findUniqueOrThrow({
          where: { id: reservationId },
        })
      ).status,
    ).toBe('CONFIRMED');
  });

  it('duplicate_action_does_not_duplicate_job', async () => {
    await prisma.$transaction(async (tx) => {
      const input = { type: 'BOOKING_CONFIRMED', reservationId } as const;
      const first = await service.enqueue(tx, input);
      expect(await service.enqueue(tx, input)).toEqual(first);
      expect(await tx.emailJob.count({ where: { reservationId } })).toBe(1);
    });
  });

  it('concurrent duplicate actions return the same job', async () => {
    const input = { type: 'BOOKING_CONFIRMED', reservationId } as const;
    const [first, second] = await Promise.all([enqueue(input), enqueue(input)]);
    expect(second).toEqual(first);
    expect(await prisma.emailJob.count({ where: { reservationId } })).toBe(1);
  });

  it('UUID letter casing does not change the logical notification identity', async () => {
    const change = await createChange();
    const first = await enqueue({
      type: 'EVENT_CHANGED',
      reservationId,
      eventChangeId: change.id,
    });
    expect(
      await enqueue({
        type: 'EVENT_CHANGED',
        reservationId: reservationId.toUpperCase(),
        eventChangeId: change.id.toUpperCase(),
      }),
    ).toEqual(first);
    expect(await prisma.emailJob.count({ where: { reservationId } })).toBe(1);
  });

  it('mismatched_event_change_is_rejected', async () => {
    const otherEvent = await createEvent();
    const change = await createChange(otherEvent.id);
    await expect(
      enqueue({
        type: 'EVENT_CHANGED',
        reservationId,
        eventChangeId: change.id,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(await prisma.emailJob.count({ where: { reservationId } })).toBe(0);
  });

  it('rejects a missing reservation', async () => {
    await expect(
      enqueue({ type: 'BOOKING_CONFIRMED', reservationId: randomUUID() }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects a missing event change', async () => {
    await expect(
      enqueue({
        type: 'EVENT_CHANGED',
        reservationId,
        eventChangeId: randomUUID(),
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(await prisma.emailJob.count({ where: { reservationId } })).toBe(0);
  });

  it.each([
    { type: 'EVENT_CHANGED' },
    { type: 'EVENT_CHANGED', eventChangeId: null },
    { type: 'BOOKING_CONFIRMED', eventChangeId: randomUUID() },
    { type: 'RESERVATION_CANCELLED', eventChangeId: randomUUID() },
    { type: 'EVENT_CANCELLED', eventChangeId: randomUUID() },
    { type: 'BOOKING_CONFIRMED', eventChangeId: null },
    { type: 'UNKNOWN' },
    { type: 'BOOKING_CONFIRMED', recipientEmail: 'injected@example.invalid' },
  ])('rejects invalid notification context: %j', async (fields) => {
    const input = {
      ...fields,
      reservationId,
    } as unknown as EnqueueNotificationInput;
    await expect(enqueue(input)).rejects.toBeInstanceOf(BadRequestException);
    expect(await prisma.emailJob.count({ where: { reservationId } })).toBe(0);
  });

  it('different changes produce distinct jobs', async () => {
    const firstChange = await createChange();
    const secondChange = await createChange(eventId, 2);
    const first = await enqueue({
      type: 'EVENT_CHANGED',
      reservationId,
      eventChangeId: firstChange.id,
    });
    const second = await enqueue({
      type: 'EVENT_CHANGED',
      reservationId,
      eventChangeId: secondChange.id,
    });
    expect(first.id).not.toBe(second.id);
    expect(await prisma.emailJob.count({ where: { reservationId } })).toBe(2);
  });

  it('a later reservation produces a distinct job', async () => {
    const first = await enqueue({ type: 'BOOKING_CONFIRMED', reservationId });
    await prisma.reservation.update({
      where: { id: reservationId },
      data: {
        status: 'CANCELLED',
        cancelledAt: new Date(),
        cancelledById: userId,
        cancellationSource: 'SELF_SERVICE',
      },
    });
    const next = await createReservation(prisma);
    const second = await enqueue({
      type: 'BOOKING_CONFIRMED',
      reservationId: next.id,
    });
    expect(first.id).not.toBe(second.id);
    expect(first.deduplicationKey).not.toBe(second.deduplicationKey);
  });

  it('re-enqueue preserves the captured recipient and delivery state', async () => {
    const input = { type: 'BOOKING_CONFIRMED', reservationId } as const;
    const job = await enqueue(input);
    const sent = await prisma.emailJob.update({
      where: { id: job.id },
      data: {
        status: 'SENT',
        nextAttemptAt: null,
        sentAt: new Date(),
        attemptCount: 2,
        retryCycleAttemptCount: 2,
        providerMessageId: 'test-message',
        lastAttemptAt: new Date(),
      },
    });
    await prisma.user.update({
      where: { id: userId },
      data: { email: `changed-${userId}@example.invalid` },
    });
    expect(await enqueue(input)).toEqual(sent);
  });
});
