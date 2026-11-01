import { z } from 'zod';
import { createZodDto } from 'nestjs-zod';

const eventFieldsSchema = z.strictObject({
  title: z.string().trim().min(1, 'This field is required.'),
  description: z.string().trim().min(1, 'This field is required.'),
  venueName: z.string().trim().min(1, 'This field is required.'),
  venueAddress: z.string().trim().min(1, 'This field is required.'),
  startsAt: z.iso.datetime({ offset: true }),
  endsAt: z.iso.datetime({ offset: true }),
  registrationClosesAt: z.iso.datetime({ offset: true }),
  capacity: z.number().int().positive().max(2147483647),
});

const updateEventSchema = eventFieldsSchema
  .partial()
  .extend({ reason: z.string().trim().min(1, 'This field is required.').optional() })
  .refine((value) => Object.keys(value).some((key) => key !== 'reason'), { message: 'Provide at least one workshop field to update.' });

const eventIdSchema = z.uuid();
const cancelEventSchema = z.strictObject({ reason: z.string().trim().min(1, 'Explain why this workshop is being cancelled.') });
export type CancelEventInput = z.infer<typeof cancelEventSchema>;
const emptyObjectSchema = z.strictObject({});
const publicEventQuerySchema = z
  .strictObject({
    q: z.string().trim().optional(),
    from: z.iso
      .date()
      .refine((value) => !value.startsWith('0000-'), { message: 'Choose a date in year 0001 or later.' })
      .optional(),
    to: z.iso
      .date()
      .refine((value) => !value.startsWith('0000-'), { message: 'Choose a date in year 0001 or later.' })
      .optional(),
  })
  .refine(({ from, to }) => !from || !to || from <= to, { path: ['to'], message: 'To date must be on or after From date.' });
export type CreateEventInput = z.infer<typeof eventFieldsSchema>;
export type UpdateEventInput = z.infer<typeof updateEventSchema>;
export type PublicEventQuery = z.infer<typeof publicEventQuerySchema>;

export class EventsValidation {
  static readonly CREATE = eventFieldsSchema;
  static readonly UPDATE = updateEventSchema;
  static readonly ID = eventIdSchema;
  static readonly CANCEL = cancelEventSchema;
  static readonly EMPTY = emptyObjectSchema;
  static readonly PUBLIC_QUERY = publicEventQuerySchema;
}

export class CreateEventDTO extends createZodDto(EventsValidation.CREATE) {}
export class UpdateEventDTO extends createZodDto(EventsValidation.UPDATE) {}
export class CancelEventDTO extends createZodDto(EventsValidation.CANCEL) {}
export class EmptyEventDTO extends createZodDto(EventsValidation.EMPTY) {}
export class PublicEventQueryDTO extends createZodDto(EventsValidation.PUBLIC_QUERY) {}

export interface PublicEventResponse {
  id: string;
  title: string;
  startsAt: Date;
  endsAt: Date;
  venueName: string;
  registrationClosesAt: Date;
  status: 'DRAFT' | 'PUBLISHED' | 'CANCELLED';
  capacity: number;
  confirmedCount: number;
  remainingPlaces: number;
  availability: 'CANCELLED' | 'ENDED' | 'STARTED' | 'REGISTRATION_CLOSED' | 'FULL' | 'AVAILABLE';
}

export interface PublicEventDetailResponse extends PublicEventResponse {
  description: string;
  venueAddress: string;
  cancelledAt: Date | null;
  cancellationReason: string | null;
  cancellationClosesAt: Date;
}

export interface AdminEventResponse {
  id: string;
  title: string;
  description: string;
  venueName: string;
  venueAddress: string;
  startsAt: Date;
  endsAt: Date;
  registrationClosesAt: Date;
  capacity: number;
  status: 'DRAFT' | 'PUBLISHED' | 'CANCELLED';
  scheduleRevision: number;
  cancelledAt: Date | null;
  cancelledById: string | null;
  cancellationReason: string | null;
  createdAt: Date;
  updatedAt: Date;
  confirmedCount: number;
}

export interface EventResponse {
  event: AdminEventResponse;
  organizerContactEmail: string;
}

export interface EventListResponse {
  events: AdminEventResponse[];
  organizerContactEmail: string;
}

export interface PublicEventResult {
  event: PublicEventDetailResponse;
  organizerContactEmail: string;
}

export interface PublicEventListResponse {
  events: PublicEventResponse[];
  organizerContactEmail: string;
}

export interface EventFieldError {
  field: string;
  message: string;
}

export interface EventErrorResponse {
  statusCode: number;
  code: string;
  message: string;
  fieldErrors?: EventFieldError[];
}
