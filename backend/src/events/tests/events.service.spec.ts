import { BadRequestException } from '@nestjs/common';
import { jest } from '@jest/globals';
import type { Logger } from 'winston';
import { EventsService } from '../events.service.js';
import { ValidationService } from '../../common/validation.service.js';
import type { PrismaService } from '../../common/prisma.service.js';
import type { NotificationsService } from '../../notifications/notifications.service.js';

const request = {
  title: ' Workshop ',
  description: 'Description',
  venueName: 'Room A',
  venueAddress: 'Address',
  capacity: 5,
  startsAt: '2035-01-20T09:00:00+07:00',
  endsAt: '2035-01-20T10:00:00+07:00',
  registrationClosesAt: '2035-01-19T09:00:00+07:00',
};

describe('EventsService request boundary', () => {
  const create = jest.fn<(...args: unknown[]) => Promise<unknown>>();
  const transaction = jest.fn<(...args: unknown[]) => Promise<unknown>>();
  const logger = { debug: jest.fn(), info: jest.fn() };
  const service = new EventsService(
    { event: { create }, $transaction: transaction } as unknown as PrismaService,
    {} as NotificationsService,
    new ValidationService(),
    logger as unknown as Logger,
    { organizerContactEmail: 'organizer@example.invalid' },
  );
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('rejects invalid fields before querying and preserves field errors', async () => {
    await expect(service.create({ ...request, capacity: 0 }, 'admin')).rejects.toMatchObject({
      response: { code: 'VALIDATION_ERROR', fieldErrors: [{ field: 'capacity', message: expect.any(String) as unknown }] },
    });
    expect(create).not.toHaveBeenCalled();
    expect(logger.info).not.toHaveBeenCalled();
    await expect(service.publish('11111111-1111-4111-8111-111111111111', undefined as never)).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.get('invalid')).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.publish('11111111-1111-4111-8111-111111111111', { extra: true } as never)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('converts timestamps once and returns only explicit response fields', async () => {
    const event = {
      ...request,
      title: 'Workshop',
      id: '11111111-1111-4111-8111-111111111111',
      startsAt: new Date(request.startsAt),
      endsAt: new Date(request.endsAt),
      registrationClosesAt: new Date(request.registrationClosesAt),
      createdById: 'private',
      _count: { reservationn: 0 },
    };
    create.mockResolvedValueOnce(event);
    const result = await service.create(request, 'admin');
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ title: 'Workshop', startsAt: new Date('2035-01-20T02:00:00Z'), createdById: 'admin' }) as unknown,
      }),
    );
    expect(result.event.confirmedCount).toBe(0);
    expect(result.event).not.toHaveProperty('createdById');
    expect(result.event).not.toHaveProperty('_count');
    expect(logger.info).toHaveBeenCalledWith('Workshop created', expect.objectContaining({ eventId: event.id }));
  });

  it('does not log successful completion when a transaction fails', async () => {
    transaction.mockRejectedValueOnce(new Error('rollback'));
    await expect(service.update('11111111-1111-4111-8111-111111111111', { title: 'Change' }, 'admin')).rejects.toThrow('rollback');
    expect(logger.info).not.toHaveBeenCalled();
  });
});
