export type EventSummary = {
  id: string
  title: string
  startsAt: string
  endsAt: string
  venueName: string
  coverUrl: string | null
  status: 'PUBLISHED' | 'CANCELLED'
  availability: 'AVAILABLE' | 'FULL' | 'REGISTRATION_CLOSED' | 'STARTED' | 'ENDED' | 'CANCELLED'
  registered: boolean
}

export type EventStatus = EventSummary['availability'] | 'REGISTERED'
