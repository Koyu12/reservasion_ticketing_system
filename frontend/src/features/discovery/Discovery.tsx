import { useSearchParams } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { useReservations } from '../../components/workshops/useReservations'
import { Row } from '../../components/events/Row/Row'
import { RowSkeleton } from '../../components/events/Row/RowSkeleton'
import { Button } from '../../components/ui/Button/Button'
import { Empty } from '../../components/ui/Empty/Empty'
import type { EventSummary } from '../../components/events/types'
import { Filters } from './Filters/Filters'
import { NoEvents } from './NoEvents/NoEvents'
import { toWibInput } from '../../workshop-time'
import {
  discoveryEmptyState,
  filterDiscoveryEvents,
  getDiscoveryEvents,
  readDiscoveryFilters,
} from './data'
import type { DiscoveryFilters } from './data'

export function Discovery({
  events,
  now = new Date(),
}: { events?: readonly EventSummary[]; now?: Date } = {}) {
  const [params, setParams] = useSearchParams()
  const filters = readDiscoveryFilters(params)
  const { query: reservations } = useReservations(events === undefined)
  const query = useQuery({
    queryKey: ['public-events'],
    queryFn: ({ signal }) => getDiscoveryEvents(signal),
    enabled: events === undefined,
    retry: false,
  })
  const registered = new Set(reservations.data?.current.filter(item => item.status === 'CONFIRMED').map(item => item.eventId))
  const catalog = events ?? (query.data ?? []).map(event => ({ ...event, registered: registered.has(event.id) }))
  const upcoming = filterDiscoveryEvents(
    catalog,
    { q: '', from: '', to: '' },
    now,
  )
  const matching = filterDiscoveryEvents(upcoming, filters, now)
  const empty = discoveryEmptyState(upcoming.length, matching.length)
  const hasFilters = Boolean(filters.q.trim() || filters.from)
  const pending = events === undefined && query.isPending
  const failed = events === undefined && query.isError
  const emptyHeight =
    !pending && !failed && empty === 'no-upcoming'
      ? 'min-h-[836px] desktop:min-h-0'
      : !pending && !failed && empty === 'no-matches'
        ? 'min-h-[896px] desktop:min-h-0'
        : ''

  function updateFilters(values: Partial<DiscoveryFilters>) {
    setParams(
      (current) => {
        const next = new URLSearchParams(current)
        for (const [key, value] of Object.entries(values)) {
          if (value) next.set(key, value)
          else next.delete(key)
        }
        return next
      },
      { replace: true },
    )
  }

  return (
    <div className="event-discovery min-h-dvh bg-canvas font-sans text-[14px] leading-normal text-ink [color-scheme:dark]">
      <a
        className="fixed top-2 left-4 z-10 -translate-y-[200%] rounded-control bg-accent px-4 py-3 text-canvas focus:translate-y-0"
        href="#discovery-results"
      >
        Skip to events
      </a>
      <main
        className={`discovery-content mx-auto flex w-[calc(100%_-_32px)] flex-col gap-6 pt-8 pb-12 desktop:w-[min(1200px,calc(100%_-_64px))] desktop:gap-8 desktop:pt-12 desktop:pb-16 ${emptyHeight}`}
      >
        <div className="discovery-heading flex flex-col gap-6 desktop:gap-2.5">
          <h1 className="text-[28px] leading-9 font-bold desktop:text-[36px] desktop:leading-11">
            Discover workshops &amp; seminars
          </h1>
          <p className="hidden text-[16px] leading-6 text-muted desktop:block">
            Free, in-person workshops. Pick a date. Find your next place to
            learn.
          </p>
          <p className="text-[16px] leading-6 text-muted desktop:hidden">
            Free workshops. In person. Your next step.
          </p>
        </div>
        <Filters
          filters={filters}
          today={toWibInput(now.toISOString()).slice(0, 10)}
          onChange={updateFilters}
        />
        <section
          className="min-w-0"
          id="discovery-results"
          aria-label="Upcoming events"
          aria-busy={pending}
          tabIndex={-1}
        >
          <div className="discovery-results-summary mb-6 flex min-h-5 items-center justify-between gap-4 leading-5 desktop:mb-8">
            <p className="font-semibold" role="status" aria-live="polite">
              {pending
                ? 'Loading events…'
                : failed
                  ? 'Unable to load events'
                  : `${matching.length} ${hasFilters && empty !== 'no-upcoming' ? 'matching' : 'upcoming'} ${matching.length === 1 ? 'event' : 'events'}`}
            </p>
            {!empty && (
              <p className="text-[13px] leading-[19px] text-muted desktop:text-[14px] desktop:leading-5">
                Soonest first
              </p>
            )}
          </div>
          {failed ? (
            <Empty
              title="Unable to load events"
              description="Please try again."
            >
              <Button onClick={() => void query.refetch()}>Try again</Button>
            </Empty>
          ) : pending ? (
            <div aria-hidden="true">
              <RowSkeleton />
              <RowSkeleton />
              <RowSkeleton />
              <RowSkeleton />
            </div>
          ) : empty ? (
            <NoEvents
              state={empty}
              filters={filters}
              onChange={updateFilters}
            />
          ) : (
            <ul className="m-0 list-none p-0">
              {matching.map((event) => (
                <li key={event.id}>
                  <Row
                    event={event}
                    to={`/events/${event.id}`}
                    state={{ workshopSearch: params.toString() }}
                  />
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </div>
  )
}
