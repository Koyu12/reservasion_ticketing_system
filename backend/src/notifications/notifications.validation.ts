import { z } from 'zod';
import { createZodDto } from 'nestjs-zod';

const enqueueNotificationSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('EVENT_CHANGED'), reservationId: z.uuid().toLowerCase(), eventChangeId: z.uuid().toLowerCase() }),
  z.strictObject({
    type: z.enum(['BOOKING_CONFIRMED', 'RESERVATION_CANCELLED', 'EVENT_CANCELLED']),
    reservationId: z.uuid().toLowerCase(),
    eventChangeId: z.never().optional(),
  }),
]);

export type EnqueueNotificationInput = z.infer<typeof enqueueNotificationSchema>;

export class NotificationsValidation {
  static readonly ENQUEUE = enqueueNotificationSchema;
  static readonly ID = z.uuid().toLowerCase();
  static readonly EMPTY = z.strictObject({});
}
export class EmptyNotificationDTO extends createZodDto(NotificationsValidation.EMPTY) {}

export interface NotificationEventResponse {
  id: string;
  title: string;
}

export interface NotificationReservationResponse {
  bookingReference: string;
  event: NotificationEventResponse;
}

export interface NotificationRetryActor {
  name: string;
}

export interface FailedNotificationResponse {
  id: string;
  type: 'BOOKING_CONFIRMED' | 'RESERVATION_CANCELLED' | 'EVENT_CANCELLED' | 'EVENT_CHANGED';
  recipientEmail: string;
  status: 'PENDING' | 'PROCESSING' | 'SENT' | 'FAILED' | 'SKIPPED';
  attemptCount: number;
  retryCycleAttemptCount: number;
  lastAttemptAt: Date | null;
  lastError: string | null;
  createdAt: Date;
  updatedAt: Date;
  lastManualRetryAt: Date | null;
  lastManualRetryBy: NotificationRetryActor | null;
  reservation: NotificationReservationResponse;
}

export interface FailedNotificationsResponse {
  jobs: FailedNotificationResponse[];
}

export interface RetriedNotification {
  id: string;
  status: 'PENDING';
}

export interface RetryNotificationResponse {
  job: RetriedNotification;
}

export interface NotificationFieldError {
  field: string;
  message: string;
}

export interface NotificationErrorResponse {
  statusCode: number;
  code: string;
  message: string;
  fieldErrors?: NotificationFieldError[];
}
