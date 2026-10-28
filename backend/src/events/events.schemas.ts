import { z } from 'zod';

export const eventFieldsSchema = z.strictObject({
  title: z.string().trim().min(1, 'This field is required.'),
  description: z.string().trim().min(1, 'This field is required.'),
  venueName: z.string().trim().min(1, 'This field is required.'),
  venueAddress: z.string().trim().min(1, 'This field is required.'),
  startsAt: z.iso
    .datetime({ offset: true })
    .transform((value) => new Date(value)),
  endsAt: z.iso
    .datetime({ offset: true })
    .transform((value) => new Date(value)),
  registrationClosesAt: z.iso
    .datetime({ offset: true })
    .transform((value) => new Date(value)),
  capacity: z.number().int().positive().max(2147483647),
});

export const updateEventSchema = eventFieldsSchema
  .partial()
  .extend({
    reason: z.string().trim().min(1, 'This field is required.').optional(),
  })
  .refine((value) => Object.keys(value).some((key) => key !== 'reason'), {
    message: 'Provide at least one workshop field to update.',
  });

export const eventIdSchema = z.uuid();
export const emptyObjectSchema = z.strictObject({});
export const publicEventQuerySchema = z
  .strictObject({
    q: z.string().trim().optional(),
    from: z.iso
      .date()
      .refine((value) => !value.startsWith('0000-'), {
        message: 'Choose a date in year 0001 or later.',
      })
      .optional(),
    to: z.iso
      .date()
      .refine((value) => !value.startsWith('0000-'), {
        message: 'Choose a date in year 0001 or later.',
      })
      .optional(),
  })
  .refine(({ from, to }) => !from || !to || from <= to, {
    path: ['to'],
    message: 'To date must be on or after From date.',
  });
export type CreateEventInput = z.infer<typeof eventFieldsSchema>;
export type UpdateEventInput = z.infer<typeof updateEventSchema>;
export type PublicEventQuery = z.infer<typeof publicEventQuerySchema>;
