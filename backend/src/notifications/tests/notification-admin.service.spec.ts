import { BadRequestException, ConflictException } from '@nestjs/common';
import { jest } from '@jest/globals';
import type { Logger } from 'winston';
import { NotificationAdminService } from '../notification-admin.service.js';
import { ValidationService } from '../../common/validation.service.js';
import type { PrismaService } from '../../common/prisma.service.js';

const id = 'abcdefab-1234-4123-8123-abcdefabcdef';
describe('Notification admin request boundary', () => {
  const findUnique = jest.fn<(...args: unknown[]) => Promise<unknown>>();
  const findMany = jest.fn<(...args: unknown[]) => Promise<unknown>>();
  const updateMany = jest.fn<(...args: unknown[]) => Promise<{ count: number }>>();
  const logger = { debug: jest.fn(), info: jest.fn() };
  const service = new NotificationAdminService(
    { emailJob: { findUnique, findMany, updateMany } } as unknown as PrismaService,
    new ValidationService(),
    logger as unknown as Logger,
  );
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('rejects invalid UUID, query and missing or nonempty body before database access', async () => {
    await expect(service.retry('bad', 'admin', {})).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.retry(id, 'admin', undefined as never)).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.retry(id, 'admin', { status: 'PENDING' } as never)).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.listFailed({ userId: 'spoofed' } as never)).rejects.toBeInstanceOf(BadRequestException);
    expect(findUnique).not.toHaveBeenCalled();
    expect(findMany).not.toHaveBeenCalled();
  });

  it('normalizes ID and logs scheduling only after the failed-job transition', async () => {
    findUnique.mockResolvedValueOnce({ id });
    let finish!: (value: { count: number }) => void;
    updateMany.mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    const result = service.retry(id.toUpperCase(), 'admin', {});
    await Promise.resolve();
    expect(logger.info).not.toHaveBeenCalled();
    finish({ count: 1 });
    await expect(result).resolves.toEqual({ job: { id, status: 'PENDING' } });
    expect((updateMany.mock.calls[0][0] as { where: unknown }).where).toEqual({ id, status: 'FAILED' });
    expect(logger.info).toHaveBeenCalledTimes(1);
  });

  it('does not log scheduling after a competing retry wins', async () => {
    findUnique.mockResolvedValueOnce({ id });
    updateMany.mockResolvedValueOnce({ count: 0 });
    await expect(service.retry(id, 'admin', {})).rejects.toBeInstanceOf(ConflictException);
    expect(logger.info).not.toHaveBeenCalled();
  });

  it('maps only public admin metadata and excludes private claims', async () => {
    findMany.mockResolvedValueOnce([
      {
        id,
        recipientEmail: 'private@example.com',
        claimToken: 'private-claim',
        reservation: { bookingReference: 'private-reference', event: { id, title: 'Workshop', internal: 'hidden' } },
        lastManualRetryBy: { name: 'Admin', secret: 'hidden' },
      },
    ]);
    const result = await service.listFailed({});
    expect(result.jobs[0]).not.toHaveProperty('claimToken');
    expect(result.jobs[0].reservation.event).toEqual({ id, title: 'Workshop' });
    expect(result.jobs[0].lastManualRetryBy).toEqual({ name: 'Admin' });
    expect(JSON.stringify(logger.debug.mock.calls)).not.toContain('private');
  });
});
