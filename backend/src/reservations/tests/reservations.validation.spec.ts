import { BadRequestException } from '@nestjs/common';
import { ReservationsValidation } from '../reservations.validation.js';
import { ValidationService } from '../../common/validation.service.js';

const validation = new ValidationService();
const id = 'ABCDEFAB-1234-4123-8123-ABCDEFABCDEF';

describe('Reservations validation', () => {
  it('normalizes path and booking UUIDs and trims admin reasons', () => {
    expect(validation.validate(ReservationsValidation.ID, id)).toBe(id.toLowerCase());
    expect(validation.validate(ReservationsValidation.BOOK, { eventId: id })).toEqual({ eventId: id.toLowerCase() });
    expect(validation.validate(ReservationsValidation.ADMIN_CANCEL, { reason: ' Request received ' })).toEqual({
      reason: 'Request received',
    });
  });

  it.each([{}, { eventId: 'invalid' }, { eventId: id, userId: 'another-user' }])(
    'rejects invalid or server-owned booking input: %j',
    (input) => {
      expect(() => validation.validate(ReservationsValidation.BOOK, input)).toThrow(BadRequestException);
    },
  );

  it.each([undefined, null, { extra: true }])('requires an explicit empty body or query: %j', (input) => {
    expect(() => validation.validate(ReservationsValidation.EMPTY, input)).toThrow(BadRequestException);
  });

  it.each([{}, { reason: ' ' }, { reason: 'Valid', cancelledById: 'spoofed' }])('rejects invalid admin cancellation input: %j', (input) => {
    expect(() => validation.validate(ReservationsValidation.ADMIN_CANCEL, input)).toThrow(BadRequestException);
  });
});
