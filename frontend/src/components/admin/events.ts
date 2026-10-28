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

export async function eventRequest<T>(
  path: string,
  options?: RequestInit,
): Promise<T> {
  const result = await apiRequest<T>(`/admin/events${path}`, options)
  if (!result)
    throw new Error('No workshop data was returned. Please try again.')
  return result
}
