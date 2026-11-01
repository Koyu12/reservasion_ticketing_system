import { BadRequestException } from '@nestjs/common';
import { jest } from '@jest/globals';
import type { Logger } from 'winston';
import { ReservationsService } from '../reservations.service.js';
import { ValidationService } from '../../common/validation.service.js';
import type { PrismaService } from '../../common/prisma.service.js';
import type { NotificationsService } from '../../notifications/notifications.service.js';

const id = 'abcdefab-1234-4123-8123-abcdefabcdef';
const booking = {
  id,
  eventId: id,
  bookingReference: 'PRIVATE-REFERENCE',
  status: 'CONFIRMED',
  createdAt: new Date('2035-01-01'),
  userId: 'private-user',
  bookedRevision: 9,
};

describe('ReservationsService request boundary and logs', () => {
  const transaction = jest.fn<(...args: unknown[]) => Promise<unknown>>();
  const findFirst = jest.fn<(...args: unknown[]) => Promise<unknown>>();
  const logger = { debug: jest.fn(), info: jest.fn() };
  const service = new ReservationsService(
    { $transaction: transaction, reservation: { findFirst } } as unknown as PrismaService,
    {} as NotificationsService,
    new ValidationService(),
    logger as unknown as Logger,
    { organizerContactEmail: 'organizer@example.invalid' },
  );
  beforeEach(() => jest.resetAllMocks());

  it('rejects bad input before any database access with existing field errors', async () => {
    try {
      await service.book({ eventId: 'invalid' }, 'user');
      throw new Error('Expected validation failure');
    } catch (error) {
      expect(error).toBeInstanceOf(BadRequestException);
      const body = (error as BadRequestException).getResponse() as { code: string; fieldErrors: { field: string }[] };
      expect(body.code).toBe('VALIDATION_ERROR');
      expect(body.fieldErrors[0].field).toBe('eventId');
    }
    await expect(service.cancel(id, 'user', undefined as never)).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.cancelAsAdmin(id, 'admin', { reason: ' ' })).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.list('user', { extra: true } as never)).rejects.toBeInstanceOf(BadRequestException);
    expect(transaction).not.toHaveBeenCalled();
    expect(findFirst).not.toHaveBeenCalled();
  });

  it('logs success only after transaction resolution and strips internal response fields', async () => {
    let finish!: (value: unknown) => void;
    transaction.mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    const result = service.book({ eventId: id }, 'user');
    expect(logger.info).not.toHaveBeenCalled();
    finish(booking);
    const response = await result;
    expect(response.reservation).toEqual({
      id,
      eventId: id,
      bookingReference: booking.bookingReference,
      status: 'CONFIRMED',
      createdAt: booking.createdAt,
    });
    expect(logger.info).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(logger.info.mock.calls)).not.toContain(booking.bookingReference);
    expect(JSON.stringify(logger.debug.mock.calls)).not.toContain('private-user');
  });

  it('propagates transaction failure without logging success or error contents', async () => {
    transaction.mockRejectedValueOnce(new Error('private database details'));
    await expect(service.book({ eventId: id }, 'user')).rejects.toThrow('private database details');
    expect(logger.info).not.toHaveBeenCalled();
    expect(JSON.stringify(logger.debug.mock.calls)).not.toContain('private database details');
  });

  it('normalizes the reservation ID before an ownership query', async () => {
    findFirst.mockResolvedValueOnce(null);
    await expect(service.get(id.toUpperCase(), 'owner')).rejects.toThrow('Reservation not found.');
    const call = findFirst.mock.calls[0][0] as { where: { id: string; userId: string } };
    expect(call.where).toEqual({ id, userId: 'owner' });
  });
});
