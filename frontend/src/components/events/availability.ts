import type { PublicWorkshop } from '../workshops/public-workshops.ts'

export function lowCapacity(event: PublicWorkshop, registered = false) {
  return !registered && event.availability === 'AVAILABLE' && event.remainingPlaces > 0 && event.remainingPlaces <= 5 && event.remainingPlaces <= event.capacity * 0.2
}

export function currentAvailability(event: PublicWorkshop, now: number): PublicWorkshop['availability'] {
  if (event.status === 'CANCELLED' || event.availability === 'CANCELLED') return 'CANCELLED'
  if (now >= Date.parse(event.endsAt)) return 'ENDED'
  if (now >= Date.parse(event.startsAt)) return 'STARTED'
  if (now >= Date.parse(event.registrationClosesAt)) return 'REGISTRATION_CLOSED'
  return event.availability
}
