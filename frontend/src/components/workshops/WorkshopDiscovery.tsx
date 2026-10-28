import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { ApiError } from '../../api'
import { formatWib } from '../../workshop-time'
import { ErrorState, LoadingState } from '../RequestState'
import { availabilityLabels, publicEventRequest } from './public-workshops'
import type { PublicWorkshopList } from './public-workshops'
import './workshops.css'

function WorkshopFilters({
  initialSearch,
  initialFrom,
  initialTo,
  onApply,
  onClear,
}: {
  initialSearch: string
  initialFrom: string
  initialTo: string
  onApply: (values: URLSearchParams) => void
  onClear: () => void
}) {
  const [search, setSearch] = useState(initialSearch)
  const [from, setFrom] = useState(initialFrom)
  const [to, setTo] = useState(initialTo)

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const params = new URLSearchParams()
    if (search.trim()) params.set('q', search.trim())
    if (from) params.set('from', from)
    if (to) params.set('to', to)
    onApply(params)
  }

  return (
    <form className="discovery-filters" onSubmit={submit}>
      <div>
        <label htmlFor="workshop-search">Search workshop titles</label>
        <input
          id="workshop-search"
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>
      <div>
        <label htmlFor="workshop-from">From (WIB)</label>
        <input
          id="workshop-from"
          type="date"
          min="0001-01-01"
          max={to || '9999-12-31'}
          value={from}
          onChange={(e) => setFrom(e.target.value)}
          aria-describedby="workshop-date-help"
        />
        <span id="workshop-date-help">
          Filter workshop start dates in Jakarta.
        </span>
      </div>
      <div>
        <label htmlFor="workshop-to">To (WIB)</label>
        <input
          id="workshop-to"
          type="date"
          min={from || '0001-01-01'}
          max="9999-12-31"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          aria-describedby="workshop-to-help"
        />
        <span id="workshop-to-help">Includes the entire selected day.</span>
      </div>
      <div className="discovery-actions">
        <button type="submit">Apply filters</button>
        <button
          type="button"
          onClick={() => {
            setSearch('')
            setFrom('')
            setTo('')
            onClear()
          }}
        >
          Clear filters
        </button>
      </div>
    </form>
  )
}

export function WorkshopDiscovery() {
  const [params, setParams] = useSearchParams()
  const search = params.toString()
  const query = useQuery({
    queryKey: ['public-events', search],
    retry: false,
    queryFn: ({ signal }) =>
      publicEventRequest<PublicWorkshopList>(
        search ? `?${search}` : '',
        signal,
      ),
  })
  const hasFilters = Boolean(
    params.get('q')?.trim() || params.get('from') || params.get('to'),
  )
  const invalidFilters =
    query.error instanceof ApiError && query.error.status === 400

  return (
    <section className="public-workshops">
      <h1>Workshops</h1>
      <p>
        Find free, in-person workshops and seminars. All times are shown in WIB.
      </p>
      <WorkshopFilters
        key={search}
        initialSearch={params.get('q') ?? ''}
        initialFrom={params.get('from') ?? ''}
        initialTo={params.get('to') ?? ''}
        onApply={(values) => setParams(values)}
        onClear={() => setParams(new URLSearchParams())}
      />
      {query.isPending && <LoadingState />}
      {query.isError && (
        <div>
          {invalidFilters && <h2>Check your filters</h2>}
          <ErrorState
            message={
              query.data
                ? 'Unable to refresh workshops. Showing the last loaded results.'
                : query.error.message
            }
            onRetry={invalidFilters ? undefined : () => void query.refetch()}
          />
          {invalidFilters &&
            query.error instanceof ApiError &&
            query.error.fieldErrors.length > 0 && (
              <ul>
                {query.error.fieldErrors.map((issue, index) => (
                  <li key={index}>
                    {issue.field ? `${issue.field}: ` : ''}
                    {issue.message}
                  </li>
                ))}
              </ul>
            )}
        </div>
      )}
      {query.data && (
        <>
          <p role="status">
            {query.data.events.length}{' '}
            {query.data.events.length === 1 ? 'workshop' : 'workshops'} found
            {query.isFetching ? ' · Refreshing…' : ''}
          </p>
          {query.data.events.length === 0 ? (
            <p>
              {hasFilters
                ? 'No workshops match your filters. Try another title or date range.'
                : 'No upcoming workshops are published yet. Please check back later.'}
            </p>
          ) : (
            <ul className="discovery-list">
              {query.data.events.map((event) => (
                <li key={event.id}>
                  <div>
                    <h2>
                      <Link
                        to={`/events/${event.id}`}
                        state={{ workshopSearch: search }}
                      >
                        {event.title}
                      </Link>
                    </h2>
                    <p>
                      <time dateTime={event.startsAt}>
                        {formatWib(event.startsAt)}
                      </time>{' '}
                      –{' '}
                      <time dateTime={event.endsAt}>
                        {formatWib(event.endsAt)}
                      </time>
                    </p>
                    <p>{event.venueName}</p>
                    <p>
                      Registration closes{' '}
                      {formatWib(event.registrationClosesAt)}
                    </p>
                  </div>
                  <div className="discovery-capacity">
                    <p
                      className="workshop-availability"
                      data-state={event.availability}
                    >
                      {availabilityLabels[event.availability]}
                    </p>
                    <p>
                      {event.remainingPlaces} of {event.capacity} places
                      remaining
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <p>
            Questions? Contact{' '}
            <a href={`mailto:${query.data.organizerContactEmail}`}>
              {query.data.organizerContactEmail}
            </a>
            .
          </p>
        </>
      )}
    </section>
  )
}
