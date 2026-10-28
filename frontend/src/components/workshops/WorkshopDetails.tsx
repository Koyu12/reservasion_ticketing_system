import { Link, useLocation, useParams } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { ApiError } from '../../api'
import { formatWib } from '../../workshop-time'
import { ErrorState, LoadingState } from '../RequestState'
import { availabilityLabels, publicEventRequest } from './public-workshops'
import type { PublicWorkshopDetail } from './public-workshops'
import './workshops.css'

export function WorkshopDetails() {
  const { id } = useParams()
  const location = useLocation()
  const state: unknown = location.state
  const search =
    state &&
    typeof state === 'object' &&
    'workshopSearch' in state &&
    typeof state.workshopSearch === 'string'
      ? state.workshopSearch
      : ''
  const query = useQuery({
    queryKey: ['public-event', id],
    retry: false,
    queryFn: ({ signal }) =>
      publicEventRequest<PublicWorkshopDetail>(`/${id}`, signal),
  })
  const missing =
    query.error instanceof ApiError && [400, 404].includes(query.error.status)
  const event = query.data?.event
  const email = query.data?.organizerContactEmail

  return (
    <article className="public-workshops">
      <Link to={search ? `/events?${search}` : '/events'}>
        Back to workshops
      </Link>
      {query.isPending && <LoadingState />}
      {query.isError &&
        (missing && !event ? (
          <>
            <h1>Workshop not found</h1>
            <p>This workshop is unavailable or the link is incorrect.</p>
          </>
        ) : (
          <ErrorState
            message={
              event
                ? 'Unable to refresh this workshop. Showing the last loaded details.'
                : query.error.message
            }
            onRetry={() => void query.refetch()}
          />
        ))}
      {event && (
        <>
          <h1>{event.title}</h1>
          <p
            className="workshop-availability"
            data-state={event.availability}
            role="status"
          >
            {availabilityLabels[event.availability]}
          </p>
          {event.availability === 'CANCELLED' && (
            <p>
              This workshop has been cancelled. Registration is unavailable.
              Contact the organizer with any questions.
            </p>
          )}
          <p>
            {event.remainingPlaces} of {event.capacity} places remaining.
            Availability may change.
          </p>
          <div className="workshop-description">{event.description}</div>
          <h2>Schedule and venue</h2>
          <dl className="workshop-facts">
            <div>
              <dt>Start</dt>
              <dd>
                <time dateTime={event.startsAt}>
                  {formatWib(event.startsAt)}
                </time>
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
              <dt>Standard cancellation deadline</dt>
              <dd>
                <time dateTime={event.cancellationClosesAt}>
                  {formatWib(event.cancellationClosesAt)}
                </time>
              </dd>
            </div>
          </dl>
          <h2>Cancellation policy</h2>
          <p>
            You may cancel online more than 24 hours before the workshop starts.
            At or after the standard cancellation deadline, contact the
            organizer to request cancellation.
          </p>
          <p>
            If a significant schedule or venue change affects your reservation,
            you may cancel before the revised start time, including within the
            usual 24-hour cutoff.
          </p>
          <p>
            For questions and late cancellation requests, email{' '}
            <a href={`mailto:${email}`}>{email}</a>.
          </p>
        </>
      )}
    </article>
  )
}
