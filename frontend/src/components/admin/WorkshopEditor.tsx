import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ApiError } from '../../api'
import { ErrorState, LoadingState } from '../RequestState'
import { eventRequest } from './events'
import { WorkshopCancellation } from './WorkshopCancellation'
import { formatWib, fromWibInput, toWibInput } from '../../workshop-time'
import type {
  Workshop,
  WorkshopDetail,
  WorkshopFields,
  WorkshopList,
} from './events'
import './workshops.css'

const fields = [
  { name: 'title', label: 'Workshop title', type: 'text' },
  { name: 'description', label: 'Description', type: 'textarea' },
  { name: 'venueName', label: 'Venue name', type: 'text' },
  { name: 'venueAddress', label: 'Venue address', type: 'textarea' },
  { name: 'startsAt', label: 'Start (WIB)', type: 'datetime-local' },
  { name: 'endsAt', label: 'End (WIB)', type: 'datetime-local' },
  {
    name: 'registrationClosesAt',
    label: 'Registration deadline (WIB)',
    type: 'datetime-local',
  },
  { name: 'capacity', label: 'Capacity', type: 'number' },
] as const
const significantFields = ['startsAt', 'endsAt', 'venueName', 'venueAddress']

function initialValues(event?: Workshop) {
  return {
    title: event?.title ?? '',
    description: event?.description ?? '',
    venueName: event?.venueName ?? '',
    venueAddress: event?.venueAddress ?? '',
    startsAt: event ? toWibInput(event.startsAt) : '',
    endsAt: event ? toWibInput(event.endsAt) : '',
    registrationClosesAt: event ? toWibInput(event.registrationClosesAt) : '',
    capacity: event ? String(event.capacity) : '',
  }
}

