import { z } from 'zod';

export const reservationIdSchema = z.uuid().toLowerCase();
export const reservationListQuerySchema = z.strictObject({});
export const cancelReservationSchema = z.strictObject({});
export const adminCancelReservationSchema = z.strictObject({
  reason: z
    .string()
    .trim()
    .min(1, 'Explain why this reservation is being cancelled.'),
});
export type AdminCancelReservationInput = z.infer<
  typeof adminCancelReservationSchema
>;
export const bookReservationSchema = z.strictObject({
  eventId: z.uuid().toLowerCase(),
});
export type BookReservationInput = z.infer<typeof bookReservationSchema>;
