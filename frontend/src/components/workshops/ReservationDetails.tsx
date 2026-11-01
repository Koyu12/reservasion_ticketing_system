import { Link, Navigate, useNavigate, useParams } from 'react-router'
import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ApiError, apiRequest } from '../../api'
import { authClient } from '../../auth-client'
import { authPath } from '../../return-to'
import { formatEventDate, formatWib } from '../../workshop-time'
import { ErrorState, LoadingState } from '../RequestState'
import { Alert } from '../ui/Alert/Alert'
import { Button } from '../ui/Button/Button'
import { Dialog } from '../ui/Dialog/Dialog'
import type { ReservationDetails as Reservation, ReservationDetailResponse } from './reservations'

export function ReservationDetails() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { data: session, isPending, error: sessionError, refetch } = authClient.useSession()
  const login = authPath('/login', `/reservations/${id}`)
  const query = useQuery({
    queryKey: ['reservation', session?.user.id, id],
    enabled: Boolean(session) && !isPending && !sessionError,
    retry: false,
    queryFn: async ({ signal }) => {
      const result = await apiRequest<ReservationDetailResponse>(`/reservations/${id}`, { signal })
      if (!result) throw new Error('No reservation details were returned. Please try again.')
      return result
    },
  })
  if (isPending) return <LoadingState />
  if (sessionError) return <ErrorState message="Unable to check your session." onRetry={() => void refetch()} />
  if (!session) return <Navigate to={login} replace />
  if (query.isPending) return <LoadingState />
  if (query.error instanceof ApiError && query.error.status === 401) return <div className="mx-auto w-[calc(100%_-_32px)] max-w-[800px] py-8"><Alert kind="error">Your session has expired. <Link className="underline underline-offset-4" to={login} onClick={(event) => { event.preventDefault(); void refetch().then(() => navigate(login)).catch(() => undefined) }}>Log in again</Link> to view your reservation.</Alert></div>
  if (query.error instanceof ApiError && [400, 404].includes(query.error.status)) return <main className="mx-auto flex w-[calc(100%_-_32px)] max-w-[800px] flex-col gap-5 py-8"><h1 className="text-[28px] font-bold">Reservation not found</h1><p className="text-muted">This reservation is unavailable for your account.</p><Link className="inline-flex min-h-11 items-center text-accent" to="/reservations">My Reservations</Link></main>
  if (query.isError) return <ErrorState message={query.error.message} onRetry={() => void query.refetch()} />
  return <ReservationContent key={`${session.user.id}:${query.data.reservation.id}`} reservation={query.data.reservation} email={query.data.organizerContactEmail} userId={session.user.id} />
}

