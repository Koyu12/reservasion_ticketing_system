import { Injectable, Logger } from '@nestjs/common';
import type { OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { EmailJob } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { EmailService, EmailDeliveryError } from '../email/email.service.js';
import { EMAIL_DELIVERY_POLICY as policy } from '../email/delivery-policy.js';
import { notificationMessage, obsoleteReason } from './notification-message.js';

@Injectable()
export class NotificationSender
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger = new Logger(NotificationSender.name);
  private timer?: ReturnType<typeof setTimeout>;
  private active?: Promise<void>;
  private stopped = true;

  constructor(
    private readonly prisma: PrismaService,
    private readonly email: EmailService,
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
        this.logger.error(
          'Notification processing interrupted; persisted work will be recovered.',
        );
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
    await this.prisma.$transaction(
      async (tx) => {
        const expired = await tx.$queryRaw<EmailJob[]>`
        SELECT * FROM "EmailJob"
        WHERE "status" = 'PROCESSING' AND "claimExpiresAt" <= clock_timestamp()
        FOR UPDATE SKIP LOCKED`;
        for (const job of expired) {
          const now = new Date();
          const exhausted =
            job.retryCycleAttemptCount >= policy.maxAttemptsPerCycle;
          const delay =
            policy.retryDelaysMs[job.retryCycleAttemptCount - 1] ?? 0;
          const due = job.lastAttemptAt
            ? job.lastAttemptAt.getTime() + delay
            : now.getTime();
          await tx.emailJob.updateMany({
            where: {
              id: job.id,
              status: 'PROCESSING',
              claimToken: job.claimToken,
            },
            data: {
              status: exhausted ? 'FAILED' : 'PENDING',
              claimToken: null,
              claimExpiresAt: null,
              nextAttemptAt: exhausted
                ? null
                : new Date(Math.max(now.getTime(), due)),
              lastError:
                'Delivery claim expired; provider acceptance is unknown.',
            },
          });
        }
      },
      { isolationLevel: 'ReadCommitted' },
    );
  }

  async claimNext(): Promise<EmailJob | null> {
    return this.prisma.$transaction(
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
  }

  async deliver(claim: EmailJob) {
    const owned = {
      id: claim.id,
      status: 'PROCESSING' as const,
      claimToken: claim.claimToken,
    };
    const job = await this.prisma.emailJob.findFirst({
      where: { ...owned, claimExpiresAt: { gt: new Date() } },
      include: { reservation: { include: { event: true } }, eventChange: true },
    });
    if (!job || !claim.claimToken || job.attemptCount !== claim.attemptCount)
      return;
    const skipReason = obsoleteReason(job);
    if (skipReason) {
      await this.prisma.emailJob.updateMany({
        where: { ...owned, claimExpiresAt: { gt: new Date() } },
        data: {
          status: 'SKIPPED',
          skippedAt: new Date(),
          skipReason,
          claimToken: null,
          claimExpiresAt: null,
        },
      });
      return;
    }
    let cycle = job.retryCycleAttemptCount;
    try {
      if (cycle >= policy.maxAttemptsPerCycle)
        throw new EmailDeliveryError(
          'Delivery retry cycle is exhausted.',
          false,
        );
      const message = notificationMessage(job);
      const now = new Date();
      const attempt = await this.prisma.emailJob.updateMany({
        where: {
          ...owned,
          attemptCount: claim.attemptCount,
          claimExpiresAt: {
            gt: new Date(now.getTime() + policy.requestTimeoutMs),
          },
        },
        data: {
          attemptCount: { increment: 1 },
          retryCycleAttemptCount: { increment: 1 },
          lastAttemptAt: now,
        },
      });
      if (!attempt.count) {
        await this.prisma.emailJob.updateMany({
          where: { ...owned, attemptCount: claim.attemptCount },
          data: {
            status: 'PENDING',
            nextAttemptAt: new Date(),
            claimToken: null,
            claimExpiresAt: null,
          },
        });
        return;
      }
      cycle++;
      const result = await this.email.send(message);
      await this.prisma.emailJob.updateMany({
        where: { ...owned, claimExpiresAt: { gt: new Date() } },
        data: {
          status: 'SENT',
          providerMessageId: result.id,
          sentAt: new Date(),
          claimToken: null,
          claimExpiresAt: null,
        },
      });
    } catch (error) {
      const known = error instanceof EmailDeliveryError;
      const retry =
        known && error.retryable && cycle < policy.maxAttemptsPerCycle;
      const delay = Math.max(
        policy.retryDelaysMs[cycle - 1] ?? 0,
        known ? error.retryAfterMs : 0,
      );
      await this.prisma.emailJob.updateMany({
        where: { ...owned, claimExpiresAt: { gt: new Date() } },
        data: {
          status: retry ? 'PENDING' : 'FAILED',
          nextAttemptAt: retry ? new Date(Date.now() + delay) : null,
          lastError: known
            ? error.message
            : 'Notification delivery failed unexpectedly.',
          claimToken: null,
          claimExpiresAt: null,
        },
      });
    }
  }
}
