import { Link, useNavigate } from 'react-router'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ApiError, apiRequest } from '../../api'
import { authClient } from '../../auth-client'
import { authPath, safeReturnTo } from '../../return-to'
import { ErrorState, LoadingState } from '../RequestState'
import type { PublicWorkshop } from './public-workshops'

export function BookingAction({ event }: { event: PublicWorkshop }) {
  const { data: session, isPending, error, refetch } = authClient.useSession()
  const navigate = useNavigate()
  const client = useQueryClient()
  const returnTo = `/events/${event.id}`
  async function refreshAvailability() {
    await Promise.all([
      client.invalidateQueries({ queryKey: ['public-event', event.id] }),
      client.invalidateQueries({ queryKey: ['public-events'] }),
      client.invalidateQueries({ queryKey: ['admin-event', event.id] }),
      client.invalidateQueries({ queryKey: ['admin-events'] }),
    ])
  }
  const booking = useMutation({
    mutationFn: async ({ eventId }: { eventId: string; userId: string }) => {
      const result = await apiRequest<{ reservation: { id: string } }>(
        '/reservations',
        {
          method: 'POST',
          body: JSON.stringify({ eventId }),
        },
      )
      if (!result)
        throw new Error(
          'No booking confirmation was returned. Try again to check your reservation.',
        )
      return result
    },
    onSuccess: (data, variables) => {
      void client.invalidateQueries({
        queryKey: ['reservations', variables.userId],
      })
      void refreshAvailability()
      void navigate(`/reservations/${data.reservation.id}/confirmation`)
    },
    onError: (failure) => {
      if (failure instanceof ApiError && failure.status === 409)
        void refreshAvailability()
      if (failure instanceof ApiError && [401, 403].includes(failure.status))
        void refetch()
    },
  })
  const failure =
    booking.variables?.userId === session?.user.id ? booking.error : null
  const existing =
    failure instanceof ApiError &&
    failure.code === 'ALREADY_RESERVED' &&
    failure.reservationId
      ? safeReturnTo(`/reservations/${failure.reservationId}/confirmation`)
      : null

  return (
    <section className="workshop-booking" aria-label="Reserve a place">
      <h2>Reserve your place</h2>
      <p>
        One free place per account. Review the cancellation policy above before
        booking.
      </p>
      {isPending ? (
        <LoadingState />
      ) : error ? (
        <ErrorState
          message="Unable to check your session."
          onRetry={() => void refetch()}
        />
      ) : !session ? (
        <p>
          <Link to={authPath('/login', returnTo)}>Sign in to reserve</Link> or{' '}
          <Link to={authPath('/register', returnTo)}>create an account</Link>.
        </p>
      ) : !session.user.emailVerified ? (
        <p>
          <Link to={authPath('/verify-email', returnTo)}>
            Verify your email
          </Link>{' '}
          before reserving a place.
        </p>
      ) : (
        <>
          {failure && <ErrorState message={failure.message} />}
          {existing && existing !== '/events' ? (
            <Link to={existing}>View your reservation</Link>
          ) : (
            <>
              {failure instanceof ApiError && failure.status === 401 && (
                <p>
                  <Link to={authPath('/login', returnTo)}>Sign in again</Link>{' '}
                  to reserve.
                </p>
              )}
              {failure instanceof ApiError &&
                failure.code === 'EMAIL_NOT_VERIFIED' && (
                  <p>
                    <Link to={authPath('/verify-email', returnTo)}>
                      Verify your email
                    </Link>{' '}
                    to reserve.
                  </p>
                )}
              <button
                type="button"
                disabled={
                  booking.isPending || event.availability !== 'AVAILABLE'
                }
                onClick={() =>
                  booking.mutate({ eventId: event.id, userId: session.user.id })
                }
              >
                {booking.isPending
                  ? 'Reserving your place…'
                  : 'Reserve a place'}
              </button>
              {booking.isPending && (
                <p role="status">Saving your reservation. Please wait.</p>
              )}
              {event.availability !== 'AVAILABLE' && (
                <p>New reservations are unavailable for this workshop.</p>
              )}
            </>
          )}
        </>
      )}
    </section>
  )
}
