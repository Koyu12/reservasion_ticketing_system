import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ApiError, apiRequest } from '../../api'
import { authPath, safeReturnTo } from '../../return-to'
import { formatWib } from '../../workshop-time'
import { ErrorState, LoadingState } from '../RequestState'
import { Button } from '../ui/Button/Button'
import { Dialog } from '../ui/Dialog/Dialog'
import { Alert } from '../ui/Alert/Alert'
import { Status } from '../events/Status/Status'
import { lowCapacity } from '../events/availability'
import { useReservations } from './useReservations'
import type { PublicWorkshopDetail } from './public-workshops'

export function BookingAction({ event, affectedByChange = false }: { event: PublicWorkshopDetail['event']; affectedByChange?: boolean }) {
  const { data: session, isPending, error, refetch, query: reservations } = useReservations()
  const [confirming, setConfirming] = useState(false)
  const navigate = useNavigate()
  const client = useQueryClient()
  const returnTo = `/events/${event.id}`
  const active = reservations.data?.current.find(item => item.eventId === event.id && item.status === 'CONFIRMED')
  async function refreshAvailability() {
    await Promise.all([
      client.invalidateQueries({ queryKey: ['public-event', event.id] }),
      client.invalidateQueries({ queryKey: ['public-events'] }),
      client.invalidateQueries({ queryKey: ['admin-event', event.id] }),
      client.invalidateQueries({ queryKey: ['admin-events'] }),
      client.invalidateQueries({ queryKey: ['reservations', session?.user.id] }),
    ])
  }
  const booking = useMutation({
    retry: false,
    mutationFn: async ({ eventId }: { eventId: string; userId: string }) => {
      const result = await apiRequest<{ reservation: { id: string } }>('/reservations', { method: 'POST', body: JSON.stringify({ eventId }) })
      if (!result?.reservation?.id) throw new Error('The booking result could not be confirmed. Check My Reservations before trying again.')
      return result
    },
    onSuccess: (data, variables) => {
      setConfirming(false)
      void client.invalidateQueries({ queryKey: ['reservations', variables.userId] })
      void refreshAvailability()
      void navigate(`/reservations/${data.reservation.id}/confirmation`)
    },
    onError: failure => {
      setConfirming(false)
      void refreshAvailability()
      if (failure instanceof ApiError && [401, 403].includes(failure.status)) void refetch()
    },
  })
  const failure = booking.variables?.userId === session?.user.id ? booking.error : null
  const existing = failure instanceof ApiError && failure.code === 'ALREADY_RESERVED' && failure.reservationId ? safeReturnTo(`/reservations/${failure.reservationId}`) : null
  const uncertain = Boolean(failure && (!(failure instanceof ApiError) || failure.status >= 500))
  const registered = Boolean(active)
  const canReserve = !isPending && !error && event.availability === 'AVAILABLE' && Boolean(session?.user.emailVerified) && !active && reservations.isSuccess && !booking.isPending && !uncertain
  const label = event.availability === 'FULL' ? 'Fully Booked' : event.availability === 'REGISTRATION_CLOSED' ? 'Registration Closed' : event.availability === 'CANCELLED' ? 'Event Cancelled' : event.availability === 'STARTED' ? 'Workshop Started' : event.availability === 'ENDED' ? 'Workshop Ended' : 'Reserve a Spot'
  const actionClass = 'inline-flex min-h-11 items-center justify-center rounded-control bg-primary px-5 font-semibold text-primary-ink hover:bg-primary-hover'
  const action = isPending ? <LoadingState /> : error ? <ErrorState message="Unable to check your session." onRetry={() => void refetch()} /> : registered ? <Link className={actionClass} to={`/reservations/${active!.id}`}>View My Reservation</Link> : existing && existing !== '/events' ? <Link className={actionClass} to={existing}>View My Reservation</Link> : uncertain ? <Link className={actionClass} to="/reservations">Check My Reservations</Link> : event.availability !== 'AVAILABLE' ? <Button disabled>{label}</Button> : !session ? <Link className={actionClass} to={authPath('/login', returnTo)}>Log in to reserve</Link> : !session.user.emailVerified ? <Link className={actionClass} to={authPath('/verify-email', returnTo)}>Verify email to reserve</Link> : reservations.isError ? <ErrorState message="Unable to check your reservations." onRetry={() => void reservations.refetch()} /> : <Button disabled={!canReserve} onClick={() => setConfirming(true)}>{booking.isPending ? 'Reserving…' : reservations.isPending ? 'Checking reservations…' : 'Reserve a Spot'}</Button>
  return <>
    <aside aria-label="Reserve a place" className="fixed inset-x-0 bottom-0 z-20 border-0 border-t border-solid border-line bg-surface p-4 pb-[max(16px,env(safe-area-inset-bottom))] desktop:sticky desktop:top-6 desktop:z-auto desktop:self-start desktop:rounded-control desktop:border desktop:p-6">
      <div className="hidden flex-col items-start gap-5 desktop:flex">
        <Status status={registered && !['CANCELLED','ENDED'].includes(event.availability) ? 'REGISTERED' : event.availability} />
        <p className="text-[30px] leading-9 font-semibold">Free</p>
        <p className="text-muted">One place per attendee</p>
        <div className="flex w-full flex-col gap-2 border-0 border-y border-solid border-line py-4"><p className="font-medium">{formatWib(event.startsAt)}</p><p className="text-muted">In person · {event.venueName}</p></div>
        {lowCapacity(event, registered) && <p className="font-semibold text-warning">Only {event.remainingPlaces} spots left</p>}
        <div className="flex flex-col gap-2"><p className="text-[12px] text-muted">Registration closes</p><p>{formatWib(event.registrationClosesAt)}</p></div>
      </div>
      <div className="flex items-center gap-5 desktop:mt-5 desktop:block desktop:[&>*]:w-full">
        <div className="flex shrink-0 flex-col gap-1 desktop:hidden"><span className="text-[20px] font-semibold">Free</span><span className="text-[12px] text-muted">1 place · In person</span></div>
        <div className="flex min-w-0 flex-1 flex-col gap-2 [&>a]:w-full [&>button]:w-full">{action}</div>
      </div>
      {failure && <div className="mt-3 max-h-40 overflow-auto"><ErrorState message={uncertain ? 'Your booking result is unconfirmed. Check My Reservations before trying again.' : failure.message} />{failure instanceof ApiError && failure.status === 401 && <Link className="inline-block py-2 text-accent" to={authPath('/login', returnTo)}>Log in again</Link>}</div>}
      <p className="mt-5 hidden text-[13px] leading-5 text-muted desktop:block">{affectedByChange ? 'Your booking was affected by an event change. ' : ''}Cancel online before {formatWib(event.cancellationClosesAt)}. After that, contact the organizer.</p>
      <p className="mt-2 text-[12px] leading-[18px] text-muted desktop:mt-5">Availability is checked on confirmation. No place is held.</p>
    </aside>
    {confirming && <Dialog title="Confirm your reservation" busy={booking.isPending} onClose={() => setConfirming(false)}>
      <div className="flex flex-col gap-3"><h3 className="text-[20px] font-semibold">{event.title}</h3><p>{formatWib(event.startsAt)}</p><p className="text-muted">{event.venueName}<br />{event.venueAddress}</p></div>
      <p className="text-muted">Registration closes {formatWib(event.registrationClosesAt)}.</p>
      <p>Cancel online before {formatWib(event.cancellationClosesAt)}. At or within 24 hours before the workshop, contact the organizer.</p>
      <Alert>One free place. Opening this dialog does not hold a seat; confirmation depends on current availability.</Alert>
      <div className="flex flex-col-reverse gap-3 desktop:flex-row desktop:justify-end"><Button variant="secondary" disabled={booking.isPending} onClick={() => setConfirming(false)}>Go back</Button><Button disabled={!canReserve} onClick={() => { if (session && canReserve) booking.mutate({ eventId: event.id, userId: session.user.id }) }}>{booking.isPending ? 'Confirming…' : 'Confirm Reservation'}</Button></div>
    </Dialog>}
  </>
}
