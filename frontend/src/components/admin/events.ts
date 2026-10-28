import { apiRequest } from '../../api'

export type Workshop = {
  id: string
  title: string
  description: string
  venueName: string
  venueAddress: string
  startsAt: string
  endsAt: string
  registrationClosesAt: string
  capacity: number
  status: 'DRAFT' | 'PUBLISHED' | 'CANCELLED'
  scheduleRevision: number
  confirmedCount: number
  createdAt: string
  updatedAt: string
  cancelledAt: string | null
  cancelledById: string | null
  cancellationReason: string | null
}
export type WorkshopFields = Pick<
  Workshop,
  | 'title'
  | 'description'
  | 'venueName'
  | 'venueAddress'
  | 'startsAt'
  | 'endsAt'
  | 'registrationClosesAt'
  | 'capacity'
> & { reason?: string }
export type WorkshopDetail = { event: Workshop; organizerContactEmail: string }
export type WorkshopList = { events: Workshop[]; organizerContactEmail: string }

export type AdminReservation = {
  id: string
  eventId: string
  bookingReference: string
  status: 'CONFIRMED' | 'CANCELLED'
  createdAt: string
  attendee: { name: string; email: string }
  cancelledAt: string | null
  cancelledById: string | null
  cancelledBy: { id: string; name: string } | null
  cancellationSource: 'SELF_SERVICE' | 'ADMIN' | 'EVENT_CANCELLED' | null
  cancellationReason: string | null
}

export type AttendeeList = {
  event: Pick<
    Workshop,
    'id' | 'title' | 'status' | 'startsAt' | 'endsAt' | 'capacity'
  >
  confirmedCount: number
  confirmed: AdminReservation[]
  cancelled: AdminReservation[]
}

export async function eventRequest<T>(
  path: string,
  options?: RequestInit,
): Promise<T> {
  const result = await apiRequest<T>(`/admin/events${path}`, options)
  if (!result)
    throw new Error('No workshop data was returned. Please try again.')
  return result
}
