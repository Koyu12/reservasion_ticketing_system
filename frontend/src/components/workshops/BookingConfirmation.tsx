import { Link, Navigate, useNavigate, useParams } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { ApiError, apiRequest } from '../../api'
import { authClient } from '../../auth-client'
import { authPath } from '../../return-to'
import { formatEventDate } from '../../workshop-time'
import { ErrorState, LoadingState } from '../RequestState'
import { DateTile } from '../events/DateTile/DateTile'
import { ShareEvent } from '../events/ShareEvent/ShareEvent'
import type { ReservationDetailResponse } from './reservations'

export function BookingConfirmation() {
  const { id } = useParams()
  const navigate = useNavigate()
  const {
    data: session,
    isPending,
    error: sessionError,
    refetch,
  } = authClient.useSession()
  const query = useQuery({
    queryKey: ['reservation', session?.user.id, id],
    enabled: Boolean(session) && !isPending && !sessionError,
    retry: false,
    queryFn: async ({ signal }) => {
      const result = await apiRequest<ReservationDetailResponse>(
        `/reservations/${id}`,
        { signal },
      )
      if (!result)
        throw new Error('No reservation details were returned. Please try again.')
      return result
    },
  })
  const login = authPath('/login', `/reservations/${id}/confirmation`)

  if (isPending) return <LoadingState />
  if (sessionError)
    return (
      <ErrorState
        message="Unable to check your session."
        onRetry={() => void refetch()}
      />
    )
  if (!session) return <Navigate to={login} replace />
  if (query.isPending) return <LoadingState />
  if (query.error instanceof ApiError && query.error.status === 401)
    return (
      <section className="mx-auto flex w-[min(560px,calc(100%_-_32px))] flex-col gap-5 py-8 desktop:py-14">
        <p className="text-muted">Your session has expired. Sign in again to view your reservation.</p>
        <Link to={login} onClick={(event) => { event.preventDefault(); void refetch().then(() => navigate(login)).catch(() => undefined) }} className="inline-flex min-h-11 items-center text-accent underline-offset-4 hover:underline">Sign in again</Link>
      </section>
    )
  if (
    query.error instanceof ApiError &&
    [400, 404].includes(query.error.status)
  )
    return (
      <section className="mx-auto flex w-[min(560px,calc(100%_-_32px))] flex-col gap-5 py-8 desktop:py-14">
        <h1 className="text-[28px] leading-9 font-bold desktop:text-[36px] desktop:leading-11">Reservation not found</h1>
        <p className="text-muted">This reservation is unavailable for your account.</p>
        <Link to="/events" className="inline-flex min-h-11 items-center text-accent underline-offset-4 hover:underline">Browse workshops</Link>
      </section>
    )
  if (query.isError)
    return (
      <ErrorState
        message={query.error.message}
        onRetry={() => void query.refetch()}
      />
    )

  const { reservation } = query.data
  const { event } = reservation
  if (reservation.status !== 'CONFIRMED' || event.status === 'CANCELLED')
    return <Navigate to={`/reservations/${reservation.id}`} replace />

  const dateOptions = { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' } as const
  const timeOptions = { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' } as const
  const multipleDays = formatEventDate(event.startsAt, { dateStyle: 'short' }) !== formatEventDate(event.endsAt, { dateStyle: 'short' })

  return (
    <main className="mx-auto flex w-[min(560px,calc(100%_-_32px))] flex-col gap-6 pt-8 pb-10 desktop:pt-14 desktop:pb-16">
      <header className="flex flex-col items-center gap-3 text-center">
        <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-success" aria-hidden="true">
          <path d="m9 12 2 2 4-4" />
          <circle cx="12" cy="12" r="10" />
        </svg>
        <h1 className="text-[28px] leading-9 font-bold desktop:text-[36px] desktop:leading-11">You’re booked!</h1>
        <p className="text-[16px] leading-6 text-muted">Your place is confirmed.</p>
      </header>

      <section aria-label="Confirmed reservation" className="overflow-hidden rounded-control border border-solid border-line bg-surface">
        <div className="flex flex-col gap-1.5 border-0 border-b border-solid border-line px-6 py-4">
          <p className="text-[12px] leading-[15px] font-medium text-muted">Booking reference</p>
          <strong className="text-[18px] leading-6 font-semibold break-all">{reservation.bookingReference}</strong>
        </div>
        <div className="flex items-start gap-4 p-5 desktop:gap-5 desktop:p-6 [&_.discovery-date>span:last-child]:hidden">
          <div className="shrink-0"><DateTile dateTime={event.startsAt} /></div>
          <div className="flex min-w-0 flex-1 flex-col gap-2.5">
            <h2 className="text-[20px] leading-7 font-semibold wrap-break-word">{event.title}</h2>
            <p className="text-[14px] leading-[21px] font-medium">
              <time dateTime={event.startsAt}>{formatEventDate(event.startsAt, dateOptions)}</time>
              <br />
              <time dateTime={event.startsAt}>{formatEventDate(event.startsAt, timeOptions)}</time>
              {'–'}
              <time dateTime={event.endsAt}>{multipleDays && `${formatEventDate(event.endsAt, dateOptions)} · `}{formatEventDate(event.endsAt, timeOptions)}</time>
              {' WIB'}
            </p>
            <p className="text-[14px] leading-[21px] text-muted wrap-break-word">{event.venueName}</p>
          </div>
        </div>
      </section>

      <div className="flex flex-col gap-3 desktop:flex-row desktop:[&>button]:w-[168px] [&>button]:h-12">
        <Link to={`/reservations/${reservation.id}`} className="inline-flex min-h-12 flex-1 items-center justify-center rounded-control bg-primary px-[18px] text-[14px] font-semibold text-primary-ink no-underline hover:bg-primary-hover">View My Reservation</Link>
        <ShareEvent id={event.id} title={event.title} />
      </div>
      <p className="text-center text-[14px] leading-[21px] text-muted">Find your booking details and cancellation deadline in your reservation.</p>
      <Link to="/events" className="inline-flex min-h-11 items-center justify-center text-[14px] font-medium text-accent underline-offset-4 hover:underline">Explore more events</Link>
    </main>
  )
}
