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

  if (isPending)
    return (
      <section className="mx-auto w-[min(1200px,calc(100%_-_32px))] py-8 desktop:py-12">
        <LoadingState />
      </section>
    )
  if (sessionError)
    return (
      <section className="mx-auto w-[min(1200px,calc(100%_-_32px))] py-8 desktop:py-12">
        <ErrorState
          message="Unable to check your session."
          onRetry={() => void refetch()}
        />
      </section>
    )
  if (!session) return <Navigate to="/login" replace />
  if (access.isPending || access.isFetching)
    return (
      <section className="mx-auto w-[min(1200px,calc(100%_-_32px))] py-8 desktop:py-12">
        <LoadingState />
      </section>
    )
  if (access.isError)
    return (
      <section className="mx-auto w-[min(1200px,calc(100%_-_32px))] py-8 desktop:py-12">
        <ErrorState
          message="Unable to check admin access."
          onRetry={() => void access.refetch()}
        />
      </section>
    )
  if (access.data === 'anonymous') return <Navigate to="/login" replace />
  if (access.data !== 'allowed')
    return (
      <section className="mx-auto flex w-[min(800px,calc(100%_-_32px))] flex-col items-start gap-5 py-12 desktop:py-16">
        <h1 className="text-[28px] leading-9 font-bold desktop:text-[36px] desktop:leading-11">
          Access denied
        </h1>
        <p className="text-[16px] leading-6 text-muted">
          You do not have admin access.
        </p>
        <Link
          to="/events"
          className="inline-flex min-h-11 items-center justify-center rounded-control bg-primary px-5 text-[14px] font-semibold text-primary-ink no-underline hover:bg-primary-hover"
        >
          Browse workshops
        </Link>
      </section>
    )
  return children
}