function WorkshopForm({
  event,
  onSave,
  onPublish,
  pending,
  error,
}: {
  event?: Workshop
  onSave: (fields: Partial<WorkshopFields>) => void
  onPublish: () => void
  pending: boolean
  error: Error | null
}) {
  const initial = initialValues(event)
  const [values, setValues] = useState(initial)
  const [reason, setReason] = useState('')
  const [clock, setClock] = useState(Date.now)
  const errorRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const timer = window.setInterval(() => setClock(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [])
  useEffect(() => {
    if (error) errorRef.current?.focus()
  }, [error])
  const locked =
    event &&
    (event.status === 'CANCELLED' ||
      new Date(event.startsAt).getTime() <= clock)
  const dirty = fields.some(({ name }) => values[name] !== initial[name])
  const significant =
    event &&
    fields.some(
      ({ name }) =>
        significantFields.includes(name) && values[name] !== initial[name],
    )
  const fieldErrors = error instanceof ApiError ? error.fieldErrors : []
  const publicationClosed =
    event && new Date(event.registrationClosesAt).getTime() <= clock

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const payload: Partial<WorkshopFields> = {}
    for (const { name, type } of fields) {
      if (event && values[name] === initial[name]) continue
      if (name === 'capacity') payload.capacity = Number(values.capacity)
      else
        payload[name] =
          type === 'datetime-local' ? fromWibInput(values[name]) : values[name]
    }
    if (significant) payload.reason = reason
    onSave(payload)
  }

  return (
    <form onSubmit={submit}>
      {locked && (
        <p>
          This workshop is read-only because it has started or was cancelled.
        </p>
      )}
      {event?.status === 'PUBLISHED' && !locked && (
        <p>
          Schedule and venue changes keep existing bookings and queue a notice
          for each confirmed attendee. Changes require a reason and must be
          saved before the current start time.
        </p>
      )}
      {error && (
        <div
          ref={errorRef}
          tabIndex={-1}
          role="alert"
          className="workshop-error"
        >
          <p>{error.message}</p>
          {fieldErrors.length > 0 && (
            <ul>
              {fieldErrors.map((issue, index) => (
                <li key={index}>
                  {fields.some(({ name }) => name === issue.field) ||
                  issue.field === 'reason' ? (
                    <a href={`#workshop-${issue.field}`}>{issue.message}</a>
                  ) : (
                    issue.message
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      <fieldset disabled={pending || Boolean(locked)}>
        <legend>Workshop details</legend>
        <p>
          All fields are required. Times use WIB (Asia/Jakarta), regardless of
          your device timezone.
        </p>
        <div className="workshop-fields">
          {fields.map(({ name, label, type }) => {
            const issue = fieldErrors.find((item) => item.field === name)
            const common = {
              id: `workshop-${name}`,
              name,
              value: values[name],
              required: true,
              'aria-invalid': Boolean(issue),
              'aria-describedby': issue ? `error-${name}` : undefined,
              onChange: (
                e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
              ) => setValues({ ...values, [name]: e.target.value }),
            }
            return (
              <div
                key={name}
                className={type === 'textarea' ? 'workshop-wide' : undefined}
              >
                <label htmlFor={common.id}>{label}</label>
                {type === 'textarea' ? (
                  <textarea {...common} rows={name === 'description' ? 5 : 2} />
                ) : (
                  <input
                    {...common}
                    type={type}
                    min={type === 'number' ? 1 : undefined}
                    max={type === 'number' ? 2147483647 : undefined}
                    step={
                      type === 'datetime-local'
                        ? '0.001'
                        : type === 'number'
                          ? 1
                          : undefined
                    }
                  />
                )}
                {issue && (
                  <p id={`error-${name}`} className="workshop-error">
                    {issue.message}
                  </p>
                )}
              </div>
            )
          })}
        </div>
        {significant && (
          <div className="workshop-reason">
            <label htmlFor="workshop-reason">
              Reason for schedule or venue change
            </label>
            <textarea
              id="workshop-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              required
              rows={3}
              aria-invalid={fieldErrors.some(
                (issue) => issue.field === 'reason',
              )}
            />
            {event?.status === 'PUBLISHED' && (
              <p>
                Saving this change queues attendee notices. Affected attendees
                may cancel before the revised start time.
              </p>
            )}
          </div>
        )}
        <div className="workshop-actions">
          <button type="submit" disabled={Boolean(event) && !dirty}>
            {pending
              ? 'Saving…'
              : !event || event.status === 'DRAFT'
                ? 'Save draft'
                : significant
                  ? 'Save change and queue notices'
                  : 'Save changes'}
          </button>
          {event?.status === 'DRAFT' && (
            <button
              type="button"
              onClick={onPublish}
              disabled={dirty || publicationClosed}
            >
              Publish workshop
            </button>
          )}
        </div>
        {event?.status === 'DRAFT' &&
          (dirty ? (
            <p>Save changes before publishing.</p>
          ) : publicationClosed ? (
            <p>
              Update the registration deadline before publishing. Registration
              must still be open.
            </p>
          ) : (
            <p>
              Publishing makes this workshop available for public discovery.
            </p>
          ))}
      </fieldset>
    </form>
  )
}

export function WorkshopEditor() {
  const { id } = useParams()
  const navigate = useNavigate()
  const client = useQueryClient()
  const [notice, setNotice] = useState('')
  const detail = useQuery({
    queryKey: ['admin-event', id],
    enabled: Boolean(id),
    retry: false,
    queryFn: ({ signal }) => eventRequest<WorkshopDetail>(`/${id}`, { signal }),
  })
  const list = useQuery({
    queryKey: ['admin-events'],
    enabled: !id,
    retry: false,
    queryFn: ({ signal }) => eventRequest<WorkshopList>('', { signal }),
  })
  const save = useMutation({
    mutationFn: (input: Partial<WorkshopFields>) =>
      eventRequest<WorkshopDetail>(id ? `/${id}` : '', {
        method: id ? 'PATCH' : 'POST',
        body: JSON.stringify(input),
      }),
    onMutate: () => {
      setNotice('')
      publish.reset()
      cancellation.reset()
    },
    onSuccess: async (data) => {
      client.setQueryData(['admin-event', data.event.id], data)
      await client.invalidateQueries({ queryKey: ['admin-events'] })
      await Promise.all([
        client.invalidateQueries({ queryKey: ['public-event', data.event.id] }),
        client.invalidateQueries({ queryKey: ['public-events'] }),
        client.invalidateQueries({ queryKey: ['admin-attendees'] }),
        client.invalidateQueries({ queryKey: ['reservation'] }),
        client.invalidateQueries({ queryKey: ['reservations'] }),
      ])
      setNotice('Workshop saved.')
      if (!id)
        void navigate(`/admin/events/${data.event.id}`, { replace: true })
    },
  })
  const publish = useMutation({
    mutationFn: () =>
      eventRequest<WorkshopDetail>(`/${id}/publish`, {
        method: 'POST',
        body: '{}',
      }),
    onMutate: () => {
      setNotice('')
      save.reset()
      cancellation.reset()
    },
    onSuccess: async (data) => {
      client.setQueryData(['admin-event', id], data)
      await client.invalidateQueries({ queryKey: ['admin-events'] })
      setNotice('Workshop published.')
    },
  })
  const cancellation = useMutation({
    mutationFn: (reason: string) =>
      eventRequest<WorkshopDetail>(`/${id}/cancel`, {
        method: 'POST',
        body: JSON.stringify({ reason }),
      }),
    onMutate: () => {
      setNotice('')
      save.reset()
      publish.reset()
    },
    onSuccess: (data) => {
      client.setQueryData(['admin-event', data.event.id], data)
      setNotice(
        'Workshop cancelled. Cancellation notices have been queued for affected bookings.',
      )
    },
    onSettled: async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: ['admin-event', id] }),
        client.invalidateQueries({ queryKey: ['admin-events'] }),
        client.invalidateQueries({ queryKey: ['admin-attendees'] }),
        client.invalidateQueries({ queryKey: ['public-event', id] }),
        client.invalidateQueries({ queryKey: ['public-events'] }),
        client.invalidateQueries({ queryKey: ['reservation'] }),
        client.invalidateQueries({ queryKey: ['reservations'] }),
      ])
    },
  })
  const query = id ? detail : list
  if (query.isPending) return <LoadingState />
  if (query.isError)
    return (
      <ErrorState
        message={query.error.message}
        onRetry={() => void query.refetch()}
      />
    )
  const event = detail.data?.event
  const contact = id
    ? detail.data?.organizerContactEmail
    : list.data?.organizerContactEmail

  return (
    <section className="workshops">
      <Link to="/admin/events">Back to workshops</Link>
      <h1>{event ? event.title : 'Create workshop'}</h1>
      {event && (
        <Link to={`/admin/events/${event.id}/attendees`}>
          View attendees and cancellations
        </Link>
      )}
      {event && (
        <p>
          {event.status === 'DRAFT'
            ? 'Draft'
            : event.status === 'PUBLISHED'
              ? 'Published'
              : 'Cancelled'}{' '}
          · {event.confirmedCount} / {event.capacity} confirmed ·{' '}
          {formatWib(event.startsAt)}
        </p>
      )}
      <p>
        Organizer contact: <a href={`mailto:${contact}`}>{contact}</a>
      </p>
      {notice && <p role="status">{notice}</p>}
      {event && (
        <WorkshopCancellation
          key={event.id}
          event={event}
          pending={
            save.isPending || publish.isPending || cancellation.isPending
          }
          error={cancellation.error}
          onCancel={(reason) => cancellation.mutate(reason)}
        />
      )}
      <WorkshopForm
        key={`${id ?? 'new'}-${event?.updatedAt ?? ''}`}
        event={event}
        onSave={(input) => save.mutate(input)}
        onPublish={() => publish.mutate()}
        pending={save.isPending || publish.isPending || cancellation.isPending}
        error={save.error ?? publish.error}
      />
    </section>
  )
}
