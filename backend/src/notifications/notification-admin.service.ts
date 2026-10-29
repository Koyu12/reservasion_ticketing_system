import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class NotificationAdminService {
  constructor(private readonly prisma: PrismaService) {}

  async listFailed() {
    const jobs = await this.prisma.emailJob.findMany({
      where: { status: 'FAILED' },
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      select: {
        id: true,
        type: true,
        recipientEmail: true,
        status: true,
        attemptCount: true,
        retryCycleAttemptCount: true,
        lastAttemptAt: true,
        lastError: true,
        createdAt: true,
        updatedAt: true,
        lastManualRetryAt: true,
        lastManualRetryBy: { select: { name: true } },
        reservation: {
          select: {
            bookingReference: true,
            event: { select: { id: true, title: true } },
          },
        },
      },
    });
    return { jobs };
  }

  async retry(id: string, actorId: string) {
    const existing = await this.prisma.emailJob.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!existing) throw new NotFoundException('Notification not found.');
    const now = new Date();
    const result = await this.prisma.emailJob.updateMany({
      where: { id, status: 'FAILED' },
      data: {
        status: 'PENDING',
        retryCycleAttemptCount: 0,
        nextAttemptAt: now,
        lastManualRetryAt: now,
        lastManualRetryById: actorId,
      },
    });
    if (!result.count)
      throw new ConflictException(
        'Only failed emails can be retried. Refresh the list.',
      );
    return { job: { id, status: 'PENDING' as const } };
  }
}
