import { toWibInput } from '../../workshop-time.ts'
import type { EventSummary } from '../../components/events/types.ts'
import { apiRequest } from '../../api.ts'
import type { PublicWorkshopList } from '../../components/workshops/public-workshops.ts'

export type DiscoveryFilters = { q: string; from: string; to: string }

export const DISCOVERY_PREVIEW_NOW = '2026-10-30T00:00:00+07:00'

export function validDate(value: string): boolean {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(`${value}T00:00:00Z`)) &&
    new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value
  )
}

export function readDiscoveryFilters(
  params: URLSearchParams,
): DiscoveryFilters {
  const from = params.get('from') ?? ''
  const to = params.get('to') ?? ''
  const complete = validDate(from) && validDate(to) && from <= to
  return {
    q: params.get('q') ?? '',
    from: complete ? from : '',
    to: complete ? to : '',
  }
}

export function filterDiscoveryEvents(
  events: readonly EventSummary[],
  filters: DiscoveryFilters,
  now = new Date(),
): EventSummary[] {
  const title = filters.q.trim().toLocaleLowerCase('en')
  return events
    .filter((event) => {
      const date = toWibInput(event.startsAt).slice(0, 10)
      return (
        event.status === 'PUBLISHED' &&
        Date.parse(event.startsAt) > now.getTime() &&
        event.title.toLocaleLowerCase('en').includes(title) &&
        (!filters.from ||
          !filters.to ||
          (date >= filters.from && date <= filters.to))
      )
    })
    .sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt))
}

export function discoveryEmptyState(
  upcomingCount: number,
  matchingCount: number,
) {
  if (upcomingCount === 0) return 'no-upcoming'
  return matchingCount === 0 ? 'no-matches' : null
}

export function createMockDiscoveryEvents(): EventSummary[] {
  const samples = [
    {
      title: 'Introduction to Design Thinking',
      venueName: 'Community Hall · Central Jakarta',
      availability: 'AVAILABLE',
      registered: false,
      time: '09:00',
      end: '12:00',
      image: 'design-thinking',
    },
    {
      title: 'Public Speaking with Confidence',
      venueName: 'Learning Studio · South Jakarta',
      availability: 'FULL',
      registered: false,
      time: '10:00',
      end: '12:00',
      image: 'public-speaking',
    },
    {
      title: 'Getting Started with Urban Gardening',
      venueName: 'Community Garden · West Jakarta',
      availability: 'REGISTRATION_CLOSED',
      registered: false,
      time: '09:00',
      end: '11:00',
      image: 'urban-gardening',
    },
    {
      title: 'Everyday Photography Workshop',
      venueName: 'Creative Space · Central Jakarta',
      availability: 'AVAILABLE',
      registered: true,
      time: '13:00',
      end: '16:00',
      image: 'photography',
    },
  ] as const
  return samples.map((sample, index) => {
    const day = new Date('2026-11-07T00:00:00Z')
    day.setUTCDate(day.getUTCDate() + index * 7)
    const date = day.toISOString().slice(0, 10)
    return {
      id: `de000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
      title: sample.title,
      venueName: sample.venueName,
      startsAt: new Date(`${date}T${sample.time}:00+07:00`).toISOString(),
      endsAt: new Date(`${date}T${sample.end}:00+07:00`).toISOString(),
      coverUrl: `/events/${sample.image}.jpg`,
      status: 'PUBLISHED',
      availability: sample.availability,
      registered: sample.registered,
    }
  })
}

export async function getDiscoveryEvents(signal: AbortSignal): Promise<EventSummary[]> {
  const result = await apiRequest<PublicWorkshopList>('/events', { signal })
  if (!result) throw new Error('No workshop data was returned. Please try again.')
  return result.events.map((event) => ({
    id: event.id,
    title: event.title,
    startsAt: event.startsAt,
    endsAt: event.endsAt,
    venueName: event.venueName,
    status: event.status,
    availability: event.availability,
    coverUrl: null,
    registered: false,
  }))
}
