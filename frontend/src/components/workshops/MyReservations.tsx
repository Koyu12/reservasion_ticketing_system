import { Link, Navigate, useLocation, useNavigate, useSearchParams } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { ApiError, apiRequest } from '../../api'
import { authClient } from '../../auth-client'
import { authPath } from '../../return-to'
import { formatEventDate } from '../../workshop-time'
import { ErrorState, LoadingState } from '../RequestState'
import { Alert } from '../ui/Alert/Alert'
import { Empty } from '../ui/Empty/Empty'
import type { ReservationDetails, ReservationListResponse } from './reservations'

export function MyReservations() {
  const { data: session, isPending, error: sessionError, refetch } = authClient.useSession()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const location = useLocation()
  const tab = params.get('tab') === 'history' ? 'history' : 'active'
  const navigationState: unknown = location.state
  const cancelled = Boolean(navigationState && typeof navigationState === 'object' && 'cancelled' in navigationState && navigationState.cancelled === true)
  const query = useQuery({
    queryKey: ['reservations', session?.user.id],
    enabled: Boolean(session) && !isPending && !sessionError,
    retry: false,
    queryFn: async ({ signal }) => {
      const result = await apiRequest<ReservationListResponse>('/reservations', { signal })
      if (!result) throw new Error('No reservation data was returned. Please try again.')
      return result
    },
  })

  if (isPending) return <LoadingState />
  if (sessionError) return <ErrorState message="Unable to check your session." onRetry={() => void refetch()} />
  if (!session) return <Navigate to={authPath('/login', '/reservations')} replace />
  if (query.isPending) return <LoadingState />
  if (query.error instanceof ApiError && query.error.status === 401) return <div className="mx-auto w-[calc(100%_-_32px)] max-w-[1200px] py-8"><Alert kind="error">Your session has expired. <Link className="underline underline-offset-4" to={authPath('/login', '/reservations')} onClick={(event) => { event.preventDefault(); void refetch().then(() => navigate(authPath('/login', '/reservations'))).catch(() => undefined) }}>Log in again</Link> to view your reservations.</Alert></div>
  if (query.isError) return <ErrorState message={query.error.message} onRetry={() => void query.refetch()} />
  const { current, history } = query.data
  const reservations = tab === 'active' ? current : history

  function selectTab(next: 'active' | 'history') {
    setParams((previous) => {
      const nextParams = new URLSearchParams(previous)
      if (next === 'history') nextParams.set('tab', 'history')
      else nextParams.delete('tab')
      return nextParams
    }, { replace: true })
  }

  return (
    <main className="mx-auto flex w-[calc(100%_-_32px)] max-w-[1200px] flex-col gap-6 pt-8 pb-12 desktop:w-[min(1200px,calc(100%_-_64px))] desktop:pt-12 desktop:pb-16">
      <header className="flex flex-col gap-3">
        <h1 className="text-[28px] leading-9 font-bold desktop:text-[36px] desktop:leading-11">My reservations</h1>
        <p className="text-[16px] leading-6 text-muted">Your places, plans and past reservations.</p>
      </header>
      {cancelled && <Alert kind="success">Your reservation has been cancelled. It remains in History.</Alert>}
      <div className="flex h-12 gap-7 border-0 border-b border-solid border-line" role="tablist" aria-label="Reservations" onKeyDown={(event) => {
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
        event.preventDefault()
        const next = event.key === 'Home' ? 'active' : event.key === 'End' ? 'history' : tab === 'active' ? 'history' : 'active'
        selectTab(next)
        event.currentTarget.querySelector<HTMLButtonElement>(`#reservations-${next}`)?.focus()
      }}>
        {(['active', 'history'] as const).map((value) => <button key={value} id={`reservations-${value}`} type="button" role="tab" aria-selected={tab === value} aria-controls="reservation-panel" tabIndex={tab === value ? 0 : -1} onClick={() => selectTab(value)} className={`relative min-h-11 border-0 bg-transparent p-0 text-[14px] ${tab === value ? "font-semibold text-accent after:absolute after:inset-x-0 after:bottom-0 after:h-[3px] after:bg-accent after:content-['']" : 'text-muted hover:text-ink'}`}>{value === 'active' ? 'Active' : 'History'}</button>)}
      </div>
      <section id="reservation-panel" role="tabpanel" aria-labelledby={`reservations-${tab}`} className="flex min-w-0 flex-col gap-6" tabIndex={0}>
        <p className="text-[14px] leading-[17px] font-semibold" role="status">{reservations.length} {tab === 'active' ? 'active' : 'past'} {reservations.length === 1 ? 'reservation' : 'reservations'}</p>
        {reservations.length ? <ul className="m-0 flex list-none flex-col gap-5 p-0">
          {reservations.map((reservation) => <ReservationCard key={reservation.id} reservation={reservation} current={tab === 'active'} />)}
        </ul> : <Empty icon="calendar" title={tab === 'active' ? 'No active reservations' : 'No reservation history yet'} description={tab === 'active' ? 'Your upcoming workshops will appear here after you reserve a place.' : 'Past and cancelled reservations will appear here.'}>
          <Link className="inline-flex min-h-11 items-center rounded-control bg-primary px-5 font-semibold text-primary-ink hover:bg-primary-hover" to="/events">Explore events</Link>
        </Empty>}
      </section>
    </main>
  )
}

