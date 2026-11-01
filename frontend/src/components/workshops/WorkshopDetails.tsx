import { useEffect, useState } from 'react'
import { Link, useLocation, useParams } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { ApiError } from '../../api'
import { formatEventDate, formatWib } from '../../workshop-time'
import { ErrorState, LoadingState } from '../RequestState'
import { publicEventRequest, availabilityLabels } from './public-workshops'
import type { PublicWorkshopDetail } from './public-workshops'
import { BookingAction } from './BookingAction'
import { Cover } from '../events/Cover/Cover'
import { ShareEvent } from '../events/ShareEvent/ShareEvent'
import { currentAvailability, lowCapacity } from '../events/availability'
import { Button } from '../ui/Button/Button'
import { Dialog } from '../ui/Dialog/Dialog'
import { Alert } from '../ui/Alert/Alert'
import { useReservations } from './useReservations'

export function WorkshopDetails() {
  const { id } = useParams()
  const location = useLocation()
  const state: unknown = location.state
  const search = state && typeof state === 'object' && 'workshopSearch' in state && typeof state.workshopSearch === 'string' ? state.workshopSearch : ''
  const [fullDescription, setFullDescription] = useState(false)
  const [now, setNow] = useState(Date.now)
  const { query: reservations } = useReservations()
  const query = useQuery({
    queryKey: ['public-event', id],
    retry: false,
    queryFn: ({ signal }) => publicEventRequest<PublicWorkshopDetail>(`/${id}`, signal),
  })
  const raw = query.data?.event
  const refreshEvent = query.refetch
  useEffect(() => {
    if (!raw) return
    const next = [raw.registrationClosesAt, raw.startsAt, raw.endsAt].map(Date.parse).filter(value => value > now).sort((a,b) => a-b)[0]
    if (!next) return
    const timer = window.setTimeout(() => { setNow(Date.now()); void refreshEvent() }, Math.min(Math.max(next - Date.now(), 1), 2147483647))
    return () => window.clearTimeout(timer)
  }, [raw, now, refreshEvent])
  const missing = query.error instanceof ApiError && [400,404].includes(query.error.status)
  const activeReservation = reservations.data?.current.find(item => item.eventId === id && item.status === 'CONFIRMED')
  const event = raw ? { ...raw, cancellationClosesAt: activeReservation?.cancellationClosesAt ?? raw.cancellationClosesAt, availability: currentAvailability(raw, now) } : null
  const registered = Boolean(activeReservation)
  const email = query.data?.organizerContactEmail
  const back = <Link className="inline-flex min-h-11 w-fit items-center gap-2 font-medium text-muted hover:text-ink" to={search ? `/events?${search}` : '/events'}><span aria-hidden="true">←</span> Back to events</Link>
  if (query.isPending) return <main className="mx-auto w-[min(1200px,calc(100%_-_32px))] py-8">{back}<LoadingState /></main>
  if (missing && !event) return <main className="mx-auto flex w-[min(800px,calc(100%_-_32px))] flex-col gap-5 py-8">{back}<h1 className="text-[28px] font-bold">Workshop not found</h1><p className="text-muted">This workshop is unavailable or the link is incorrect.</p></main>
  if (!event) return <main className="mx-auto w-[min(1200px,calc(100%_-_32px))] py-8">{back}<ErrorState message={query.error?.message ?? 'Unable to load this workshop.'} onRetry={() => void query.refetch()} /></main>
  const scarce = lowCapacity(event, registered)
  const times = { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' } as const
  return <main className="mx-auto flex w-[calc(100%_-_32px)] flex-col gap-7 pt-6 pb-40 desktop:w-[min(1200px,calc(100%_-_64px))] desktop:pt-8 desktop:pb-16">
    {back}
    {query.isError && <ErrorState message="Unable to refresh this workshop. Showing the last loaded details." onRetry={() => void query.refetch()} />}
    <div className="flex flex-col items-start gap-5 desktop:flex-row desktop:justify-between">
      <div className="flex min-w-0 flex-col gap-3"><h1 className="text-[28px] leading-9 font-bold wrap-break-word desktop:text-[36px] desktop:leading-11">{event.title}</h1><p className="text-[16px] leading-6 text-muted">Workshop introduction unavailable.</p></div>
      <div className="shrink-0"><ShareEvent id={event.id} title={event.title} /></div>
    </div>
    <div className="grid min-w-0 grid-cols-1 gap-10 desktop:grid-cols-[minmax(0,1fr)_360px]">
      <div className="flex min-w-0 flex-col gap-8">
        <Cover className="aspect-video min-h-0! w-full" />
        {event.status === 'CANCELLED' && <Alert kind="error"><p>This workshop has been cancelled. Registration is unavailable.</p>{event.cancelledAt && <p className="mt-2">Cancelled on {formatWib(event.cancelledAt)}.</p>}{event.cancellationReason && <p className="mt-2 whitespace-pre-wrap">{event.cancellationReason}</p>}</Alert>}
        <section className="flex flex-col items-start gap-[14px]" aria-labelledby="about-workshop"><h2 id="about-workshop" className="text-[24px] leading-[29px] font-semibold">About this workshop</h2><p className="line-clamp-3 text-[16px] leading-6 whitespace-pre-wrap text-muted">{event.description || 'Workshop description unavailable.'}</p><Button variant="text" onClick={() => setFullDescription(true)}>Read full description</Button></section>
        <dl className="flex flex-col gap-6 border-0 border-y border-solid border-line py-6">
          <div className="flex flex-col gap-2"><dt className="font-semibold text-muted">Date &amp; time</dt><dd className="m-0 flex flex-col gap-2"><time className="text-[18px] font-medium" dateTime={event.startsAt}>{formatEventDate(event.startsAt, { dateStyle: 'full' })}</time><p>{formatEventDate(event.startsAt, times)}–{formatEventDate(event.endsAt, times)} WIB</p>{formatEventDate(event.startsAt, {dateStyle:'short'}) !== formatEventDate(event.endsAt,{dateStyle:'short'}) && <p className="text-muted">Ends {formatWib(event.endsAt)}</p>}</dd></div>
          <div className="flex flex-col gap-2"><dt className="font-semibold text-muted">Venue</dt><dd className="m-0 flex flex-col gap-2"><p className="text-[18px] font-medium">{event.venueName || 'Venue unavailable'}</p><p className="whitespace-pre-wrap text-muted">{event.venueAddress || 'Address unavailable'}</p><div className="flex flex-wrap items-center gap-x-5"><a className="inline-flex min-h-11 items-center font-semibold text-accent hover:underline" href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${event.venueName} ${event.venueAddress}`)}`} target="_blank" rel="noreferrer">Open in Google Maps</a><span className="text-[12px] text-muted">Map preview unavailable</span></div></dd></div>
        </dl>
        <section className="flex flex-col gap-3" aria-labelledby="event-registration"><h2 id="event-registration" className="text-[24px] leading-[29px] font-semibold">Registration</h2><p className={event.status === 'CANCELLED' ? 'text-error' : 'text-ink'}>{registered && event.status !== 'CANCELLED' ? 'Registered' : availabilityLabels[event.availability]}{scarce ? ` · Only ${event.remainingPlaces} spots left` : ''}</p><p className="text-muted">Reserve before {formatWib(event.registrationClosesAt)}.</p><p className="text-muted">Places are confirmed only after your reservation succeeds. Displayed availability does not hold a seat.</p></section>
        <section className="flex flex-col gap-3" aria-labelledby="event-cancellation"><h2 id="event-cancellation" className="text-[24px] leading-[29px] font-semibold">Cancellation &amp; questions</h2><p className="text-muted">Cancel online before {formatWib(event.cancellationClosesAt)}.</p><p className="text-muted">At or within 24 hours before the workshop, contact the organizer. If a significant schedule or venue change affects your reservation, you may cancel until the revised start time.</p>{email ? <a className="w-fit text-accent hover:underline" href={`mailto:${email}`}>{email}</a> : <p className="text-muted">Organizer contact unavailable.</p>}</section>
      </div>
      <BookingAction key={event.id} event={event} affectedByChange={activeReservation?.affectedByChange} />
    </div>
    {fullDescription && <Dialog title="About this workshop" onClose={() => setFullDescription(false)}><p className="whitespace-pre-wrap text-muted">{event.description || 'Workshop description unavailable.'}</p></Dialog>}
  </main>
}
