import { APP_CONFIG } from '../common/config.js';
import type { AppConfig } from '../common/config.js';
import { Injectable, Inject } from '@nestjs/common';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import type { Logger } from 'winston';
import type { OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { EmailJob } from '../generated/prisma/client.js';
import { PrismaService } from '../common/prisma.service.js';
import { EmailService, EmailDeliveryError } from '../email/email.service.js';
import { EMAIL_DELIVERY_POLICY as policy } from '../email/delivery-policy.js';
import { notificationMessage, obsoleteReason } from './notification-message.js';

@Injectable()
export class NotificationSender implements OnApplicationBootstrap, OnModuleDestroy {
  private timer?: ReturnType<typeof setTimeout>;
  private active?: Promise<void>;
  private stopped = true;

  constructor(
    private readonly prisma: PrismaService,
    private readonly email: EmailService,
    @Inject(WINSTON_MODULE_PROVIDER) private readonly logger: Logger,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  onApplicationBootstrap() {
    if (process.env.EMAIL_WORKER_ENABLED !== 'true') return;
    this.stopped = false;
    this.poll();
  }

  private poll() {
    if (this.stopped) return;
    this.active = this.runOnce()
      .catch(() => {
        this.logger.error('Notification processing interrupted; persisted work will be recovered.', { context: NotificationSender.name });
      })
      .finally(() => {
        this.active = undefined;
        if (!this.stopped) {
          this.timer = setTimeout(() => this.poll(), policy.pollIntervalMs);
          this.timer.unref();
        }
      });
  }

  async onModuleDestroy() {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    await this.active;
  }

  async runOnce() {
    await this.recoverExpired();
    const claim = await this.claimNext();
    if (claim) await this.deliver(claim);
  }

  async recoverExpired() {
    const recovered = await this.prisma.$transaction(
      async (tx) => {
        const expired = await tx.$queryRaw<EmailJob[]>`
        SELECT * FROM "EmailJob"
        WHERE "status" = 'PROCESSING' AND "claimExpiresAt" <= clock_timestamp()
        FOR UPDATE SKIP LOCKED`;
        const recovered: { jobId: string; exhausted: boolean }[] = [];
        for (const job of expired) {
          const now = new Date();
          const exhausted = job.retryCycleAttemptCount >= policy.maxAttemptsPerCycle;
          const delay = policy.retryDelaysMs[job.retryCycleAttemptCount - 1] ?? 0;
          const due = job.lastAttemptAt ? job.lastAttemptAt.getTime() + delay : now.getTime();
          const result = await tx.emailJob.updateMany({
            where: { id: job.id, status: 'PROCESSING', claimToken: job.claimToken },
            data: {
              status: exhausted ? 'FAILED' : 'PENDING',
              claimToken: null,
              claimExpiresAt: null,
              nextAttemptAt: exhausted ? null : new Date(Math.max(now.getTime(), due)),
              lastError: 'Delivery claim expired; provider acceptance is unknown.',
            },
          });
          if (result.count) recovered.push({ jobId: job.id, exhausted });
        }
        return recovered;
      },
      { isolationLevel: 'ReadCommitted' },
    );
    for (const job of recovered)
      this.logger.warn('Expired notification claim recovered', {
        context: NotificationSender.name,
        jobId: job.jobId,
        status: job.exhausted ? 'FAILED' : 'PENDING',
      });
  }

  async claimNext(): Promise<EmailJob | null> {
    const claim = await this.prisma.$transaction(
      async (tx) => {
        const rows = await tx.$queryRaw<{ id: string }[]>`
        SELECT "id" FROM "EmailJob"
        WHERE "status" = 'PENDING' AND "nextAttemptAt" <= clock_timestamp()
        ORDER BY "nextAttemptAt", "id" LIMIT 1 FOR UPDATE SKIP LOCKED`;
        if (!rows.length) return null;
        return tx.emailJob.update({
          where: { id: rows[0].id },
          data: {
            status: 'PROCESSING',
            nextAttemptAt: null,
            claimToken: randomUUID(),
            claimExpiresAt: new Date(Date.now() + policy.claimTtlMs),
          },
        });
      },
      { isolationLevel: 'ReadCommitted' },
    );
    if (claim) this.logger.debug('Notification claimed', { context: NotificationSender.name, jobId: claim.id });
    return claim;
  }

  async deliver(claim: EmailJob) {
    const owned = { id: claim.id, status: 'PROCESSING' as const, claimToken: claim.claimToken };
    const job = await this.prisma.emailJob.findFirst({
      where: { ...owned, claimExpiresAt: { gt: new Date() } },
      include: { reservation: { include: { event: true } }, eventChange: true },
    });
    if (!job || !claim.claimToken || job.attemptCount !== claim.attemptCount) return;
    const skipReason = obsoleteReason(job);
    if (skipReason) {
      const result = await this.prisma.emailJob.updateMany({
        where: { ...owned, claimExpiresAt: { gt: new Date() } },
        data: { status: 'SKIPPED', skippedAt: new Date(), skipReason, claimToken: null, claimExpiresAt: null },
      });
      if (result.count)
        this.logger.info('Obsolete notification skipped', { context: NotificationSender.name, jobId: job.id, reason: skipReason });
      return;
    }
    let cycle = job.retryCycleAttemptCount;
    try {
      if (cycle >= policy.maxAttemptsPerCycle) throw new EmailDeliveryError('Delivery retry cycle is exhausted.', false);
      const message = notificationMessage(job, this.config.organizerContactEmail);
      const now = new Date();
      const attempt = await this.prisma.emailJob.updateMany({
        where: { ...owned, attemptCount: claim.attemptCount, claimExpiresAt: { gt: new Date(now.getTime() + policy.requestTimeoutMs) } },
        data: { attemptCount: { increment: 1 }, retryCycleAttemptCount: { increment: 1 }, lastAttemptAt: now },
      });
      if (!attempt.count) {
        await this.prisma.emailJob.updateMany({
          where: { ...owned, attemptCount: claim.attemptCount },
          data: { status: 'PENDING', nextAttemptAt: new Date(), claimToken: null, claimExpiresAt: null },
        });
        return;
      }
      cycle++;
      this.logger.debug('Sending notification', { context: NotificationSender.name, jobId: job.id });
      const result = await this.email.send(message);
      const saved = await this.prisma.emailJob.updateMany({
        where: { ...owned, claimExpiresAt: { gt: new Date() } },
        data: { status: 'SENT', providerMessageId: result.id, sentAt: new Date(), claimToken: null, claimExpiresAt: null },
      });
      if (saved.count) this.logger.info('Notification accepted by email provider', { context: NotificationSender.name, jobId: job.id });
    } catch (error) {
      const known = error instanceof EmailDeliveryError;
      const retry = known && error.retryable && cycle < policy.maxAttemptsPerCycle;
      const delay = Math.max(policy.retryDelaysMs[cycle - 1] ?? 0, known ? error.retryAfterMs : 0);
      const saved = await this.prisma.emailJob.updateMany({
        where: { ...owned, claimExpiresAt: { gt: new Date() } },
        data: {
          status: retry ? 'PENDING' : 'FAILED',
          nextAttemptAt: retry ? new Date(Date.now() + delay) : null,
          lastError: known ? error.message : 'Notification delivery failed unexpectedly.',
          claimToken: null,
          claimExpiresAt: null,
        },
      });
      if (saved.count)
        this.logger.warn(retry ? 'Notification retry scheduled' : 'Notification delivery failed', {
          context: NotificationSender.name,
          jobId: job.id,
          status: retry ? 'PENDING' : 'FAILED',
        });
    }
  }
}
