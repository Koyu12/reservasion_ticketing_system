import { BadRequestException, Injectable, Inject, NotFoundException } from '@nestjs/common';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import type { Logger } from 'winston';
import { NotificationsValidation } from './notifications.validation.js';
import type { EnqueueNotificationInput } from './notifications.validation.js';
import type { EmailJob, Prisma } from '../generated/prisma/client.js';

@Injectable()
export class NotificationsService {
  constructor(@Inject(WINSTON_MODULE_PROVIDER) private readonly logger: Logger) {}
  async enqueue(tx: Prisma.TransactionClient, input: EnqueueNotificationInput): Promise<EmailJob> {
    const parsed = NotificationsValidation.ENQUEUE.safeParse(input);
    if (!parsed.success) throw new BadRequestException('Invalid notification context.');
    const { type, reservationId, eventChangeId } = parsed.data;
    const reservation = await tx.reservation.findUnique({
      where: { id: reservationId },
      select: { eventId: true, attendee: { select: { email: true } } },
    });
    if (!reservation) throw new NotFoundException('Reservation not found.');

    if (type === 'EVENT_CHANGED') {
      const change = await tx.eventChange.findUnique({ where: { id: eventChangeId }, select: { eventId: true } });
      if (!change) throw new NotFoundException('Event change not found.');
      if (change.eventId !== reservation.eventId)
        throw new BadRequestException('Event change does not belong to the reservation workshop.');
    }

    const deduplicationKey = `${type}:${reservationId}${type === 'EVENT_CHANGED' ? `:${eventChangeId}` : ''}`;
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
    const job = await tx.emailJob.findUniqueOrThrow({ where: { deduplicationKey } });
    this.logger.debug('Notification staged in caller transaction', { context: NotificationsService.name, jobId: job.id, type });
    return job;
  }
}
