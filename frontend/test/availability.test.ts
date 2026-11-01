import assert from 'node:assert/strict'
import { test } from 'node:test'
import { currentAvailability, lowCapacity } from '../src/components/events/availability.ts'
import type { PublicWorkshop } from '../src/components/workshops/public-workshops.ts'

const event: PublicWorkshop = {
  id: 'event', title: 'Workshop', venueName: 'Venue', status: 'PUBLISHED',
  startsAt: '2026-11-07T02:00:00Z', endsAt: '2026-11-07T05:00:00Z',
  registrationClosesAt: '2026-11-06T11:00:00Z',
  capacity: 20, confirmedCount: 17, remainingPlaces: 3, availability: 'AVAILABLE',
}

test('scarcity respects both thresholds and hides for registered or unavailable events', () => {
  assert.equal(lowCapacity(event), true)
  assert.equal(lowCapacity(event, true), false)
  assert.equal(lowCapacity({ ...event, capacity: 10 }), false)
  assert.equal(lowCapacity({ ...event, capacity: 100, remainingPlaces: 6 }), false)
  assert.equal(lowCapacity({ ...event, remainingPlaces: 0 }), false)
  for (const availability of ['FULL', 'REGISTRATION_CLOSED', 'CANCELLED', 'STARTED', 'ENDED'] as const) assert.equal(lowCapacity({ ...event, availability }), false)
})

test('availability transitions at exact registration/start/end boundaries without overriding cancellation', () => {
  assert.equal(currentAvailability(event, Date.parse(event.registrationClosesAt) - 1), 'AVAILABLE')
  assert.equal(currentAvailability(event, Date.parse(event.registrationClosesAt)), 'REGISTRATION_CLOSED')
  assert.equal(currentAvailability(event, Date.parse(event.startsAt)), 'STARTED')
  assert.equal(currentAvailability(event, Date.parse(event.endsAt)), 'ENDED')
  assert.equal(currentAvailability({ ...event, status: 'CANCELLED' }, Date.parse(event.endsAt)), 'CANCELLED')
  assert.equal(currentAvailability({ ...event, availability: 'FULL' }, Date.parse(event.registrationClosesAt) - 1), 'FULL')
})
