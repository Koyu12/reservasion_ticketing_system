import { useId, useState } from 'react'
import { Button } from '../../../components/ui/Button/Button'
import { Calendar } from '../../../components/ui/Calendar/Calendar'
import { Icon } from '../../../components/ui/Icon/Icon'
import { Search } from '../../../components/ui/Search/Search'
import { formatFilterDate } from '../../../workshop-time'
import type { DiscoveryFilters } from '../data'

export function Filters({
  filters,
  today,
  onChange,
}: {
  filters: DiscoveryFilters
  today?: string
  onChange: (values: Partial<DiscoveryFilters>) => void
}) {
  const id = useId()
  const [calendar, setCalendar] = useState<'from' | 'to' | null>(null)
  const helpId = `${id}-timezone`
  return (
    <form
      className="discovery-filter-form flex flex-col gap-3"
      role="search"
      aria-label="Find events"
      onSubmit={(event) => event.preventDefault()}
    >
      <div className="flex flex-col items-stretch gap-3 desktop:flex-row desktop:items-end desktop:gap-4">
        <div className="min-w-0 flex-1">
          <Search
            label="Search events"
            placeholder="Search by event title"
            value={filters.q}
            onChange={(event) => onChange({ q: event.target.value })}
          />
        </div>
        <div
          className="flex w-full gap-3 desktop:w-[360px]"
          role="group"
          aria-label="Event date range"
        >
          {(['from', 'to'] as const).map((endpoint) => (
            <div key={endpoint} className="min-w-0 flex-1">
              <span
                id={`${id}-${endpoint}-label`}
                className="mb-2 block text-[13px] leading-[19px] font-semibold"
              >
                {endpoint === 'from' ? 'From' : 'To'}
              </span>
              <button
                type="button"
                className="discovery-date-control flex h-12 w-full items-center gap-2.5 rounded-control border border-solid border-line bg-surface px-[14px] text-left text-[14px] whitespace-nowrap hover:border-muted narrow:gap-1.5 narrow:px-2.5 narrow:text-[12px]"
                aria-labelledby={`${id}-${endpoint}-label ${id}-${endpoint}-value`}
                aria-describedby={helpId}
                aria-haspopup="dialog"
                aria-expanded={calendar === endpoint}
                onClick={() => setCalendar(endpoint)}
              >
                <Icon name="calendar" className="text-muted" />
                <span
                  id={`${id}-${endpoint}-value`}
                  data-placeholder={!filters[endpoint] || undefined}
                  className="data-[placeholder]:text-muted"
                >
                  {filters[endpoint]
                    ? formatFilterDate(filters[endpoint])
                    : 'Select date'}
                </span>
              </button>
            </div>
          ))}
        </div>
        <Button
          variant="text"
          className="h-11 self-start desktop:h-12 desktop:self-auto"
          onClick={() => onChange({ q: '', from: '', to: '' })}
        >
          Clear all
        </Button>
      </div>
      <p id={helpId} className="text-[12px] leading-[17px] text-muted">
        Event times and date filters use WIB
        <span className="desktop:hidden">
          <br />
        </span>
        <span className="hidden desktop:inline"> </span>(Asia/Jakarta).
      </p>
      {calendar && (
        <Calendar
          from={filters.from}
          to={filters.to}
          endpoint={calendar}
          today={today}
          onApply={onChange}
          onDismiss={() => setCalendar(null)}
        />
      )}
    </form>
  )
}
