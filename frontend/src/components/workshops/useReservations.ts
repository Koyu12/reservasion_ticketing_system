import { useQuery } from '@tanstack/react-query'
import { apiRequest } from '../../api'
import { authClient } from '../../auth-client'
import type { ReservationListResponse } from './reservations'

export function useReservations(enabled = true) {
  const auth = authClient.useSession()
  const query = useQuery({
    queryKey: ['reservations', auth.data?.user.id],
    enabled: enabled && Boolean(auth.data) && !auth.isPending && !auth.error,
    retry: false,
    queryFn: async ({ signal }) => {
      const result = await apiRequest<ReservationListResponse>('/reservations', { signal })
      if (!result) throw new Error('Unable to check your reservations. Please try again.')
      return result
    },
  })
  return { ...auth, query }
}
