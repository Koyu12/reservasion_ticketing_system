import { jest } from '@jest/globals';
import type { Logger } from 'winston';
import type { EmailJob } from '../../generated/prisma/client.js';
import type { PrismaService } from '../../common/prisma.service.js';
import type { EmailService } from '../../email/email.service.js';
import { NotificationSender } from '../notification-sender.service.js';

const claim = { id: 'job-id', claimToken: 'private-claim', attemptCount: 0 } as EmailJob;
describe('Notification sender ownership-aware logging', () => {
  it.each([0, 1])('logs a skipped notification only for an owned update (count=%s)', async (count) => {
    const findFirst = jest
      .fn<() => Promise<unknown>>()
      .mockResolvedValue({
        ...claim,
        type: 'BOOKING_CONFIRMED',
        recipientEmail: 'private@example.com',
        reservation: { status: 'CANCELLED', event: { status: 'PUBLISHED' } },
      });
    const updateMany = jest.fn<() => Promise<{ count: number }>>().mockResolvedValue({ count });
    const send = jest.fn();
    const logger = { info: jest.fn(), debug: jest.fn(), warn: jest.fn() };
    const sender = new NotificationSender(
      { emailJob: { findFirst, updateMany } } as unknown as PrismaService,
      { send } as unknown as EmailService,
      logger as unknown as Logger,
      { organizerContactEmail: 'organizer@example.invalid' },
    );
    await sender.deliver(claim);
    expect(send).not.toHaveBeenCalled();
    expect(logger.info).toHaveBeenCalledTimes(count);
    expect(JSON.stringify(logger.info.mock.calls)).not.toContain('private');
  });

  it('does not log recovery success if its transaction rolls back', async () => {
    const transaction = jest.fn<() => Promise<unknown>>().mockRejectedValue(new Error('private database error'));
    const logger = { warn: jest.fn() };
    const sender = new NotificationSender(
      { $transaction: transaction } as unknown as PrismaService,
      {} as EmailService,
      logger as unknown as Logger,
      { organizerContactEmail: 'organizer@example.invalid' },
    );
    await expect(sender.recoverExpired()).rejects.toThrow('private database error');
    expect(logger.warn).not.toHaveBeenCalled();
  });
});
