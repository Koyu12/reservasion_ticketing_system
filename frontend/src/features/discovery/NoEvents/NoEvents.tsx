import { Button } from '../../../components/ui/Button/Button'
import { Empty } from '../../../components/ui/Empty/Empty'
import { formatFilterDate } from '../../../workshop-time'
import type { DiscoveryFilters } from '../data'

export function NoEvents({
  state,
  filters,
  onChange,
}: {
  state: 'no-upcoming' | 'no-matches'
  filters: DiscoveryFilters
  onChange: (values: Partial<DiscoveryFilters>) => void
}) {
  const noUpcoming = state === 'no-upcoming'
  const title = filters.q.trim()
  const dateRange =
    filters.from && filters.to
      ? filters.from === filters.to
        ? formatFilterDate(filters.from)
        : filters.from.slice(0, 7) === filters.to.slice(0, 7)
          ? `${Number(filters.from.slice(-2))}–${formatFilterDate(filters.to)}`
          : `${formatFilterDate(filters.from)}–${formatFilterDate(filters.to)}`
      : ''
  const range = dateRange ? ` between ${dateRange}` : ''
  const description = noUpcoming
    ? 'There are no upcoming workshops or seminars right now. New events will appear here when published.'
    : `No events match${title ? ` “${title}”` : ' your selected dates'}${range}. Try a different title${filters.from ? ' or clear your dates' : ''}.`
  return (
    <Empty
      data-state={state}
      className={noUpcoming ? '' : 'min-h-[340px] desktop:min-h-[240px]'}
      icon={noUpcoming ? 'calendar' : 'search-x'}
      title={
        noUpcoming
          ? 'Nothing on the calendar yet'
          : 'No events match your filters'
      }
      description={description}
    >
      {noUpcoming ? (
        <p className="m-0 text-[14px] leading-[17px] text-muted">
          Please check back later.
        </p>
      ) : (
        <div className="discovery-empty-actions flex flex-wrap items-center gap-4 pt-2">
          <Button onClick={() => onChange({ q: '', from: '', to: '' })}>
            Clear all filters
          </Button>
          {filters.from && (
            <Button
              variant="text"
              className="font-semibold!"
              onClick={() => onChange({ from: '', to: '' })}
            >
              Clear dates
            </Button>
          )}
        </div>
      )}
    </Empty>
  )
}
