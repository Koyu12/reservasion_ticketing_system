import 'dotenv/config';
import { jest } from '@jest/globals';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { NotificationsService } from '../src/notifications/notifications.service.js';
import { NotificationSender } from '../src/notifications/notification-sender.service.js';
import {
  EmailService,
  EmailDeliveryError,
} from '../src/email/email.service.js';
import { EMAIL_DELIVERY_POLICY as policy } from '../src/email/delivery-policy.js';
import type { EmailJob, Prisma } from '../src/generated/prisma/client.js';
import { requireTestDatabaseUrl } from './test-database.js';

describe('Business notification sender (PostgreSQL)', () => {
  let prisma: PrismaService;
  let sender: NotificationSender;
  let email: EmailService;
  let send: jest.SpiedFunction<EmailService['send']>;
  const notifications = new NotificationsService();
  const userId = randomUUID();
  const previousContact = process.env.ORGANIZER_CONTACT_EMAIL;
  let eventId: string;
  let reservationId: string;
  let job: EmailJob;

  beforeAll(async () => {
    const url = requireTestDatabaseUrl(
      process.env.TEST_DATABASE_URL,
      process.env.DATABASE_URL,
    );
    const previous = process.env.DATABASE_URL;
    process.env.DATABASE_URL = url;
    try {
      prisma = new PrismaService();
    } finally {
      if (previous === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = previous;
    }
    process.env.ORGANIZER_CONTACT_EMAIL = 'organizer@example.invalid';
    await prisma.user.create({
      data: {
        id: userId,
        name: 'Sender test',
        email: `sender-${userId}@example.invalid`,
        role: 'ADMIN',
      },
    });
  });

  beforeEach(async () => {
    email = new EmailService();
    send = jest
      .spyOn(email, 'send')
      .mockResolvedValue({ id: 'provider-accepted' });
    sender = new NotificationSender(prisma, email);
    const event = await prisma.event.create({
      data: {
        createdById: userId,
        title: 'Sender workshop',
        description: 'Sample',
        venueName: 'Original hall',
        venueAddress: 'Sample address',
        startsAt: new Date('2035-01-10T02:00:00Z'),
        endsAt: new Date('2035-01-10T05:00:00Z'),
        registrationClosesAt: new Date('2035-01-09T02:00:00Z'),
        capacity: 10,
        status: 'PUBLISHED',
      },
    });
    eventId = event.id;
    const reservation = await prisma.reservation.create({
      data: {
        eventId,
        userId,
        bookingReference: randomUUID(),
        bookedRevision: 0,
      },
    });
    reservationId = reservation.id;
    job = await enqueue('BOOKING_CONFIRMED');
  });

  afterEach(async () => {
    await sender?.onModuleDestroy();
    jest.restoreAllMocks();
    const event = { createdById: userId };
    await prisma.emailJob.deleteMany({ where: { reservation: { event } } });
    await prisma.reservation.deleteMany({ where: { event } });
    await prisma.eventChange.deleteMany({ where: { event } });
    await prisma.event.deleteMany({ where: event });
    process.env.ORGANIZER_CONTACT_EMAIL = 'organizer@example.invalid';
  });

  afterAll(async () => {
    try {
      await prisma?.user.deleteMany({ where: { id: userId } });
    } finally {
      await prisma?.$disconnect();
      if (previousContact === undefined)
        delete process.env.ORGANIZER_CONTACT_EMAIL;
      else process.env.ORGANIZER_CONTACT_EMAIL = previousContact;
    }
  });

  const read = () =>
    prisma.emailJob.findUniqueOrThrow({ where: { id: job.id } });
  function enqueue(
    type: 'BOOKING_CONFIRMED' | 'RESERVATION_CANCELLED' | 'EVENT_CANCELLED',
  ) {
    return prisma.$transaction((tx) =>
      notifications.enqueue(tx, { type, reservationId }),
    );
  }
  async function cancelBooking(
    source: 'SELF_SERVICE' | 'EVENT_CANCELLED' = 'SELF_SERVICE',
  ) {
    await prisma.reservation.update({
      where: { id: reservationId },
      data: {
        status: 'CANCELLED',
        cancelledAt: new Date(),
        cancelledById: userId,
        cancellationSource: source,
        cancellationReason:
          source === 'EVENT_CANCELLED' ? 'Workshop unavailable' : null,
      },
    });
  }
  async function changeEvent(revision = 1) {
    const event = await prisma.event.findUniqueOrThrow({
      where: { id: eventId },
    });
    const change = await prisma.eventChange.create({
      data: {
        eventId,
        revision,
        changedById: userId,
        reason: 'Venue unavailable',
        oldStartsAt: event.startsAt,
        oldEndsAt: event.endsAt,
        newStartsAt: event.startsAt,
        newEndsAt: event.endsAt,
        oldVenueName: event.venueName,
        oldVenueAddress: event.venueAddress,
        newVenueName: 'New hall',
        newVenueAddress: 'New address',
      },
    });
    await prisma.event.update({
      where: { id: eventId },
      data: {
        scheduleRevision: revision,
        venueName: change.newVenueName,
        venueAddress: change.newVenueAddress,
      },
    });
    return prisma.$transaction((tx) =>
      notifications.enqueue(tx, {
        type: 'EVENT_CHANGED',
        reservationId,
        eventChangeId: change.id,
      }),
    );
  }
  async function expire(data: Prisma.EmailJobUpdateInput = {}) {
    await prisma.emailJob.update({
      where: { id: job.id },
      data: {
        status: 'PROCESSING',
        nextAttemptAt: null,
        claimToken: randomUUID(),
        claimExpiresAt: new Date(Date.now() - 1000),
        ...data,
      },
    });
  }

  it('records provider acceptance, current details, stable identity, and one attempt', async () => {
    await prisma.event.update({
      where: { id: eventId },
      data: { title: 'Current workshop title' },
    });
    await sender.runOnce();
    expect(await read()).toMatchObject({
      status: 'SENT',
      providerMessageId: 'provider-accepted',
      attemptCount: 1,
      retryCycleAttemptCount: 1,
      claimToken: null,
      nextAttemptAt: null,
    });
    expect(send.mock.calls[0][0].idempotencyKey).toBe(`email-job/${job.id}`);
    expect(send.mock.calls[0][0].text).toContain('Current workshop title');
    expect(send.mock.calls[0][0].text).toContain('09:00 WIB');
    expect(send.mock.calls[0][0].text).toContain('organizer@example.invalid');
  });

  it('releases the claim transaction before the provider call', async () => {
    send.mockImplementation(async () => {
      await prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SET LOCAL lock_timeout = '500ms'`;
        await tx.$queryRaw`SELECT "id" FROM "EmailJob" WHERE "id" = ${job.id}::uuid FOR UPDATE`;
      });
      return { id: 'accepted-without-lock' };
    });
    await sender.runOnce();
    expect((await read()).status).toBe('SENT');
  });

  it('competing workers cannot claim the same job', async () => {
    const claims = await Promise.all([
      sender.claimNext(),
      new NotificationSender(prisma, email).claimNext(),
    ]);
    expect(claims.filter(Boolean)).toHaveLength(1);
    await Promise.all(
      claims
        .filter((claim): claim is EmailJob => Boolean(claim))
        .map((claim) => sender.deliver(claim)),
    );
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('SKIP LOCKED permits another eligible job to progress', async () => {
    const second = await enqueue('RESERVATION_CANCELLED');
    await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "EmailJob" WHERE "id" = ${job.id}::uuid FOR UPDATE`;
      expect((await sender.claimNext())?.id).toBe(second.id);
    });
  });

  it('one claim permits one provider invocation even with competing delivery calls', async () => {
    const claim = (await sender.claimNext())!;
    await Promise.all([sender.deliver(claim), sender.deliver(claim)]);
    expect(send).toHaveBeenCalledTimes(1);
    expect((await read()).attemptCount).toBe(1);
  });

  it.each(policy.retryDelaysMs.map((delay, index) => [index, delay]))(
    'schedules the exact delay after attempt %s',
    async (previous, delay) => {
      await prisma.emailJob.update({
        where: { id: job.id },
        data: { attemptCount: previous, retryCycleAttemptCount: previous },
      });
      send.mockRejectedValue(
        new EmailDeliveryError('Email delivery request failed', true),
      );
      const before = Date.now();
      await sender.runOnce();
      const result = await read();
      expect(result.status).toBe('PENDING');
      expect(result.nextAttemptAt!.getTime()).toBeGreaterThanOrEqual(
        before + delay,
      );
      expect(result.nextAttemptAt!.getTime()).toBeLessThanOrEqual(
        Date.now() + delay,
      );
      expect(result.attemptCount).toBe(previous + 1);
      const eligibility = await prisma.$queryRaw<
        { eligible: boolean; due: Date; clock: Date }[]
      >`
      SELECT "nextAttemptAt" <= clock_timestamp() AS eligible, "nextAttemptAt" AS due, clock_timestamp() AS clock
      FROM "EmailJob" WHERE "id" = ${job.id}::uuid`;
      expect(eligibility[0]).toMatchObject({ eligible: false });
      await sender.runOnce();
      expect(send).toHaveBeenCalledTimes(1);
    },
  );

  it('honors a longer retry-after after an ambiguous failure', async () => {
    send.mockRejectedValue(
      new EmailDeliveryError('Email delivery request failed', true, 90_000),
    );
    const before = Date.now();
    await sender.runOnce();
    expect((await read()).nextAttemptAt!.getTime()).toBeGreaterThanOrEqual(
      before + 90_000,
    );
  });

  it.each([false, true])(
    'ends a fifth failed attempt (retryable=%s)',
    async (retryable) => {
      await prisma.emailJob.update({
        where: { id: job.id },
        data: { attemptCount: 4, retryCycleAttemptCount: 4 },
      });
      send.mockRejectedValue(
        new EmailDeliveryError('Sanitized failure', retryable),
      );
      await sender.runOnce();
      expect(await read()).toMatchObject({
        status: 'FAILED',
        attemptCount: 5,
        retryCycleAttemptCount: 5,
        nextAttemptAt: null,
        claimToken: null,
      });
    },
  );

  it('permanent failures end the cycle immediately; unknown errors are redacted', async () => {
    send.mockRejectedValue(
      new Error('secret key, email content, raw response'),
    );
    await sender.runOnce();
    expect(await read()).toMatchObject({
      status: 'FAILED',
      attemptCount: 1,
      lastError: 'Notification delivery failed unexpectedly.',
    });
  });

  it('missing organizer configuration fails without a provider attempt', async () => {
    delete process.env.ORGANIZER_CONTACT_EMAIL;
    await sender.runOnce();
    expect(send).not.toHaveBeenCalled();
    expect(await read()).toMatchObject({ status: 'FAILED', attemptCount: 0 });
  });

  it('releases a claim with insufficient time without consuming an attempt', async () => {
    const claim = (await sender.claimNext())!;
    await prisma.emailJob.update({
      where: { id: job.id },
      data: { claimExpiresAt: new Date(Date.now() + 5000) },
    });
    await sender.deliver(claim);
    expect(send).not.toHaveBeenCalled();
    expect(await read()).toMatchObject({
      status: 'PENDING',
      attemptCount: 0,
      claimToken: null,
    });
  });

  it('restart recovery returns an unused claim immediately to pending', async () => {
    await expire();
    await new NotificationSender(prisma, email).recoverExpired();
    expect(await read()).toMatchObject({
      status: 'PENDING',
      attemptCount: 0,
      retryCycleAttemptCount: 0,
      claimToken: null,
    });
    await sender.runOnce();
    expect((await read()).status).toBe('SENT');
  });

  it.each([false, true])(
    'recovers interrupted attempts using lastAttemptAt (elapsed=%s)',
    async (elapsed) => {
      const lastAttemptAt = new Date(Date.now() - (elapsed ? 120_000 : 0));
      await expire({
        attemptCount: 2,
        retryCycleAttemptCount: 2,
        lastAttemptAt,
      });
      const before = Date.now();
      await sender.recoverExpired();
      const result = await read();
      expect(result).toMatchObject({
        status: 'PENDING',
        attemptCount: 2,
        retryCycleAttemptCount: 2,
      });
      expect(result.nextAttemptAt!.getTime()).toBeGreaterThanOrEqual(
        elapsed ? before : lastAttemptAt.getTime() + 120_000,
      );
    },
  );

  it('recovers an interrupted final attempt as failed', async () => {
    await expire({
      attemptCount: 5,
      retryCycleAttemptCount: 5,
      lastAttemptAt: new Date(),
    });
    await sender.runOnce();
    expect(await read()).toMatchObject({
      status: 'FAILED',
      attemptCount: 5,
      nextAttemptAt: null,
    });
    expect(send).not.toHaveBeenCalled();
  });

  it('stale owners cannot send or overwrite a newer claim', async () => {
    const old = (await sender.claimNext())!;
    await expire();
    await sender.recoverExpired();
    const current = (await sender.claimNext())!;
    await sender.deliver(old);
    expect(send).not.toHaveBeenCalled();
    expect((await read()).claimToken).toBe(current.claimToken);
    await sender.deliver(current);
    expect((await read()).status).toBe('SENT');
  });

  it.each([false, true])(
    'late provider results cannot overwrite recovery (failure=%s)',
    async (failure) => {
      send.mockImplementation(async () => {
        await expire({
          attemptCount: 1,
          retryCycleAttemptCount: 1,
          lastAttemptAt: new Date(Date.now() - 60_000),
        });
        await sender.recoverExpired();
        await sender.claimNext();
        if (failure)
          throw new EmailDeliveryError('Email delivery request failed', true);
        return { id: 'stale-provider-result' };
      });
      await sender.runOnce();
      const result = await read();
      expect(result.status).toBe('PROCESSING');
      expect(result.providerMessageId).toBeNull();
      expect(result.attemptCount).toBe(1);
    },
  );

  it.each(['reservation', 'event'])(
    'skips a confirmation after %s cancellation',
    async (what) => {
      await cancelBooking();
      if (what === 'event')
        await prisma.event.update({
          where: { id: eventId },
          data: {
            status: 'CANCELLED',
            cancelledAt: new Date(),
            cancelledById: userId,
            cancellationReason: 'Cancelled',
          },
        });
      await sender.runOnce();
      expect(await read()).toMatchObject({
        status: 'SKIPPED',
        attemptCount: 0,
        claimToken: null,
      });
      expect(send).not.toHaveBeenCalled();
    },
  );

  it.each(['superseded', 'reservation', 'event'])(
    'skips an obsolete change: %s',
    async (what) => {
      await prisma.emailJob.delete({ where: { id: job.id } });
      job = await changeEvent();
      if (what === 'superseded')
        await prisma.event.update({
          where: { id: eventId },
          data: { scheduleRevision: 2 },
        });
      else await cancelBooking();
      if (what === 'event')
        await prisma.event.update({
          where: { id: eventId },
          data: {
            status: 'CANCELLED',
            cancelledAt: new Date(),
            cancelledById: userId,
            cancellationReason: 'Cancelled',
          },
        });
      await sender.runOnce();
      expect(await read()).toMatchObject({
        status: 'SKIPPED',
        attemptCount: 0,
      });
      expect(send).not.toHaveBeenCalled();
    },
  );

  it('renders valid change notices and current confirmations', async () => {
    await changeEvent();
    await sender.runOnce();
    await sender.runOnce();
    expect(send).toHaveBeenCalledTimes(2);
    const messages = send.mock.calls.map(([message]) => message);
    expect(messages.every((message) => message.text.includes('New hall'))).toBe(
      true,
    );
    expect(
      messages.find((message) => message.subject.startsWith('Workshop updated'))
        ?.text,
    ).toContain('Previous venue: Original hall');
    expect(
      messages.find((message) =>
        message.subject.startsWith('Booking confirmed'),
      )?.text,
    ).toContain('before its revised start');
  });

  it.each(['RESERVATION_CANCELLED', 'EVENT_CANCELLED'] as const)(
    'preserves the original reference for %s after rebooking',
    async (type) => {
      await prisma.emailJob.delete({ where: { id: job.id } });
      await cancelBooking(
        type === 'EVENT_CANCELLED' ? 'EVENT_CANCELLED' : 'SELF_SERVICE',
      );
      job = await enqueue(type);
      const original = await prisma.reservation.findUniqueOrThrow({
        where: { id: reservationId },
      });
      const newer = await prisma.reservation.create({
        data: {
          eventId,
          userId,
          bookingReference: randomUUID(),
          bookedRevision: 0,
        },
      });
      await sender.runOnce();
      expect((await read()).status).toBe('SENT');
      expect(send.mock.calls[0][0].text).toContain(original.bookingReference);
      expect(send.mock.calls[0][0].text).not.toContain(newer.bookingReference);
    },
  );
});
