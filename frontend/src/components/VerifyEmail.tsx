import { useState } from 'react'
import { Link, Navigate, useSearchParams } from 'react-router'
import { authClient } from '../auth-client'
import { ErrorState, LoadingState } from './RequestState'
import { authPath, safeReturnTo } from '../return-to'

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

  if (isPending) return <LoadingState />
  if (sessionError)
    return (
      <ErrorState
        message="Unable to check your session."
        onRetry={() => void refetch()}
      />
    )

  if (session?.user.emailVerified && returnTo !== '/events')
    return <Navigate to={returnTo} replace />

  return (
    <>
      <h1>Verify your email</h1>
      {session?.user.emailVerified ? (
        <>
          <p role="status">
            Your email is verified. You can book workshops when registration is
            available.
          </p>
          <Link to="/events">Browse workshops</Link>
        </>
      ) : (
        <>
          {linkError && <ErrorState message={linkError} />}
          {session ? (
            <>
              <p>
                Check the inbox for {session.user.email} for a verification
                link. Links expire after one hour.
              </p>
              <p>
                You can browse workshops while unverified. Verify your email
                before booking.
              </p>
              {notice && <p role="status">{notice}</p>}
              {error && <ErrorState message={error} />}
              <button
                type="button"
                disabled={requesting || checking}
                onClick={() => void resend()}
              >
                {requesting ? 'Requesting email…' : 'Resend verification email'}
              </button>{' '}
              <button
                type="button"
                disabled={requesting || checking}
                onClick={() => void checkStatus()}
              >
                {checking ? 'Checking…' : 'Check verification status'}
              </button>
            </>
          ) : (
            <p>
              <Link to={authPath('/login', returnTo)}>Sign in</Link> to check
              your verification status or request a new link.
            </p>
          )}
          <p>
            <Link to="/events">Continue browsing</Link>
          </p>
        </>
      )}
    </>
  )
}
