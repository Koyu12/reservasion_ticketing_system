import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ApiError, apiRequest } from '../../api'
import { authClient } from '../../auth-client'
import { formatWib } from '../../workshop-time'
import { ErrorState, LoadingState } from '../RequestState'
import { eventRequest } from './events'
import type { AdminReservation, AttendeeList } from './events'
import './workshops.css'

export function WorkshopAttendees() {
  const { id } = useParams()
  const { data: session } = authClient.useSession()
  const client = useQueryClient()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [reason, setReason] = useState('')
  const [notice, setNotice] = useState('')
  const reasonRef = useRef<HTMLTextAreaElement>(null)
  const resultRef = useRef<HTMLDivElement>(null)
  const query = useQuery({
    queryKey: ['admin-attendees', session?.user.id, id],
    queryFn: ({ signal }) =>
      eventRequest<AttendeeList>(`/${id}/reservations`, { signal }),
    retry: false,
  })
  const cancellation = useMutation({
    mutationFn: async ({
      reservationId,
      reason,
    }: {
      reservationId: string
      reason: string
    }) => {
      const result = await apiRequest<{
        reservation: Pick<
          AdminReservation,
          'id' | 'bookingReference' | 'status'
        >
      }>(`/admin/reservations/${reservationId}/cancel`, {
        method: 'POST',
        body: JSON.stringify({ reason }),
      })
      if (!result)
        throw new Error(
          'Unable to confirm cancellation. Refresh the attendee list before trying again.',
        )
      return result
    },
    onSuccess: (data) => {
      setSelectedId(null)
      setReason('')
      setNotice(
        `Reservation ${data.reservation.bookingReference} is cancelled. Its cancellation notice is queued.`,
      )
    },
    onSettled: async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: ['admin-attendees'] }),
        client.invalidateQueries({ queryKey: ['admin-event', id] }),
        client.invalidateQueries({ queryKey: ['admin-events'] }),
        client.invalidateQueries({ queryKey: ['public-event', id] }),
        client.invalidateQueries({ queryKey: ['public-events'] }),
        client.invalidateQueries({ queryKey: ['reservation'] }),
        client.invalidateQueries({ queryKey: ['reservations'] }),
      ])
    },
  })
  useEffect(() => {
    if (selectedId) reasonRef.current?.focus()
  }, [selectedId])
  useEffect(() => {
    if (notice || cancellation.error) resultRef.current?.focus()
  }, [notice, cancellation.error])

  if (query.isPending) return <LoadingState />
  if (query.isError)
    return (
      <ErrorState
        message={query.error.message}
        onRetry={() => void query.refetch()}
      />
    )
  const { event, confirmedCount, confirmed, cancelled } = query.data
  const reasonError =
    cancellation.error instanceof ApiError
      ? cancellation.error.fieldErrors.find((issue) => issue.field === 'reason')
          ?.message
      : undefined

  return (
    <section className="workshops">
      <Link to={`/admin/events/${id}`}>Back to workshop</Link>
      <h1>Attendees: {event.title}</h1>
      <p>
        {formatWib(event.startsAt)} ·{' '}
        {event.status === 'CANCELLED'
          ? 'Cancelled workshop'
          : `${confirmedCount} / ${event.capacity} confirmed`}
      </p>
      <div ref={resultRef} tabIndex={-1}>
        {notice && <p role="status">{notice}</p>}
        {cancellation.error && (
          <ErrorState message={cancellation.error.message} />
        )}
      </div>
      <h2>Confirmed reservations ({confirmedCount})</h2>
      {confirmed.length === 0 ? (
        <p>No confirmed reservations for this workshop.</p>
      ) : (
        <ul className="workshop-list attendee-list">
          {confirmed.map((row) => (
            <li key={row.id}>
              <AttendeeDetails reservation={row} />
              {selectedId === row.id ? (
                <form
                  className="attendee-cancellation"
                  onSubmit={(e) => {
                    e.preventDefault()
                    if (!cancellation.isPending)
                      cancellation.mutate({ reservationId: row.id, reason })
                  }}
                >
                  <fieldset disabled={cancellation.isPending}>
                    <legend>Cancel reservation {row.bookingReference}</legend>
                    <p>
                      This releases {row.attendee.name}&apos;s place and queues
                      a cancellation notice. Booking again depends on
                      availability and the registration deadline.
                    </p>
                    <label htmlFor={`reason-${row.id}`}>
                      Cancellation reason
                    </label>
                    <textarea
                      ref={reasonRef}
                      id={`reason-${row.id}`}
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      required
                      rows={3}
                      aria-invalid={Boolean(reasonError)}
                      aria-describedby={
                        reasonError ? `reason-error-${row.id}` : undefined
                      }
                    />
                    {reasonError && (
                      <p
                        id={`reason-error-${row.id}`}
                        className="workshop-error"
                      >
                        {reasonError}
                      </p>
                    )}
                    <div className="workshop-actions">
                      <button type="submit" disabled={!reason.trim()}>
                        {cancellation.isPending
                          ? 'Cancelling…'
                          : 'Confirm cancellation'}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedId(null)
                          cancellation.reset()
                        }}
                      >
                        Keep reservation
                      </button>
                    </div>
                  </fieldset>
                </form>
              ) : (
                <button
                  type="button"
                  disabled={cancellation.isPending}
                  onClick={() => {
                    setSelectedId(row.id)
                    setReason('')
                    setNotice('')
                    cancellation.reset()
                  }}
                  aria-label={`Cancel reservation ${row.bookingReference} for ${row.attendee.name}`}
                >
                  Cancel reservation
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      <h2>Cancelled reservations ({cancelled.length})</h2>
      {cancelled.length === 0 ? (
        <p>No cancelled reservations for this workshop.</p>
      ) : (
        <ul className="workshop-list attendee-list">
          {cancelled.map((row) => (
            <li key={row.id}>
              <AttendeeDetails reservation={row} />
              <div>
                <p>
                  Cancelled {row.cancelledAt ? formatWib(row.cancelledAt) : ''}
                </p>
                <p>
                  By {row.cancelledBy?.name ?? 'Unknown'} ({row.cancelledById})
                  ·{' '}
                  {row.cancellationSource === 'SELF_SERVICE'
                    ? 'Self-service'
                    : row.cancellationSource === 'ADMIN'
                      ? 'Admin'
                      : 'Workshop cancellation'}
                </p>
                {row.cancellationReason && (
                  <p className="attendee-reason">
                    Reason: {row.cancellationReason}
                  </p>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function AttendeeDetails({
  reservation: row,
}: {
  reservation: AdminReservation
}) {
  return (
    <div>
      <h3>{row.attendee.name}</h3>
      <p>
        <a href={`mailto:${row.attendee.email}`}>{row.attendee.email}</a>
      </p>
      <p>
        Booking reference: <strong>{row.bookingReference}</strong>
      </p>
      <p>Booked {formatWib(row.createdAt)}</p>
    </div>
  )
}
