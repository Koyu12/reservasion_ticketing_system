import { useState } from 'react'
import { Link } from 'react-router'
import type { LinkProps } from 'react-router'
import type { EventSummary } from '../types'
import { DateTile } from '../DateTile/DateTile'
import { Status } from '../Status/Status'
import { formatEventDate } from '../../../workshop-time'

export function Row({
  event,
  to,
  state,
}: { event: EventSummary } & Pick<LinkProps, 'to' | 'state'>) {
  const [imageFailed, setImageFailed] = useState(false)
  const time = { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' } as const
  return (
    <Link
      to={to}
      state={state}
      className="discovery-event-row relative isolate grid grid-cols-[56px_minmax(0,1fr)] gap-4 rounded-control py-6 font-sans text-[14px] leading-normal text-ink no-underline [font-optical-sizing:none] before:pointer-events-none before:absolute before:inset-0 before:-z-1 before:rounded-[inherit] before:bg-ink/5 before:opacity-0 before:content-[''] after:absolute after:inset-x-0 after:bottom-0 after:h-px after:bg-line after:content-[''] hover:z-10 hover:scale-[1.02] hover:outline-1 hover:-outline-offset-1 hover:outline-accent hover:before:opacity-100 focus-visible:z-10 focus-visible:scale-[1.02] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent focus-visible:before:opacity-100 motion-safe:transition-transform motion-safe:duration-150 motion-safe:before:transition-opacity motion-safe:before:duration-150 desktop:grid-cols-[80px_minmax(0,1fr)_128px] desktop:gap-6"
    >
      <div
        aria-hidden="true"
        className="absolute inset-0 -z-10 overflow-hidden rounded-[inherit] bg-canvas after:absolute after:inset-0 after:bg-[linear-gradient(to_left,#11131699_0%,#111316e8_30%,var(--color-canvas)_55%,var(--color-canvas)_100%)] after:content-[''] desktop:after:bg-[linear-gradient(to_left,#11131633_0%,#11131680_18%,var(--color-canvas)_48%,var(--color-canvas)_100%)]"
      >
        {event.coverUrl && !imageFailed ? (
          <img
            src={event.coverUrl}
            alt=""
            onError={() => setImageFailed(true)}
            className="h-full w-full object-cover opacity-42 desktop:opacity-65"
          />
        ) : (
          <span className="discovery-cover-fallback absolute top-1/2 right-6 -translate-y-1/2 text-[20px] font-semibold text-muted">
            Workshop Collective
          </span>
        )}
      </div>
      <DateTile dateTime={event.startsAt} />
      <div className="flex min-w-0 flex-col items-start gap-2.5">
        <h2 className="m-0 text-[20px] leading-7 font-semibold wrap-break-word desktop:text-[24px] desktop:leading-8">
          {event.title}
        </h2>
        <p className="m-0 text-[14px] leading-5 font-medium">
          {formatEventDate(event.startsAt, { weekday: 'short' })} ·{' '}
          {formatEventDate(event.startsAt, time)}–
          {formatEventDate(event.endsAt, time)} WIB
        </p>
        <p className="m-0 text-[14px] leading-5 text-muted">
          {event.venueName}
        </p>
        <Status status={event.registered ? 'REGISTERED' : event.availability} />
      </div>
    </Link>
  )
}