function ReservationCard({ reservation, current }: { reservation: ReservationDetails; current: boolean }) {
  const { event } = reservation
  const cancelled = reservation.status === 'CANCELLED' || event.status === 'CANCELLED'
  const status = cancelled ? 'Cancelled' : current ? 'Confirmed' : 'Ended · Confirmed'
  const time = { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' } as const
  const date = { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' } as const
  const multiDay = formatEventDate(event.startsAt, { dateStyle: 'short' }) !== formatEventDate(event.endsAt, { dateStyle: 'short' })
  return (
    <li className="flex min-w-0 flex-col gap-3 rounded-control border border-solid border-line bg-surface p-5">
      <div className="flex flex-wrap items-start justify-between gap-3 desktop:flex-nowrap desktop:gap-6">
        <h2 className="min-w-0 text-[20px] leading-7 font-semibold wrap-break-word"><Link className="hover:text-accent" to={`/reservations/${reservation.id}`}>{event.title}</Link></h2>
        <span className={`shrink-0 rounded-status bg-elevated px-2.5 py-[5px] text-[12px] leading-[17px] font-semibold ${cancelled ? 'text-muted' : current ? 'text-success' : 'text-muted'}`}>{status}</span>
      </div>
      <p className="text-[14px] leading-[21px] font-medium"><time dateTime={event.startsAt}>{formatEventDate(event.startsAt, date)} · {formatEventDate(event.startsAt, time)}</time>–<time dateTime={event.endsAt}>{multiDay ? `${formatEventDate(event.endsAt, date)} · ` : ''}{formatEventDate(event.endsAt, time)} WIB</time></p>
      <p className="text-[14px] leading-[21px] text-muted">{event.venueName}</p>
      {reservation.affectedByChange && <p className="border-0 border-t border-solid border-line pt-3 text-[13px] leading-5">Schedule or venue updated. Current details are shown above.</p>}
      {event.status === 'CANCELLED' && <div className="rounded-sm bg-error/8 p-3 text-[13px] leading-5"><p className="font-semibold text-error">Event cancelled by the organizer</p><p className="mt-1 text-muted">{event.cancellationReason || 'This workshop will not take place.'}</p></div>}
      {cancelled && event.status !== 'CANCELLED' && <p className="text-[13px] leading-5 text-muted">This reservation has been cancelled.</p>}
      <Link className="inline-flex min-h-11 items-center self-start text-[14px] font-semibold text-accent hover:underline underline-offset-4" to={`/reservations/${reservation.id}`}>View reservation</Link>
    </li>
  )
}
