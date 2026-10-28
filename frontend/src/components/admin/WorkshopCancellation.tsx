import { useEffect, useRef, useState } from 'react'
import { ApiError } from '../../api'
import { formatWib } from '../../workshop-time'
import type { Workshop } from './events'

export function WorkshopCancellation({
  event,
  pending,
  error,
  onCancel,
}: {
  event: Workshop
  pending: boolean
  error: Error | null
  onCancel: (reason: string) => void
}) {
  const [confirming, setConfirming] = useState(false)
  const [reason, setReason] = useState('')
  const [now, setNow] = useState(Date.now)
  const reasonRef = useRef<HTMLTextAreaElement>(null)
  const actionRef = useRef<HTMLButtonElement>(null)
  const wasConfirming = useRef(false)
  const errorRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (event.status !== 'PUBLISHED') return
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [event.status])
  useEffect(() => {
    if (confirming) {
      reasonRef.current?.focus()
      wasConfirming.current = true
    } else if (wasConfirming.current) actionRef.current?.focus()
  }, [confirming])
  useEffect(() => {
    if (error) errorRef.current?.focus()
  }, [error])
  if (event.status === 'DRAFT') return null
  if (event.status === 'CANCELLED')
    return (
      <section
        className="workshop-cancellation"
        aria-labelledby="workshop-cancel-heading"
      >
        <h2 id="workshop-cancel-heading">Workshop cancelled</h2>
        {event.cancelledAt && (
          <p>
            Cancelled on{' '}
            <time dateTime={event.cancelledAt}>
              {formatWib(event.cancelledAt)}
            </time>
            .
          </p>
        )}
        <p className="workshop-description">
          Reason: {event.cancellationReason}
        </p>
        <p>This workshop cannot be reopened.</p>
      </section>
    )
  const closed =
    now >= new Date(event.endsAt).getTime() ||
    (error instanceof ApiError && error.code === 'EVENT_ENDED')
  const reasonError =
    error instanceof ApiError
      ? error.fieldErrors.find((issue) => issue.field === 'reason')?.message
      : undefined
  return (
    <section
      className="workshop-cancellation"
      aria-labelledby="workshop-cancel-heading"
    >
      <h2 id="workshop-cancel-heading">Cancel workshop</h2>
      {error && (
        <div
          ref={errorRef}
          tabIndex={-1}
          role="alert"
          className="workshop-error"
        >
          <p>{error.message}</p>
        </div>
      )}
      {closed ? (
        <p>This workshop has ended. Whole-workshop cancellation is closed.</p>
      ) : confirming ? (
        <form
          onSubmit={(e) => {
            e.preventDefault()
            if (!pending) onCancel(reason)
          }}
        >
          <fieldset disabled={pending}>
            <legend>Confirm workshop cancellation</legend>
            <p>
              <strong>{event.title}</strong>
              <br />
              {formatWib(event.startsAt)} to {formatWib(event.endsAt)}
            </p>
            <p>
              {event.confirmedCount} confirmed reservations are currently
              affected. All confirmed reservations at the time of cancellation
              will be cancelled and their notices queued. Earlier cancellations
              keep their history.
            </p>
            <p>
              This workshop cannot be reopened. Unsaved workshop edits will not
              be applied.
            </p>
            <label htmlFor="workshop-cancellation-reason">
              Cancellation reason
            </label>
            <p id="workshop-cancellation-reason-help">
              Shown publicly and included in attendee cancellation emails.
            </p>
            <textarea
              ref={reasonRef}
              id="workshop-cancellation-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              required
              rows={3}
              aria-invalid={Boolean(reasonError)}
              aria-describedby={`workshop-cancellation-reason-help${reasonError ? ' workshop-cancellation-reason-error' : ''}`}
            />
            {reasonError && (
              <p
                id="workshop-cancellation-reason-error"
                className="workshop-error"
              >
                {reasonError}
              </p>
            )}
            <div className="workshop-actions">
              <button type="submit" disabled={!reason.trim()}>
                {pending
                  ? 'Cancelling workshop…'
                  : 'Confirm workshop cancellation'}
              </button>
              <button type="button" onClick={() => setConfirming(false)}>
                Keep workshop
              </button>
            </div>
          </fieldset>
        </form>
      ) : (
        <>
          <p>
            Cancel this workshop and all remaining confirmed reservations.
            Cancellation is available before the scheduled end, including during
            the session.
          </p>
          <button
            ref={actionRef}
            type="button"
            disabled={pending}
            onClick={() => setConfirming(true)}
          >
            Cancel workshop
          </button>
        </>
      )}
    </section>
  )
}
