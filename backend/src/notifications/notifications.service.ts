import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { z } from 'zod';
import type { EmailJob, Prisma } from '../generated/prisma/client.js';

const enqueueNotificationSchema = z.discriminatedUnion('type', [
  z.strictObject({
    type: z.literal('EVENT_CHANGED'),
    reservationId: z.uuid().toLowerCase(),
    eventChangeId: z.uuid().toLowerCase(),
  }),
  z.strictObject({
    type: z.enum([
      'BOOKING_CONFIRMED',
      'RESERVATION_CANCELLED',
      'EVENT_CANCELLED',
    ]),
    reservationId: z.uuid().toLowerCase(),
    eventChangeId: z.never().optional(),
  }),
]);

export type EnqueueNotificationInput = z.infer<
  typeof enqueueNotificationSchema
>;

@Injectable()
export class NotificationsService {
  async enqueue(
    tx: Prisma.TransactionClient,
    input: EnqueueNotificationInput,
  ): Promise<EmailJob> {
    const parsed = enqueueNotificationSchema.safeParse(input);
    if (!parsed.success)
      throw new BadRequestException('Invalid notification context.');
    const { type, reservationId, eventChangeId } = parsed.data;
    const reservation = await tx.reservation.findUnique({
      where: { id: reservationId },
      select: { eventId: true, attendee: { select: { email: true } } },
    });
    if (!reservation) throw new NotFoundException('Reservation not found.');

    if (type === 'EVENT_CHANGED') {
      const change = await tx.eventChange.findUnique({
        where: { id: eventChangeId },
        select: { eventId: true },
      });
      if (!change) throw new NotFoundException('Event change not found.');
      if (change.eventId !== reservation.eventId)
        throw new BadRequestException(
          'Event change does not belong to the reservation workshop.',
        );
    }

    const deduplicationKey = `${type}:${reservationId}${
      type === 'EVENT_CHANGED' ? `:${eventChangeId}` : ''
    }`;
    await tx.emailJob.createMany({
      data: {
        type,
        reservationId,
        eventChangeId,
        recipientEmail: reservation.attendee.email,
        deduplicationKey,
        status: 'PENDING',
        nextAttemptAt: new Date(),
      },
      skipDuplicates: true,
    });
    return tx.emailJob.findUniqueOrThrow({ where: { deduplicationKey } });
  }
}
