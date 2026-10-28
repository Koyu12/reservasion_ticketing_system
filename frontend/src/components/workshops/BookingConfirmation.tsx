import { Link, Navigate, useParams } from 'react-router'
import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ApiError, apiRequest } from '../../api'
import { authClient } from '../../auth-client'
import { authPath } from '../../return-to'
import { formatWib } from '../../workshop-time'
import { ErrorState, LoadingState } from '../RequestState'
import './workshops.css'
import type {
  ReservationDetails,
  ReservationDetailResponse,
} from './reservations'

export function BookingConfirmation() {
  const { id } = useParams()
  const [viewedAt] = useState(Date.now)
  const {
    data: session,
    isPending,
    error: sessionError,
    refetch,
  } = authClient.useSession()
  const query = useQuery({
    queryKey: ['reservation', session?.user.id, id],
    enabled: Boolean(session) && !isPending && !sessionError,
    retry: false,
    queryFn: async ({ signal }) => {
      const result = await apiRequest<ReservationDetailResponse>(
        `/reservations/${id}`,
        {
          signal,
        },
      )
      if (!result)
        throw new Error(
          'No reservation details were returned. Please try again.',
        )
      return result
    },
  })
  const login = authPath('/login', `/reservations/${id}/confirmation`)
  if (isPending) return <LoadingState />
  if (sessionError)
    return (
      <ErrorState
        message="Unable to check your session."
        onRetry={() => void refetch()}
      />
    )
  if (!session) return <Navigate to={login} replace />
  if (query.isPending) return <LoadingState />
  if (query.error instanceof ApiError && query.error.status === 401)
    return (
      <div>
        <p>Your session has expired. Sign in again to view your reservation.</p>
        <button type="button" onClick={() => void refetch()}>
          Sign in again
        </button>
      </div>
    )
  if (
    query.error instanceof ApiError &&
    [400, 404].includes(query.error.status)
  )
    return (
      <article className="public-workshops">
        <h1>Reservation not found</h1>
        <p>This reservation is unavailable for your account.</p>
        <Link to="/events">Browse workshops</Link>
      </article>
    )
  if (query.isError)
    return (
      <ErrorState
        message={query.error.message}
        onRetry={() => void query.refetch()}
      />
    )
  const { reservation, organizerContactEmail } = query.data
  const { event } = reservation
  const cancelled =
    reservation.status === 'CANCELLED' || event.status === 'CANCELLED'

  return (
    <article className="public-workshops booking-confirmation">
      <h1>
        {cancelled ? 'Your reservation is cancelled' : 'Your place is reserved'}
      </h1>
      <p>
        {cancelled
          ? 'This booking no longer reserves a place.'
          : 'Your booking is confirmed. Keep this reference for your records.'}
      </p>
      {reservation.cancelledAt && (
        <p role="status">
          Cancelled on{' '}
          <time dateTime={reservation.cancelledAt}>
            {formatWib(reservation.cancelledAt)}
          </time>
          .
        </p>
      )}
      <div className="booking-reference">
        <span>Booking reference</span>
        <strong>{reservation.bookingReference}</strong>
      </div>
      <h2>{event.title}</h2>
      {event.status === 'CANCELLED' && (
        <p role="status">This workshop has been cancelled.</p>
      )}
      {reservation.affectedByChange && (
        <p role="status">
          The schedule or venue has changed since you booked. The current
          details are shown below.
        </p>
      )}
      <dl className="workshop-facts">
        <div>
          <dt>Start</dt>
          <dd>
            <time dateTime={event.startsAt}>{formatWib(event.startsAt)}</time>
          </dd>
        </div>
        <div>
          <dt>End</dt>
          <dd>
            <time dateTime={event.endsAt}>{formatWib(event.endsAt)}</time>
          </dd>
        </div>
        <div>
          <dt>Venue</dt>
          <dd>{event.venueName}</dd>
        </div>
        <div>
          <dt>Address</dt>
          <dd className="workshop-description">{event.venueAddress}</dd>
        </div>
        <div>
          <dt>Registration deadline</dt>
          <dd>
            <time dateTime={event.registrationClosesAt}>
              {formatWib(event.registrationClosesAt)}
            </time>
          </dd>
        </div>
        <div>
          <dt>Cancellation deadline</dt>
          <dd>
            <time dateTime={reservation.cancellationClosesAt}>
              {formatWib(reservation.cancellationClosesAt)}
            </time>
          </dd>
        </div>
      </dl>
      <h2>
        {cancelled ? 'Questions about your booking?' : 'Before your workshop'}
      </h2>
      {!cancelled && (
        <p>
          {reservation.affectedByChange
            ? 'Because the schedule or venue changed after you booked, you may cancel before the revised start time.'
            : 'The standard cancellation policy allows cancellation more than 24 hours before the workshop starts.'}
        </p>
      )}
      {!cancelled && (
        <CancellationAction
          key={`${session.user.id}:${reservation.id}`}
          reservation={reservation}
          userId={session.user.id}
        />
      )}
      {reservation.status === 'CANCELLED' &&
        event.status === 'PUBLISHED' &&
        viewedAt < new Date(event.startsAt).getTime() && (
          <p>
            <Link to={`/events/${event.id}`}>
              Check availability and book again
            </Link>
            . A new booking receives a new reference and follows the current
            booking and cancellation rules.
          </p>
        )}
      <p>
        For questions or late cancellation requests, email{' '}
        <a href={`mailto:${organizerContactEmail}`}>{organizerContactEmail}</a>{' '}
        and include your booking reference.
      </p>
      <p>
        You can bookmark this page and return while signed in to this account.
      </p>
      <p>
        <Link to="/reservations">My reservations</Link>
        {' · '}
        <Link to={`/events/${event.id}`}>View workshop</Link>
        {' · '}
        <Link to="/events">Browse workshops</Link>
      </p>
    </article>
  )
}

