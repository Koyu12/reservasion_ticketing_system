import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  createMockDiscoveryEvents,
  DISCOVERY_PREVIEW_NOW,
  discoveryEmptyState,
  filterDiscoveryEvents,
  readDiscoveryFilters,
  validDate,
  getDiscoveryEvents,
} from '../src/features/discovery/data.ts'
import type { EventSummary } from '../src/components/events/types.ts'

const now = new Date('2026-10-29T10:00:00Z')
const filters = { q: '', from: '', to: '' }
const events = createMockDiscoveryEvents()

test('loads actual event records and leaves unavailable imagery as a placeholder', async () => {
  const original = globalThis.fetch
  const signal = new AbortController().signal
  let called = false
  globalThis.fetch = async (url, options) => {
    called = true
    assert.equal(url, '/api/events')
    assert.equal(options?.signal, signal)
    return new Response(JSON.stringify({ events: [{ ...events[0], id: 'real-event', title: 'Actual backend title', capacity: 40, confirmedCount: 38, remainingPlaces: 2 }], organizerContactEmail: 'organizer@example.com' }))
  }
  try {
    const result = await getDiscoveryEvents(signal)
    assert.equal(called, true)
    assert.equal(result[0].id, 'real-event')
    assert.equal(result[0].title, 'Actual backend title')
    assert.equal(result[0].coverUrl, null)
    assert.equal(result[0].registered, false)
  } finally { globalThis.fetch = original }
})

test('mock events preserve the design dates, stable routes and all four display states', () => {
  assert.equal(events.length, 4)
  assert.equal(new Set(events.map((event) => event.id)).size, 4)
  assert.ok(events.every((event) => Date.parse(event.startsAt) > now.getTime()))
  assert.ok(events.every((event) => new Date(event.startsAt).getUTCDay() === 6))
  assert.deepEqual(events.map((event) => event.startsAt), [
    '2026-11-07T02:00:00.000Z',
    '2026-11-14T03:00:00.000Z',
    '2026-11-21T02:00:00.000Z',
    '2026-11-28T06:00:00.000Z',
  ])
  assert.equal(
    filterDiscoveryEvents(events, filters, new Date(DISCOVERY_PREVIEW_NOW)).length,
    4,
  )
  assert.deepEqual(
    events.map((event) =>
      event.registered ? 'REGISTERED' : event.availability,
    ),
    ['AVAILABLE', 'FULL', 'REGISTRATION_CLOSED', 'REGISTERED'],
  )
})

test('title search ignores case and surrounding whitespace and combines with date range', () => {
  assert.equal(
    filterDiscoveryEvents(events, { ...filters, q: '  PHOTOGRAPHY ' }, now)[0]
      ?.id,
    events[3].id,
  )
  assert.equal(
    filterDiscoveryEvents(
      events,
      { q: 'photography', from: '2026-10-31', to: '2026-11-07' },
      now,
    ).length,
    0,
  )
  assert.equal(
    filterDiscoveryEvents(
      events,
      { q: 'photography', from: '2026-11-28', to: '2026-11-28' },
      now,
    ).length,
    1,
  )
})

test('date endpoints include the entire WIB day across UTC date boundaries', () => {
  const fixtures: EventSummary[] = [
    '2026-11-06T16:59:59Z',
    '2026-11-06T17:00:00Z',
    '2026-11-07T16:59:59Z',
    '2026-11-07T17:00:00Z',
  ].map((startsAt, index) => ({ ...events[0], id: String(index), startsAt }))
  const result = filterDiscoveryEvents(
    fixtures,
    { q: '', from: '2026-11-07', to: '2026-11-07' },
    now,
  )
  assert.deepEqual(
    result.map((event) => event.id),
    ['1', '2'],
  )
})

test('sorts soonest first, keeps full and closed events, and excludes cancelled or started events', () => {
  const fixtures = [...events].reverse().concat([
    { ...events[0], id: 'cancelled', status: 'CANCELLED' },
    { ...events[0], id: 'started', startsAt: now.toISOString() },
    { ...events[0], id: 'past', startsAt: '2020-01-01T00:00:00Z' },
  ])
  assert.deepEqual(
    filterDiscoveryEvents(fixtures, filters, now).map((event) => event.id),
    events.map((event) => event.id),
  )
})

test('ignores invalid, reversed and incomplete URL date ranges', () => {
  for (const range of [
    'from=invalid&to=2026-11-07',
    'from=2026-11-07',
    'from=2026-11-21&to=2026-11-07',
    'from=2026-02-30&to=2026-11-07',
  ]) {
    assert.deepEqual(
      readDiscoveryFilters(new URLSearchParams(`q=Design&${range}`)),
      { q: 'Design', from: '', to: '' },
    )
  }
  assert.equal(validDate('2028-02-29'), true)
  assert.equal(validDate('2026-02-29'), false)
  assert.deepEqual(
    readDiscoveryFilters(new URLSearchParams('from=2026-11-07&to=2026-11-07')),
    { q: '', from: '2026-11-07', to: '2026-11-07' },
  )
  assert.equal(
    filterDiscoveryEvents(events, { ...filters, from: '2026-11-07' }, now)
      .length,
    4,
  )
})

test('distinguishes an empty catalog from filters with no matching results', () => {
  assert.equal(discoveryEmptyState(0, 0), 'no-upcoming')
  assert.equal(discoveryEmptyState(4, 0), 'no-matches')
  assert.equal(discoveryEmptyState(4, 1), null)
})
