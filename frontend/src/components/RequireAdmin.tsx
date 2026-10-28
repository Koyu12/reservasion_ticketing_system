import type { ReactNode } from 'react'
import { Link, Navigate } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { authClient } from '../auth-client'
import { ErrorState, LoadingState } from './RequestState'

export function RequireAdmin({ children }: { children: ReactNode }) {
  const {
    data: session,
    isPending,
    error: sessionError,
    refetch,
  } = authClient.useSession()
  const access = useQuery({
    queryKey: ['admin-access', session?.user.id],
    enabled: Boolean(session) && !sessionError,
    retry: false,
    staleTime: 0,
    gcTime: 0,
    refetchOnMount: 'always',
    queryFn: async ({ signal }) => {
      const response = await fetch('/api/admin/access', {
        signal,
        headers: { Accept: 'application/json' },
      })
      if (response.status === 401) {
        await refetch()
        return 'anonymous'
      }
      if (response.status === 403) return 'forbidden'
      if (!response.ok) throw new Error('Admin access check failed')
      const body: unknown = await response.json()
      if (
        !body ||
        typeof body !== 'object' ||
        !('allowed' in body) ||
        body.allowed !== true
      ) {
        throw new Error('Invalid admin access response')
      }
      return 'allowed'
    },
  })

  if (isPending) return <LoadingState />
  if (sessionError)
    return (
      <ErrorState
        message="Unable to check your session."
        onRetry={() => void refetch()}
      />
    )
  if (!session) return <Navigate to="/login" replace />
  if (access.isPending || access.isFetching) return <LoadingState />
  if (access.isError)
    return (
      <ErrorState
        message="Unable to check admin access."
        onRetry={() => void access.refetch()}
      />
    )
  if (access.data === 'anonymous') return <Navigate to="/login" replace />
  if (access.data !== 'allowed')
    return (
      <>
        <h1>Access denied</h1>
        <p>You do not have admin access.</p>
        <Link to="/events">Browse workshops</Link>
      </>
    )
  return children
}