function CancellationAction({
  reservation,
  userId,
}: {
  reservation: ReservationDetails
  userId: string
}) {
  const client = useQueryClient()
  const [confirming, setConfirming] = useState(false)
  const [now, setNow] = useState(Date.now)
  const deadline = new Date(reservation.cancellationClosesAt).getTime()
  useEffect(() => {
    if (now >= deadline) return
    const delay = Math.min(Math.max(deadline - Date.now(), 1), 2147483647)
    const timer = window.setTimeout(() => setNow(Date.now()), delay)
    return () => window.clearTimeout(timer)
  }, [deadline, now])

  const cancellation = useMutation({
    mutationFn: async () => {
      const result = await apiRequest<{
        reservation: Pick<ReservationDetails, 'id' | 'status' | 'cancelledAt'>
      }>(`/reservations/${reservation.id}/cancel`, {
        method: 'POST',
        body: JSON.stringify({}),
      })
      if (!result)
        throw new Error(
          'Unable to confirm cancellation. Check your reservation before trying again.',
        )
      return result
    },
    onSettled: async () => {
      setConfirming(false)
      await Promise.all([
        client.invalidateQueries({
          queryKey: ['reservation', userId, reservation.id],
        }),
        client.invalidateQueries({ queryKey: ['reservations', userId] }),
        client.invalidateQueries({
          queryKey: ['public-event', reservation.eventId],
        }),
        client.invalidateQueries({ queryKey: ['public-events'] }),
        client.invalidateQueries({
          queryKey: ['admin-event', reservation.eventId],
        }),
        client.invalidateQueries({ queryKey: ['admin-events'] }),
      ])
    },
  })
  const closed =
    now >= deadline ||
    (cancellation.error instanceof ApiError &&
      cancellation.error.code === 'CANCELLATION_CLOSED')

  return (
    <section aria-label="Cancel reservation">
      {cancellation.error && (
        <ErrorState message={cancellation.error.message} />
      )}
      {cancellation.error instanceof ApiError &&
        cancellation.error.status === 401 && (
          <p>
            <Link
              to={authPath(
                '/login',
                `/reservations/${reservation.id}/confirmation`,
              )}
            >
              Sign in again
            </Link>{' '}
            to manage your reservation.
          </p>
        )}
      {closed ? (
        <p>
          Self-service cancellation has closed. Contact the organizer below and
          include your booking reference.
        </p>
      ) : confirming ? (
        <>
          <p>
            Cancel this reservation? Your place will be released. Booking again
            depends on availability and the registration deadline.
          </p>
          <button
            type="button"
            disabled={cancellation.isPending}
            onClick={() => setConfirming(false)}
          >
            Keep reservation
          </button>{' '}
          <button
            type="button"
            disabled={cancellation.isPending}
            onClick={() => cancellation.mutate()}
          >
            Confirm cancellation
          </button>
        </>
      ) : (
        <button
          type="button"
          disabled={cancellation.isPending}
          onClick={() => setConfirming(true)}
        >
          Cancel reservation
        </button>
      )}
      {cancellation.isPending && (
        <p role="status">Cancelling your reservation. Please wait.</p>
      )}
    </section>
  )
}