function ReservationContent({ reservation, email, userId }: { reservation: Reservation; email: string; userId: string }) {
  const { event } = reservation
  const [now, setNow] = useState(Date.now)
  const startsAt = Date.parse(event.startsAt)
  const endsAt = Date.parse(event.endsAt)
  useEffect(() => {
    const boundary = now < startsAt ? startsAt : endsAt
    if (now >= boundary) return
    const timer = window.setTimeout(() => setNow(Date.now()), Math.min(Math.max(boundary - Date.now(), 1), 2147483647))
    return () => window.clearTimeout(timer)
  }, [startsAt, endsAt, now])
  const cancelled = reservation.status === 'CANCELLED' || event.status === 'CANCELLED'
  const ended = now >= endsAt
  const time = { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' } as const
  const date = { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' } as const
  const multiDay = formatEventDate(event.startsAt, { dateStyle: 'short' }) !== formatEventDate(event.endsAt, { dateStyle: 'short' })
  return (
    <main className="mx-auto flex w-[calc(100%_-_32px)] max-w-[800px] flex-col gap-6 pt-6 pb-12 desktop:pt-8 desktop:pb-16">
      <Link to="/reservations" className="inline-flex min-h-11 items-center self-start text-[14px] font-medium text-accent hover:underline underline-offset-4">← My Reservations</Link>
      <h1 className="text-[28px] leading-9 font-bold desktop:text-[36px] desktop:leading-11">Your reservation</h1>
      <section className="flex min-w-0 flex-col gap-5 rounded-control border border-solid border-line bg-surface p-6" aria-label="Reservation information">
        <span className={`self-start rounded-status bg-elevated px-2.5 py-1.5 text-[12px] leading-4 font-semibold ${cancelled || ended ? 'text-muted' : 'text-success'}`}>{cancelled ? 'Cancelled' : ended ? 'Ended · Confirmed' : 'Confirmed'}</span>
        <h2 className="text-[22px] leading-[30px] font-semibold wrap-break-word desktop:text-[24px] desktop:leading-8">{event.title}</h2>
        <dl className="m-0 flex flex-col gap-5">
          <div className="flex flex-col gap-1.5"><dt className="text-[13px] font-semibold text-muted">{event.status === 'CANCELLED' ? 'Original date & time' : 'Date & time'}</dt><dd className="m-0 text-[14px] leading-[21px]"><time dateTime={event.startsAt}>{formatEventDate(event.startsAt, date)} · {formatEventDate(event.startsAt, time)}</time>–<time dateTime={event.endsAt}>{multiDay ? `${formatEventDate(event.endsAt, date)} · ` : ''}{formatEventDate(event.endsAt, time)} WIB</time></dd></div>
          <div className="flex flex-col gap-1.5"><dt className="text-[13px] font-semibold text-muted">Venue</dt><dd className="m-0 text-[14px] leading-[21px] whitespace-pre-wrap">{event.venueName}<br />{event.venueAddress}</dd></div>
          <div className="flex flex-col gap-1.5"><dt className="text-[13px] font-semibold text-muted">Booking reference</dt><dd className="m-0 text-[14px] leading-[21px] font-semibold wrap-anywhere">{reservation.bookingReference}</dd></div>
        </dl>
        {reservation.affectedByChange && <div className="flex flex-col gap-2 border-0 border-t border-solid border-line pt-5 text-[14px] leading-[21px]"><h3 className="font-semibold">Schedule or venue updated by the organizer</h3><p className="text-muted">Previous schedule and venue unavailable.</p><p>Now: {formatWib(event.startsAt)} · {event.venueName}</p></div>}
        {reservation.cancelledAt && <p className="text-[13px] text-muted">Cancelled on {formatWib(reservation.cancelledAt)}.</p>}
      </section>
      <section className="flex flex-col gap-4" aria-labelledby="reservation-cancellation-title">
        <h2 id="reservation-cancellation-title" className="text-[22px] leading-[30px] font-semibold desktop:text-[24px] desktop:leading-8">{event.status === 'CANCELLED' ? 'Event cancelled' : cancelled ? 'Cancelled reservation' : 'Cancellation'}</h2>
        {event.status === 'CANCELLED' ? <Alert kind="error">This event will not take place. Your cancelled reservation remains in History. {event.cancellationReason && <span className="block pt-2 whitespace-pre-wrap">{event.cancellationReason}</span>}</Alert> : cancelled ? <p className="text-[14px] leading-[21px] text-muted">This booking no longer reserves a place. Your cancelled reservation remains in History.</p> : <>
          <p className="text-[14px] leading-[21px] text-muted">{reservation.affectedByChange ? 'Your booking was affected by a schedule or venue change. You may cancel until the revised event starts.' : 'You may cancel online more than 24 hours before the event starts. Later requests must go to the organizer.'}</p>
          <p className="text-[14px] leading-[21px] font-semibold">Cancel before <time dateTime={reservation.cancellationClosesAt}>{formatWib(reservation.cancellationClosesAt)}</time>.</p>
          <CancellationAction reservation={reservation} userId={userId} />
        </>}
        <div className="flex flex-col gap-1.5 pt-1 text-[14px] leading-[21px]"><h3 className="text-[13px] font-semibold text-muted">Contact organizer</h3><a className="self-start text-accent underline-offset-4 hover:underline wrap-anywhere" href={`mailto:${email}`}>{email}</a></div>
      </section>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        <Link className="inline-flex min-h-11 items-center text-[14px] font-semibold text-accent hover:underline underline-offset-4" to={`/events/${event.id}`}>{event.status === 'CANCELLED' ? 'View cancelled event' : 'View event'}</Link>
        {reservation.status === 'CANCELLED' && event.status === 'PUBLISHED' && now < startsAt && <Link className="inline-flex min-h-11 items-center text-[14px] text-accent hover:underline underline-offset-4" to={`/events/${event.id}`}>Check availability and book again</Link>}
      </div>
    </main>
  )
}

function CancellationAction({ reservation, userId }: { reservation: Reservation; userId: string }) {
  const client = useQueryClient()
  const navigate = useNavigate()
  const { refetch } = authClient.useSession()
  const [confirming, setConfirming] = useState(false)
  const [now, setNow] = useState(Date.now)
  const deadline = Date.parse(reservation.cancellationClosesAt)
  useEffect(() => {
    if (now >= deadline) return
    const timer = window.setTimeout(() => setNow(Date.now()), Math.min(Math.max(deadline - Date.now(), 1), 2147483647))
    return () => window.clearTimeout(timer)
  }, [deadline, now])
  const cancellation = useMutation({
    mutationFn: async () => {
      const result = await apiRequest<{ reservation: Pick<Reservation, 'id' | 'status' | 'cancelledAt'> }>(`/reservations/${reservation.id}/cancel`, { method: 'POST', body: JSON.stringify({}) })
      if (!result) throw new Error('Unable to confirm cancellation. Check your reservation before trying again.')
      return result
    },
    onSuccess: () => void navigate('/reservations?tab=history', { state: { cancelled: true } }),
    onSettled: async () => {
      setConfirming(false)
      await Promise.all([
        client.invalidateQueries({ queryKey: ['admin-attendees'] }),
        client.invalidateQueries({ queryKey: ['reservation', userId, reservation.id] }),
        client.invalidateQueries({ queryKey: ['reservations', userId] }),
        client.invalidateQueries({ queryKey: ['public-event', reservation.eventId] }),
        client.invalidateQueries({ queryKey: ['public-events'] }),
        client.invalidateQueries({ queryKey: ['admin-event', reservation.eventId] }),
        client.invalidateQueries({ queryKey: ['admin-events'] }),
      ])
    },
  })
  const closed = now >= deadline || (cancellation.error instanceof ApiError && cancellation.error.code === 'CANCELLATION_CLOSED')
  return (
    <div className="flex flex-col items-start gap-3">
      {cancellation.error && <ErrorState message={cancellation.error.message} />}
      {cancellation.error instanceof ApiError && cancellation.error.status === 401 && <Link className="inline-flex min-h-11 items-center text-accent" to={authPath('/login', `/reservations/${reservation.id}`)} onClick={(event) => { event.preventDefault(); void refetch().then(() => navigate(authPath('/login', `/reservations/${reservation.id}`))).catch(() => undefined) }}>Log in again to manage your reservation</Link>}
      <Button variant="destructive" disabled={closed || cancellation.isPending} onClick={() => setConfirming(true)}>Cancel Reservation</Button>
      {closed && <p className="text-[13px] leading-5 text-muted">Self-service cancellation has closed. Contact the organizer and include your booking reference.</p>}
      {confirming && <Dialog title="Cancel your reservation?" busy={cancellation.isPending} onClose={() => setConfirming(false)}>
        <p className="text-[14px] leading-[21px] text-muted">Your place for <strong className="text-ink">{reservation.event.title}</strong> will be released. Booking again depends on availability and the registration deadline.</p>
        <div className="flex flex-wrap justify-end gap-3"><Button variant="secondary" disabled={cancellation.isPending} onClick={() => setConfirming(false)}>Keep reservation</Button><Button variant="destructive" disabled={closed || cancellation.isPending} onClick={() => cancellation.mutate()}>{cancellation.isPending ? 'Cancelling…' : 'Confirm cancellation'}</Button></div>
      </Dialog>}
      {cancellation.isPending && <p role="status" className="text-[13px] text-muted">Cancelling your reservation. Please wait.</p>}
    </div>
  )
}
