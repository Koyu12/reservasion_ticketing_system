import { useState } from 'react'
import { Link, Navigate, useSearchParams } from 'react-router'
import { authClient } from '../auth-client'
import { ErrorState, LoadingState } from './RequestState'
import { authPath, safeReturnTo } from '../return-to'
import { AuthLayout } from './layout/AuthLayout/AuthLayout'
import { Button } from './ui/Button/Button'
import { Alert } from './ui/Alert/Alert'

export function VerifyEmail() {
  const {
    data: session,
    isPending,
    error: sessionError,
    refetch,
  } = authClient.useSession()
  const [params, setParams] = useSearchParams()
  const returnTo = safeReturnTo(params.get('returnTo'))
  const [requesting, setRequesting] = useState(false)
  const [checking, setChecking] = useState(false)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const linkError =
    params.get('error') === 'TOKEN_EXPIRED'
      ? 'This verification link has expired. Request a new one.'
      : params.has('error')
        ? 'This verification link is invalid. Request a new one.'
        : ''

  async function resend() {
    if (!session) return
    setRequesting(true)
    setNotice('')
    setError('')
    try {
      const result = await authClient.sendVerificationEmail({
        email: session.user.email,
        callbackURL: new URL(
          authPath('/verify-email', returnTo),
          window.location.origin,
        ).href,
      })
      if (result.error) {
        setError(
          result.error.status === 429
            ? 'Too many requests. Please wait before requesting another email.'
            : 'Unable to request a verification email. Please try again.',
        )
        return
      }
      setParams(returnTo === '/events' ? {} : { returnTo }, { replace: true })
      setNotice(
        'Verification email requested. Check your inbox and spam folder. If it does not arrive, you can request another link.',
      )
    } catch {
      setError('Unable to connect. Please try again.')
    } finally {
      setRequesting(false)
    }
  }

  async function checkStatus() {
    setChecking(true)
    setError('')
    try {
      await refetch()
    } catch {
      setError('Unable to check your verification status. Please try again.')
    } finally {
      setChecking(false)
    }
  }

  if (isPending)
    return (
      <AuthLayout title="Verify your email" className="desktop:pt-20">
        <LoadingState />
      </AuthLayout>
    )
  if (sessionError)
    return (
      <AuthLayout title="Verify your email" className="desktop:pt-20">
        <ErrorState
          message="Unable to check your session."
          onRetry={() => void refetch()}
        />
      </AuthLayout>
    )

  if (session?.user.emailVerified && returnTo !== '/events')
    return <Navigate to={returnTo} replace />

  const verified = Boolean(session?.user.emailVerified)
  const title = verified
    ? 'Email verified'
    : linkError
      ? 'Verification link unavailable'
      : 'Verify your email'
  const description = verified
    ? 'Your email is verified. You can book workshops when registration is available.'
    : linkError
      ? 'This link is invalid, expired or already used. Request another verification email to continue.'
      : `Open the verification link in your email${session ? ` for ${session.user.email}` : ''}. Email verification is required before booking.`

  return (
    <AuthLayout title={title} description={description} className="desktop:pt-20">
      {verified ? (
        <>
          <p role="status" className="sr-only">Your email is verified.</p>
          <Link to="/events" className="inline-flex min-h-12 items-center justify-center rounded-control bg-primary px-5 text-[14px] font-semibold text-primary-ink hover:bg-primary-hover">Explore events</Link>
        </>
      ) : (
        <>
          {linkError && <Alert kind="error">{linkError}</Alert>}
          {session ? (
            <>
              <p className="text-[14px] leading-[21px] text-muted">
                Check your inbox and spam folder. Links expire after one hour.
              </p>
              {notice && <Alert kind="success">{notice}</Alert>}
              {error && <Alert kind="error">{error}</Alert>}
              <div className="flex flex-col gap-3" aria-busy={requesting || checking}>
                <Button
                  className="h-12 w-full"
                  disabled={requesting || checking}
                  onClick={() => void resend()}
                >
                  {requesting ? 'Requesting email…' : 'Resend verification email'}
                </Button>
                <Button
                  variant="secondary"
                  className="h-12 w-full"
                  disabled={requesting || checking}
                  onClick={() => void checkStatus()}
                >
                  {checking ? 'Checking…' : 'Check verification status'}
                </Button>
              </div>
            </>
          ) : (
            <>
              <p className="text-[14px] leading-[21px] text-muted">Log in to check your verification status or request a new link.</p>
              <Button className="h-12 w-full" disabled>Resend verification email</Button>
            </>
          )}
          <Link to={authPath('/login', returnTo)} className="inline-flex min-h-11 items-center justify-center text-[14px] font-semibold text-accent hover:underline">Back to login</Link>
          <Link to="/events" className="inline-flex min-h-11 items-center justify-center text-[14px] font-medium text-muted hover:text-ink hover:underline">Continue browsing</Link>
        </>
      )}
      <p className="text-[12px] leading-[18px] text-muted">Verifying your email doesn’t reserve a place.</p>
    </AuthLayout>
  )
}
