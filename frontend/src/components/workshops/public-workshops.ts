import { apiRequest } from '../../api'

export const availabilityLabels = {
  AVAILABLE: 'Available',
  FULL: 'Fully booked',
  REGISTRATION_CLOSED: 'Registration closed',
  STARTED: 'Workshop in progress',
  ENDED: 'Workshop ended',
  CANCELLED: 'Workshop cancelled',
} as const

export type PublicWorkshop = {
  id: string
  title: string
  startsAt: string
  endsAt: string
  venueName: string
  registrationClosesAt: string
  status: 'PUBLISHED' | 'CANCELLED'
  capacity: number
  confirmedCount: number
  remainingPlaces: number
  availability: keyof typeof availabilityLabels
}
export type PublicWorkshopList = {
  events: PublicWorkshop[]
  organizerContactEmail: string
}
export type PublicWorkshopDetail = {
  event: PublicWorkshop & {
    description: string
    venueAddress: string
    cancellationClosesAt: string
    cancelledAt: string | null
    cancellationReason: string | null
  }
  organizerContactEmail: string
}

export async function publicEventRequest<T>(
  path: string,
  signal: AbortSignal,
): Promise<T> {
  const result = await apiRequest<T>(`/events${path}`, { signal })
  if (!result)
    throw new Error('No workshop data was returned. Please try again.')
  return result
}
