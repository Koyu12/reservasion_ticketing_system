import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiRequest } from '../../api'
import { authClient } from '../../auth-client'
import { formatWib } from '../../workshop-time'
import { ErrorState, LoadingState } from '../RequestState'
import './workshops.css'

type FailedEmail = {
  id: string
  type:
    | 'BOOKING_CONFIRMED'
    | 'RESERVATION_CANCELLED'
    | 'EVENT_CANCELLED'
    | 'EVENT_CHANGED'
  recipientEmail: string
  attemptCount: number
  retryCycleAttemptCount: number
  lastAttemptAt: string | null
  lastError: string
  updatedAt: string
  lastManualRetryAt: string | null
  lastManualRetryBy: { name: string } | null
  reservation: {
    bookingReference: string
    event: { id: string; title: string }
  }
}

const labels: Record<FailedEmail['type'], string> = {
  BOOKING_CONFIRMED: 'Booking confirmation',
  RESERVATION_CANCELLED: 'Reservation cancellation',
  EVENT_CANCELLED: 'Workshop cancellation',
  EVENT_CHANGED: 'Workshop update',
}

export function FailedEmails() {
  const { data: session } = authClient.useSession()
  const client = useQueryClient()
  const [notice, setNotice] = useState('')
  const resultRef = useRef<HTMLDivElement>(null)
  const query = useQuery({
    queryKey: ['failed-emails', session?.user.id],
    queryFn: async ({ signal }) => {
      const result = await apiRequest<{ jobs: FailedEmail[] }>(
        '/admin/notifications/failed',
        { signal },
      )
      if (!result) throw new Error('Unable to load failed emails. Try again.')
      return result
    },
    retry: false,
  })
  const retry = useMutation({
    mutationFn: async (id: string) => {
      const result = await apiRequest<{
        job: { id: string; status: 'PENDING' }
      }>(`/admin/notifications/${id}/retry`, {
        method: 'POST',
        body: JSON.stringify({}),
      })
      if (!result)
        throw new Error(
          'Unable to confirm the retry. Refresh the list before trying again.',
        )
      return result
    },
    onMutate: () => setNotice(''),
    onSuccess: () => setNotice('Email queued for another delivery attempt.'),
    onSettled: () => client.invalidateQueries({ queryKey: ['failed-emails'] }),
  })
  useEffect(() => {
    if (notice || retry.error) resultRef.current?.focus()
  }, [notice, retry.error])

  return (
    <section className="workshops">
      <header className="workshop-heading">
        <div>
          <h1>Failed emails</h1>
          <p>
            Review booking and workshop emails that need attention. Fix the
            reported problem before retrying.
          </p>
        </div>
        <Link to="/admin/events">Manage workshops</Link>
      </header>
      <p>
        A retry queues email delivery. It keeps the original booking and
        workshop action. Provider acceptance does not guarantee inbox delivery.
      </p>
      <div ref={resultRef} tabIndex={-1}>
        {notice && <p role="status">{notice}</p>}
        {retry.error && <ErrorState message={retry.error.message} />}
      </div>
      {query.isPending ? (
        <LoadingState />
      ) : query.isError ? (
        <ErrorState
          message={query.error.message}
          onRetry={() => void query.refetch()}
        />
      ) : query.data.jobs.length === 0 ? (
        <p>
          No failed emails. Pending and skipped messages are not listed here.
        </p>
      ) : (
        <ul className="workshop-list">
          {query.data.jobs.map((job) => (
            <li key={job.id}>
              <div>
                <h2>{labels[job.type]}</h2>
                <p>
                  <Link to={`/admin/events/${job.reservation.event.id}`}>
                    {job.reservation.event.title}
                  </Link>
                </p>
                <p>To: {job.recipientEmail}</p>
                <p>
                  Booking reference:{' '}
                  <strong>{job.reservation.bookingReference}</strong>
                </p>
                <p className="workshop-error">{job.lastError}</p>
                <p>
                  {job.attemptCount} total attempts ·{' '}
                  {job.retryCycleAttemptCount} in this retry cycle
                </p>
                <p>
                  {job.lastAttemptAt
                    ? `Last attempt: ${formatWib(job.lastAttemptAt)}`
                    : 'No provider attempt made.'}
                </p>
                <p>Last updated: {formatWib(job.updatedAt)}</p>
                {job.lastManualRetryAt && (
                  <p>
                    Last manual retry: {formatWib(job.lastManualRetryAt)} by{' '}
                    {job.lastManualRetryBy?.name}
                  </p>
                )}
              </div>
              <button
                type="button"
                disabled={retry.isPending}
                onClick={() => retry.mutate(job.id)}
                aria-label={`Retry ${labels[job.type].toLowerCase()} for ${job.reservation.bookingReference}`}
              >
                {retry.isPending && retry.variables === job.id
                  ? 'Queuing…'
                  : 'Retry email'}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
