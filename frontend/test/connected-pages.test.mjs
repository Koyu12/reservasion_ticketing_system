import assert from 'node:assert/strict'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter, Route, Routes } from 'react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

test('connected page presentations use real-response fixtures and preserve unavailable/error states', async () => {
  const previousAuth = globalThis.__frontendTestAuth
  const contains = (html, pattern) => assert.ok(pattern.test(html), 'Expected ' + pattern)
  const notContains = (html, pattern) => assert.ok(!pattern.test(html), 'Unexpected ' + pattern)
  const server = await createServer({
    root: fileURLToPath(new URL('../', import.meta.url)),
    server: { middlewareMode: true, hmr: false },
    appType: 'custom',
    plugins: [{
      name: 'test-auth-session', enforce: 'pre',
      resolveId(source) { if (/\/auth-client(?:\.ts)?$/.test(source)) return '\0test-auth-session' },
      load(id) { if (id === '\0test-auth-session') return 'export const authClient = { useSession: () => globalThis.__frontendTestAuth }' },
    }],
  })
  const id = 'abcdef12-1234-4321-8123-abcdef123456'
  const user = { id: 'attendee', name: 'Actual attendee', email: 'attendee@example.com', role: 'ATTENDEE', emailVerified: true }
  const event = {
    id, title: 'Actual API workshop', startsAt: '2035-11-07T02:00:00Z', endsAt: '2035-11-07T05:00:00Z',
    venueName: 'Actual venue', venueAddress: 'Actual street address', description: 'Actual workshop description.',
    registrationClosesAt: '2035-11-06T11:00:00Z', cancellationClosesAt: '2035-11-06T02:00:00Z',
    status: 'PUBLISHED', capacity: 20, confirmedCount: 17, remainingPlaces: 3, availability: 'AVAILABLE', cancelledAt: null, cancellationReason: null,
  }
  const reservation = { id, eventId: id, bookingReference: 'ABCDEF0123456789ABCDEF01', status: 'CONFIRMED', createdAt: '2035-10-01T00:00:00Z', cancelledAt: null, affectedByChange: false, cancellationClosesAt: event.cancellationClosesAt, event }
  const contact = 'organizer@example.com'
  function session(data, error = null) { globalThis.__frontendTestAuth = { data, isPending: false, error, refetch: async () => undefined } }
  function client(entries = []) {
    const value = new QueryClient({ defaultOptions: { queries: { retry: false, retryOnMount: false, staleTime: Infinity } } })
    for (const [key, data] of entries) value.setQueryData(key, data)
    return value
  }
  async function render(file, name, path, route, entries = [], props = {}, suppliedClient) {
    const module = await server.ssrLoadModule(`/src/${file}`)
    return renderToStaticMarkup(h(QueryClientProvider, { client: suppliedClient ?? client(entries) }, h(MemoryRouter, { initialEntries: [path] }, h(Routes, null, h(Route, { path: route, element: h(module[name], props) })))))
  }
  const reservations = [['reservations', user.id], { current: [reservation], history: [], organizerContactEmail: contact }]
  const details = [['reservation', user.id, id], { reservation, organizerContactEmail: contact }]
  try {
    session(null)
    const empty = await render('features/discovery/Discovery.tsx', 'Discovery', '/events', '/events', [], { events: [] })
    contains(empty, /Nothing on the calendar yet/)
    notContains(empty, /Introduction to Design Thinking/)
    const missing = await render('features/discovery/Discovery.tsx', 'Discovery', '/events?q=missing', '/events', [], { events: [{ ...event, coverUrl: null, registered: false }] })
    contains(missing, /No events match your filters/)
    const pending = await render('features/discovery/Discovery.tsx', 'Discovery', '/events', '/events')
    contains(pending, /Loading events/)
    contains(pending, /aria-busy="true"/)
    const failedClient = client()
    failedClient.getQueryCache().build(failedClient, { queryKey: ['public-events'] }).setState({ status: 'error', error: new Error('Unable to reach the API'), fetchStatus: 'idle' })
    const failedDiscovery = await render('features/discovery/Discovery.tsx', 'Discovery', '/events', '/events', [], {}, failedClient)
    contains(failedDiscovery, /Unable to load events/)
    contains(failedDiscovery, /Try again/)
    notContains(failedDiscovery, /0 upcoming events/)
    const notFound = await render('App.tsx', 'default', '/missing-page', '*')
    contains(notFound, /Page not found/)
    contains(notFound, /href="#page-content"/)
    for (const mode of ['login', 'register']) {
      const form = await render('components/AuthForm.tsx', 'AuthForm', `/${mode}`, `/${mode}`, [], { mode })
      contains(form, mode === 'login' ? /Welcome back/ : /Create your account/)
      contains(form, /autoComplete="email"/i)
      contains(form, /minLength="8"/)
      contains(form, /Continue with Google/)
    }
    const forgot = await render('components/ForgotPassword.tsx', 'ForgotPassword', '/forgot-password', '/forgot-password')
    contains(forgot, /Forgot your password/)
    contains(forgot, /type="email"/)
    const resetInvalid = await render('components/ResetPassword.tsx', 'ResetPassword', '/reset-password', '/reset-password')
    contains(resetInvalid, /Reset link unavailable/)
    const reset = await render('components/ResetPassword.tsx', 'ResetPassword', '/reset-password?token=test-token', '/reset-password')
    contains(reset, /name="confirmation"/)
    const verification = await render('components/VerifyEmail.tsx', 'VerifyEmail', '/verify-email?error=TOKEN_EXPIRED', '/verify-email')
    contains(verification, /Verification link unavailable/)
    notContains(verification, /Your email is verified/)

    session({ user })
    const success = await render('components/workshops/BookingConfirmation.tsx', 'BookingConfirmation', `/reservations/${id}/confirmation`, '/reservations/:id/confirmation', [details])
    contains(success, /You’re booked/)
    contains(success, /ABCDEF0123456789ABCDEF01/)
    assert.ok(success.includes(`href="/reservations/${id}"`))
    notContains(success, /Cancel Reservation/)
    const active = await render('components/workshops/MyReservations.tsx', 'MyReservations', '/reservations', '/reservations', [reservations])
    contains(active, /Actual API workshop/)
    contains(active, /1 active reservation/)
    const history = await render('components/workshops/MyReservations.tsx', 'MyReservations', '/reservations?tab=history', '/reservations', [reservations])
    contains(history, /No reservation history yet/)
    const changed = { ...reservation, affectedByChange: true, cancellationClosesAt: event.startsAt }
    const changedDetail = await render('components/workshops/ReservationDetails.tsx', 'ReservationDetails', `/reservations/${id}`, '/reservations/:id', [[details[0], { reservation: changed, organizerContactEmail: contact }]])
    contains(changedDetail, /Previous schedule and venue unavailable/)
    contains(changedDetail, /until the revised event starts/)
    const cancelled = { ...reservation, status: 'CANCELLED', event: { ...event, status: 'CANCELLED', cancellationReason: 'Actual organizer reason' } }
    const cancelledDetail = await render('components/workshops/ReservationDetails.tsx', 'ReservationDetails', `/reservations/${id}`, '/reservations/:id', [[details[0], { reservation: cancelled, organizerContactEmail: contact }]])
    contains(cancelledDetail, /Actual organizer reason/)
    notContains(cancelledDetail, />Cancel Reservation<\/button>/)
    const eventPage = await render('components/workshops/WorkshopDetails.tsx', 'WorkshopDetails', `/events/${id}`, '/events/:id', [[['public-event', id], { event, organizerContactEmail: contact }], [reservations[0], { ...reservations[1], current: [changed] }]])
    contains(eventPage, /Actual workshop description/)
    contains(eventPage, /Event image unavailable/)
    contains(eventPage, /Map preview unavailable/)
    contains(eventPage, /View My Reservation/)
    notContains(eventPage, /Only 3 spots left/)
    const unhealthy = { message: 'Session check failed' }
    session({ user }, unhealthy)
    const blocked = await render('components/workshops/BookingAction.tsx', 'BookingAction', `/events/${id}`, '/events/:id', [reservations], { event })
    contains(blocked, /Unable to check your session/)
    notContains(blocked, />Reserve a Spot<\/button>/)

    session({ user: { ...user, role: 'ADMIN' } })
    const adminEntry = [['admin-events'], { events: [event], organizerContactEmail: contact }]
    const adminList = await render('components/admin/WorkshopList.tsx', 'WorkshopList', '/admin/events', '/admin/events', [adminEntry])
    contains(adminList, /Actual API workshop/)
    contains(adminList, /17 \/ 20 confirmed/)
    const editor = await render('components/admin/WorkshopEditor.tsx', 'WorkshopEditor', `/admin/events/${id}`, '/admin/events/:id', [[['admin-event', id], { event, organizerContactEmail: contact }]])
    contains(editor, /Actual API workshop/)
    contains(editor, /name="capacity"/)
    const create = await render('components/admin/WorkshopEditor.tsx', 'WorkshopEditor', '/admin/events/new', '/admin/events/new', [adminEntry])
    contains(create, /Create workshop/)
    const attendees = await render('components/admin/WorkshopAttendees.tsx', 'WorkshopAttendees', `/admin/events/${id}/attendees`, '/admin/events/:id/attendees', [[['admin-attendees', user.id, id], { event, confirmedCount: 0, confirmed: [], cancelled: [] }]])
    contains(attendees, /Attendees/)
    const failed = await render('components/admin/FailedEmails.tsx', 'FailedEmails', '/admin/notifications', '/admin/notifications', [[['failed-emails', user.id], { jobs: [] }]])
    contains(failed, /No failed emails/)
  } finally {
    globalThis.__frontendTestAuth = previousAuth
    await server.close()
  }
})
