import { BadRequestException } from '@nestjs/common';
import { ValidationService } from '../../common/validation.service.js';
import { EventsValidation } from '../events.validation.js';
const eventFieldsSchema = EventsValidation.CREATE;
const updateEventSchema = EventsValidation.UPDATE;

const valid = {
  title: ' Workshop ',
  description: 'An in-person workshop',
  venueName: 'Room A',
  venueAddress: '10 Example Road',
  capacity: 5,
  startsAt: '2035-01-20T09:00:00+07:00',
  endsAt: '2035-01-20T10:00:00+07:00',
  registrationClosesAt: '2035-01-19T09:00:00+07:00',
};

describe('Workshop request validation', () => {
  it('trims text and retains explicit timestamp input for the service', () => {
    const event = new ValidationService().validate(eventFieldsSchema, valid);
    expect(event.title).toBe('Workshop');
    expect(event.startsAt).toBe('2035-01-20T09:00:00+07:00');
  });

  it.each([
    { status: 'PUBLISHED' },
    { createdById: 'another-user' },
    { scheduleRevision: 4 },
    { cancellationReason: 'Injection' },
    { title: ' ' },
    { capacity: '5' },
    { capacity: 0 },
    { capacity: 1.5 },
    { capacity: 2147483648 },
    { startsAt: '2035-01-20T09:00:00' },
    { startsAt: '2035-02-30T09:00:00+07:00' },
  ])('rejects invalid or server-owned input: %j', (input) => {
    expect(() => new ValidationService().validate(eventFieldsSchema, { ...valid, ...input })).toThrow(BadRequestException);
  });

  it('requires complete drafts and actual editable fields for patches', () => {
    expect(eventFieldsSchema.safeParse({ title: 'Incomplete' }).success).toBe(false);
    expect(updateEventSchema.safeParse({}).success).toBe(false);
    expect(updateEventSchema.safeParse({ reason: 'No changes' }).success).toBe(false);
    expect(updateEventSchema.safeParse({ venueName: 'Room B', reason: ' ' }).success).toBe(false);
    expect(updateEventSchema.safeParse({ description: 'Updated' }).success).toBe(true);
    expect(updateEventSchema.safeParse({ status: 'CANCELLED' }).success).toBe(false);
  });
});
