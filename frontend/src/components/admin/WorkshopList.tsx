import { Link } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { ErrorState, LoadingState } from '../RequestState'
import { eventRequest } from './events'
import { formatWib } from '../../workshop-time'
import type { WorkshopList as WorkshopListData } from './events'
import './workshops.css'

export function WorkshopList() {
  const query = useQuery({
    queryKey: ['admin-events'],
    queryFn: ({ signal }) => eventRequest<WorkshopListData>('', { signal }),
    retry: false,
  })

  return (
    <section className="workshops">
      <header className="workshop-heading">
        <div>
          <h1>Manage workshops</h1>
          <p>Create drafts and publish workshops for registration.</p>
        </div>
        <Link to="/admin/events/new">Create workshop</Link>
      </header>
      {query.isPending ? (
        <LoadingState />
      ) : query.isError ? (
        <ErrorState
          message={query.error.message}
          onRetry={() => void query.refetch()}
        />
      ) : (
        <>
          <p>
            Organizer contact:{' '}
            <a href={`mailto:${query.data.organizerContactEmail}`}>
              {query.data.organizerContactEmail}
            </a>
          </p>
          {query.data.events.length === 0 ? (
            <p>No workshops yet. Create your first draft to get started.</p>
          ) : (
            <ul className="workshop-list">
              {query.data.events.map((event) => (
                <li key={event.id}>
                  <div>
                    <h2>
                      <Link to={`/admin/events/${event.id}`}>
                        {event.title}
                      </Link>
                    </h2>
                    <p>
                      {formatWib(event.startsAt)} · {event.venueName}
                    </p>
                  </div>
                  <div>
                    <p>
                      {event.status === 'DRAFT'
                        ? 'Draft'
                        : event.status === 'PUBLISHED'
                          ? 'Published'
                          : 'Cancelled'}
                    </p>
                    <p>
                      {event.confirmedCount} / {event.capacity} confirmed
                    </p>
                    <Link to={`/admin/events/${event.id}/attendees`}>
                      View attendees
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  )
}
