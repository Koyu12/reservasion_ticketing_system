import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router'
import { authClient } from '../auth-client'
import { ErrorState, LoadingState } from './RequestState'
import { authPath, safeReturnTo } from '../return-to'

export function AuthForm({ mode }: { mode: 'login' | 'register' }) {
  const {
    data: session,
    isPending,
    error: sessionError,
    refetch,
  } = authClient.useSession()
  const [submitting, setSubmitting] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()
  const returnTo = safeReturnTo(params.get('returnTo'))
  const verificationPath = authPath('/verify-email', returnTo)
  const cleanParams = () =>
    setParams(returnTo === '/events' ? {} : { returnTo }, { replace: true })
  const registering = mode === 'register'
  const googleError = params.has('error')
    ? params.get('error') === 'access_denied'
      ? 'Google sign-in was cancelled. You can try again.'
      : params.get('error') === 'account_not_linked'
        ? 'This account could not be linked. Sign in with your password and verify your email before trying Google again.'
        : 'Google sign-in could not be completed. Please try again or use your email and password.'
    : ''

  async function signInWithGoogle() {
    setSubmitting(true)
    setError('')
    cleanParams()
    try {
      const origin = window.location.origin
      const result = await authClient.signIn.social({
        provider: 'google',
        callbackURL: `${origin}${returnTo}`,
        errorCallbackURL: `${origin}${authPath('/login', returnTo)}`,
        newUserCallbackURL: `${origin}${returnTo}`,
      })
      if (result.error) {
        setError(
          result.error.code === 'GOOGLE_NOT_CONFIGURED'
            ? 'Google sign-in is not configured yet. Use your email and password for now.'
            : 'Unable to start Google sign-in. Please try again.',
        )
        setSubmitting(false)
      }
    } catch {
      setError('Unable to connect. Please try again.')
      setSubmitting(false)
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const email = String(form.get('email') ?? '').trim()
    const password = String(form.get('password') ?? '')
    const name = String(form.get('name') ?? '').trim()
    if (registering && !name) {
      setError('Enter your name.')
      return
    }
    setSubmitting(true)
    setError('')
    cleanParams()
    try {
      const result = registering
        ? await authClient.signUp.email({
            name,
            email,
            password,
            callbackURL: new URL(verificationPath, window.location.origin).href,
          })
        : await authClient.signIn.email({ email, password })
      if (result.error) {
        setError(
          !registering && result.error.status === 401
            ? 'Email or password is incorrect.'
            : registering && result.error.status === 422
              ? 'Unable to create this account. Check your details or try signing in.'
              : 'Unable to complete your request. Please try again.',
        )
        return
      }
      await refetch()
      await navigate(registering ? verificationPath : returnTo, {
        replace: true,
      })
    } catch {
      setError('Unable to connect. Please try again.')
    } finally {
      setSubmitting(false)
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
  if (session)
    return (
      <Navigate
        to={
          registering && !session.user.emailVerified
            ? verificationPath
            : returnTo
        }
        replace
      />
    )

  return (
    <>
      <h1>{registering ? 'Create account' : 'Sign in'}</h1>
      {googleError && <ErrorState message={googleError} />}
      <button
        type="button"
        disabled={submitting}
        onClick={() => void signInWithGoogle()}
      >
        Continue with Google
      </button>
      <p>Or use your email and password.</p>
      <form onSubmit={(event) => void submit(event)} aria-busy={submitting}>
        <fieldset disabled={submitting}>
          {registering && (
            <p>
              <label htmlFor="name">Name</label>
              <br />
              <input id="name" name="name" autoComplete="name" required />
            </p>
          )}
          <p>
            <label htmlFor="email">Email</label>
            <br />
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
            />
          </p>
          <p>
            <label htmlFor="password">Password</label>
            <br />
            <input
              id="password"
              name="password"
              type={showPassword ? 'text' : 'password'}
              autoComplete={registering ? 'new-password' : 'current-password'}
              minLength={8}
              maxLength={128}
              required
              aria-describedby={registering ? 'password-help' : undefined}
            />
            <button
              type="button"
              aria-pressed={showPassword}
              onClick={() => setShowPassword((visible) => !visible)}
            >
              {showPassword ? 'Hide password' : 'Show password'}
            </button>
          </p>
          {registering && (
            <p id="password-help">Use between 8 and 128 characters.</p>
          )}
          {error && <ErrorState message={error} />}
          <button type="submit">
            {submitting
              ? 'Please wait…'
              : registering
                ? 'Create account'
                : 'Sign in'}
          </button>
        </fieldset>
      </form>
      {!registering && (
        <p>
          <Link to="/forgot-password">Forgot password?</Link>
        </p>
      )}
      <p>
        {registering ? 'Already have an account? ' : 'New here? '}
        <Link to={authPath(registering ? '/login' : '/register', returnTo)}>
          {registering ? 'Sign in' : 'Create account'}
        </Link>
      </p>
    </>
  )
}
