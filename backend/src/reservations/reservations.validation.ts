import { z } from 'zod';
import { createZodDto } from 'nestjs-zod';

const reservationIdSchema = z.uuid().toLowerCase();
const emptyReservationSchema = z.strictObject({});
const adminCancelReservationSchema = z.strictObject({
  reason: z.string().trim().min(1, 'Explain why this reservation is being cancelled.'),
});
export type AdminCancelReservationInput = z.infer<typeof adminCancelReservationSchema>;
const bookReservationSchema = z.strictObject({ eventId: z.uuid().toLowerCase() });
export type BookReservationInput = z.infer<typeof bookReservationSchema>;

export class ReservationsValidation {
  static readonly BOOK = bookReservationSchema;
  static readonly ID = reservationIdSchema;
  static readonly EMPTY = emptyReservationSchema;
  static readonly ADMIN_CANCEL = adminCancelReservationSchema;
}
export class BookReservationDTO extends createZodDto(ReservationsValidation.BOOK) {}
export class AdminCancelReservationDTO extends createZodDto(ReservationsValidation.ADMIN_CANCEL) {}
export class EmptyReservationDTO extends createZodDto(ReservationsValidation.EMPTY) {}

export interface ReservationSummary {
  id: string;
  eventId: string;
  bookingReference: string;
  status: 'CONFIRMED' | 'CANCELLED';
  createdAt: Date;
}

export interface CancelledReservation extends ReservationSummary {
  cancelledAt: Date | null;
}

export interface AdminCancelledReservation extends CancelledReservation {
  cancelledById: string | null;
  cancellationSource: 'SELF_SERVICE' | 'ADMIN' | 'EVENT_CANCELLED' | null;
  cancellationReason: string | null;
}

export interface ReservationEventSummary {
  id: string;
  title: string;
  status: 'DRAFT' | 'PUBLISHED' | 'CANCELLED';
  startsAt: Date;
  endsAt: Date;
  capacity: number;
}

export interface ReservationEventDetails {
  id: string;
  title: string;
  status: 'DRAFT' | 'PUBLISHED' | 'CANCELLED';
  startsAt: Date;
  endsAt: Date;
  venueName: string;
  venueAddress: string;
  registrationClosesAt: Date;
  scheduleRevision: number;
  cancelledAt: Date | null;
  cancellationReason: string | null;
}

export interface ReservationDetailsResponse extends CancelledReservation {
  event: ReservationEventDetails;
  affectedByChange: boolean;
  cancellationClosesAt: Date;
}

export interface ReservationAttendee {
  name: string;
  email: string;
}

export interface ReservationCancellationActor {
  id: string;
  name: string;
}

export interface AdminReservationDetails extends AdminCancelledReservation {
  attendee: ReservationAttendee;
  cancelledBy: ReservationCancellationActor | null;
}

export interface BookingResponse {
  reservation: ReservationSummary;
}

export interface CancelReservationResponse {
  reservation: CancelledReservation;
}

export interface AdminCancelReservationResponse {
  reservation: AdminCancelledReservation;
}

export interface ReservationResponse {
  reservation: ReservationDetailsResponse;
  organizerContactEmail: string;
}

export interface ReservationListResponse {
  current: ReservationDetailsResponse[];
  history: ReservationDetailsResponse[];
  organizerContactEmail: string;
}

export interface EventReservationsResponse {
  event: ReservationEventSummary;
  confirmedCount: number;
  confirmed: AdminReservationDetails[];
  cancelled: AdminReservationDetails[];
}

export interface ReservationFieldError {
  field: string;
  message: string;
}

export interface ReservationErrorResponse {
  statusCode: number;
  code: string;
  message: string;
  fieldErrors?: ReservationFieldError[];
  reservationId?: string;
}
