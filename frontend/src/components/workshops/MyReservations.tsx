import { Link, Navigate } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { ApiError, apiRequest } from '../../api'
import { authClient } from '../../auth-client'
import { authPath } from '../../return-to'
import { formatWib } from '../../workshop-time'
import { ErrorState, LoadingState } from '../RequestState'
import type {
  ReservationDetails,
  ReservationListResponse,
} from './reservations'
import './workshops.css'

export function MyReservations() {
  const {
    data: session,
    isPending,
    error: sessionError,
    refetch,
  } = authClient.useSession()
  const query = useQuery({
    queryKey: ['reservations', session?.user.id],
    enabled: Boolean(session) && !isPending && !sessionError,
    retry: false,
    queryFn: async ({ signal }) => {
      const result = await apiRequest<ReservationListResponse>(
        '/reservations',
        { signal },
      )
      if (!result)
        throw new Error('No reservation data was returned. Please try again.')
      return result
    },
  })

  if (isPending) return <LoadingState />
  if (sessionError)
    return (
      <ErrorState
        message="Unable to check your session."
        onRetry={() => void refetch()}
      />
    )
  if (!session)
    return <Navigate to={authPath('/login', '/reservations')} replace />
  if (query.isPending) return <LoadingState />
  if (query.error instanceof ApiError && query.error.status === 401)
    return (
      <div>
        <p>
          Your session has expired. Sign in again to view your reservations.
        </p>
        <button type="button" onClick={() => void refetch()}>
          Sign in again
        </button>
      </div>
    )
  if (query.isError)
    return (
      <ErrorState
        message={query.error.message}
        onRetry={() => void query.refetch()}
      />
    )
  const { current, history, organizerContactEmail } = query.data

  return (
    <article className="public-workshops">
      <h1>My reservations</h1>
      <p>
        Your bookings and their current workshop details. All times are shown in
        WIB.
      </p>
      <section aria-labelledby="current-reservations">
        <h2 id="current-reservations">Current</h2>
        {current.length ? (
          <ReservationList reservations={current} current />
        ) : (
          <p>
            No current reservations. <Link to="/events">Browse workshops</Link>{' '}
            to find your next session.
          </p>
        )}
      </section>
      <section aria-labelledby="reservation-history">
        <h2 id="reservation-history">History</h2>
        {history.length ? (
          <ReservationList reservations={history} />
        ) : (
          <p>No past or cancelled reservations yet.</p>
        )}
      </section>
      <p>
        For questions or late cancellation requests, email{' '}
        <a href={`mailto:${organizerContactEmail}`}>{organizerContactEmail}</a>{' '}
        and include your booking reference.
      </p>
    </article>
  )
}

function ReservationList({
  reservations,
  current = false,
}: {
  reservations: ReservationDetails[]
  current?: boolean
}) {
  return (
    <ul className="reservation-list">
      {reservations.map((reservation) => {
        const { event } = reservation
        const status =
          event.status === 'CANCELLED'
            ? 'Workshop cancelled'
            : reservation.status === 'CANCELLED'
              ? 'Reservation cancelled'
              : current
                ? 'Confirmed'
                : 'Ended · Confirmed'
        return (
          <li key={reservation.id}>
            <h3>
              <Link to={`/reservations/${reservation.id}/confirmation`}>
                {event.title}
              </Link>
            </h3>
            <p className="workshop-availability">{status}</p>
            {event.status === 'CANCELLED' && (
              <p className="workshop-description">
                Workshop cancellation reason: {event.cancellationReason}
              </p>
            )}
            <p>
              <time dateTime={event.startsAt}>{formatWib(event.startsAt)}</time>{' '}
              to <time dateTime={event.endsAt}>{formatWib(event.endsAt)}</time>
            </p>
            <p>{event.venueName}</p>
            <p>
              Booking reference:{' '}
              <strong className="reservation-reference">
                {reservation.bookingReference}
              </strong>
            </p>
            {current && (
              <p>
                Cancellation deadline:{' '}
                <time dateTime={reservation.cancellationClosesAt}>
                  {formatWib(reservation.cancellationClosesAt)}
                </time>
                .
              </p>
            )}
            {reservation.affectedByChange && (
              <p>
                The schedule or venue has changed since you booked. These are
                the current details.{' '}
                {current &&
                  'You may request cancellation before the revised start time.'}
              </p>
            )}
            <Link to={`/reservations/${reservation.id}/confirmation`}>
              View reservation
            </Link>
          </li>
        )
      })}
    </ul>
  )
}
