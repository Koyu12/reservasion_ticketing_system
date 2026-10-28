import { Link, Navigate, useParams } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { ApiError, apiRequest } from '../../api'
import { authClient } from '../../auth-client'
import { authPath } from '../../return-to'
import { formatWib } from '../../workshop-time'
import { ErrorState, LoadingState } from '../RequestState'
import './workshops.css'
import type { ReservationDetailResponse } from './reservations'

export function BookingConfirmation() {
  const { id } = useParams()
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
      <p>
        {reservation.affectedByChange
          ? 'Because the schedule or venue changed after you booked, you may request cancellation before the revised start time.'
          : 'The standard cancellation policy allows cancellation more than 24 hours before the workshop starts.'}
      </p>
      <p>
        For questions or cancellation requests, email{' '}
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
