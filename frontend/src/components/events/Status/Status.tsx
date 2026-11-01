import type { EventStatus } from '../types'

const labels = {
  AVAILABLE: 'Available',
  FULL: 'Fully Booked',
  REGISTRATION_CLOSED: 'Registration Closed',
  REGISTERED: 'Registered',
  STARTED: 'Workshop Started',
  ENDED: 'Workshop Ended',
  CANCELLED: 'Event Cancelled',
}
const colors = {
  AVAILABLE: 'text-success',
  FULL: 'text-warning',
  REGISTRATION_CLOSED: 'text-muted',
  REGISTERED: 'text-info',
  STARTED: 'text-muted',
  ENDED: 'text-muted',
  CANCELLED: 'text-error',
}

export function Status({ status }: { status: EventStatus }) {
  return (
    <span
      data-status={status}
      className={`rounded-status bg-elevated px-2.5 py-1.5 font-sans text-[12px] leading-4 font-semibold [font-optical-sizing:none] ${colors[status]}`}
    >
      {labels[status]}
    </span>
  )
}
