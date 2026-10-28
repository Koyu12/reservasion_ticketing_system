import { z } from 'zod';

export const reservationIdSchema = z.uuid().toLowerCase();
export const reservationListQuerySchema = z.strictObject({});
export const cancelReservationSchema = z.strictObject({});
export const bookReservationSchema = z.strictObject({
  eventId: z.uuid().toLowerCase(),
});
export type BookReservationInput = z.infer<typeof bookReservationSchema>;
