export type ReservationDetails = {
  id: string
  eventId: string
  bookingReference: string
  status: 'CONFIRMED' | 'CANCELLED'
  createdAt: string
  cancelledAt: string | null
  affectedByChange: boolean
  cancellationClosesAt: string
  event: {
    id: string
    title: string
    status: 'DRAFT' | 'PUBLISHED' | 'CANCELLED'
    startsAt: string
    endsAt: string
    venueName: string
    venueAddress: string
    registrationClosesAt: string
  }
}

export type ReservationDetailResponse = {
  reservation: ReservationDetails
  organizerContactEmail: string
}

export type ReservationListResponse = {
  current: ReservationDetails[]
  history: ReservationDetails[]
  organizerContactEmail: string
}
