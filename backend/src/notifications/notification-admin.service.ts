import { ConflictException, Injectable, Inject, NotFoundException } from '@nestjs/common';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import type { Logger } from 'winston';
import { ValidationService } from '../common/validation.service.js';
import { NotificationsValidation } from './notifications.validation.js';
import type { FailedNotificationsResponse, RetryNotificationResponse } from './notifications.validation.js';
import { PrismaService } from '../common/prisma.service.js';

@Injectable()
export class NotificationAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly validationService: ValidationService,
    @Inject(WINSTON_MODULE_PROVIDER) private readonly logger: Logger,
  ) {}

  async listFailed(query: Record<string, never>): Promise<FailedNotificationsResponse> {
    this.validationService.validate(NotificationsValidation.EMPTY, query);
    this.logger.debug('Fetching failed notifications', { context: NotificationAdminService.name });
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
        reservation: { select: { bookingReference: true, event: { select: { id: true, title: true } } } },
      },
    });
    return {
      jobs: jobs.map((job) => ({
        id: job.id,
        type: job.type,
        recipientEmail: job.recipientEmail,
        status: job.status,
        attemptCount: job.attemptCount,
        retryCycleAttemptCount: job.retryCycleAttemptCount,
        lastAttemptAt: job.lastAttemptAt,
        lastError: job.lastError,
        createdAt: job.createdAt,
        updatedAt: job.updatedAt,
        lastManualRetryAt: job.lastManualRetryAt,
        lastManualRetryBy: job.lastManualRetryBy ? { name: job.lastManualRetryBy.name } : null,
        reservation: {
          bookingReference: job.reservation.bookingReference,
          event: { id: job.reservation.event.id, title: job.reservation.event.title },
        },
      })),
    };
  }

  async retry(id: string, actorId: string, body: Record<string, never>): Promise<RetryNotificationResponse> {
    id = this.validationService.validate(NotificationsValidation.ID, id);
    this.validationService.validate(NotificationsValidation.EMPTY, body);
    this.logger.debug('Requesting notification retry', { context: NotificationAdminService.name, jobId: id });
    const existing = await this.prisma.emailJob.findUnique({ where: { id }, select: { id: true } });
    if (!existing) throw new NotFoundException('Notification not found.');
    const now = new Date();
    const result = await this.prisma.emailJob.updateMany({
      where: { id, status: 'FAILED' },
      data: { status: 'PENDING', retryCycleAttemptCount: 0, nextAttemptAt: now, lastManualRetryAt: now, lastManualRetryById: actorId },
    });
    if (!result.count) throw new ConflictException('Only failed emails can be retried. Refresh the list.');
    this.logger.info('Notification retry scheduled', { context: NotificationAdminService.name, jobId: id });
    return { job: { id, status: 'PENDING' as const } };
  }
}
