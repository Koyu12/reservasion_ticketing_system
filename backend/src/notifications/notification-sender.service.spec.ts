import { jest } from '@jest/globals';
import { NotificationSender } from './notification-sender.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { EmailService } from '../email/email.service.js';

describe('Notification sender lifecycle', () => {
  const previous = process.env.EMAIL_WORKER_ENABLED;
  let sender: NotificationSender;
  beforeEach(() => {
    jest.useFakeTimers();
    sender = new NotificationSender({} as PrismaService, {} as EmailService);
  });
  afterEach(async () => {
    await sender.onModuleDestroy();
    jest.useRealTimers();
    jest.restoreAllMocks();
    if (previous === undefined) delete process.env.EMAIL_WORKER_ENABLED;
    else process.env.EMAIL_WORKER_ENABLED = previous;
  });
  it.each([undefined, 'false', 'TRUE'])(
    'does not process work when enable=%s',
    (value) => {
      if (value === undefined) delete process.env.EMAIL_WORKER_ENABLED;
      else process.env.EMAIL_WORKER_ENABLED = value;
      const run = jest.spyOn(sender, 'runOnce').mockResolvedValue();
      sender.onApplicationBootstrap();
      expect(run).not.toHaveBeenCalled();
    },
  );
  it('does not overlap cycles and waits for active work before shutdown', async () => {
    process.env.EMAIL_WORKER_ENABLED = 'true';
    let finish!: () => void;
    const run = jest.spyOn(sender, 'runOnce').mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    sender.onApplicationBootstrap();
    await jest.advanceTimersByTimeAsync(20_000);
    expect(run).toHaveBeenCalledTimes(1);
    let stopped = false;
    const stop = sender.onModuleDestroy().then(() => {
      stopped = true;
    });
    await Promise.resolve();
    expect(stopped).toBe(false);
    finish();
    await stop;
    await jest.advanceTimersByTimeAsync(20_000);
    expect(run).toHaveBeenCalledTimes(1);
  });
  it('polls again after a completed cycle and cancels scheduled work on shutdown', async () => {
    process.env.EMAIL_WORKER_ENABLED = 'true';
    const run = jest.spyOn(sender, 'runOnce').mockResolvedValue();
    sender.onApplicationBootstrap();
    await jest.advanceTimersByTimeAsync(5000);
    expect(run).toHaveBeenCalledTimes(2);
    await sender.onModuleDestroy();
    await jest.advanceTimersByTimeAsync(20_000);
    expect(run).toHaveBeenCalledTimes(2);
  });
});
