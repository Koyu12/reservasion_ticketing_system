import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router'
import { authClient } from '../auth-client'
import { ErrorState, LoadingState } from './RequestState'
import { authPath, safeReturnTo } from '../return-to'
import { AuthLayout } from './layout/AuthLayout/AuthLayout'
import { Input, PasswordInput } from './ui/Input/Input'
import { Button } from './ui/Button/Button'
import { Alert } from './ui/Alert/Alert'

export function AuthForm({ mode }: { mode: 'login' | 'register' }) {
  const {
    data: session,
    isPending,
    error: sessionError,
    refetch,
  } = authClient.useSession()
  const [submitting, setSubmitting] = useState(false)
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

  const title = registering ? 'Create your account' : 'Welcome back'
  const description = registering
    ? 'Find a workshop. Make room for something new.'
    : 'Log in to manage your reservations.'

  if (isPending) return <AuthLayout title={title}><LoadingState /></AuthLayout>
  if (sessionError)
    return (
      <AuthLayout title={title} description={description}>
        <ErrorState
          message="Unable to check your session."
          onRetry={() => void refetch()}
        />
      </AuthLayout>
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
    <AuthLayout title={title} description={description}>
      {returnTo.startsWith('/events/') && (
        <p className="rounded-control border border-solid border-line bg-surface p-4 text-[14px] leading-[21px] text-muted">
          {registering ? 'Create an account' : 'Log in'} to return to your selected event. You can review its details before reserving.
        </p>
      )}
      {googleError && <Alert kind="error">{googleError}</Alert>}
      <Button
        variant="secondary"
        className="h-12 w-full gap-3"
        disabled={submitting}
        onClick={() => void signInWithGoogle()}
      >
        <svg aria-hidden="true" width="18" height="18" viewBox="0 0 48 48">
          <path fill="#4285F4" d="M43.61 24.46c0-1.36-.12-2.66-.35-3.92H24.4v7.42h10.77a9.2 9.2 0 0 1-4 6.03v5h6.48c3.79-3.49 5.96-8.63 5.96-14.53Z" />
          <path fill="#34A853" d="M24.4 44c5.4 0 9.94-1.79 13.25-4.85l-6.48-5c-1.79 1.2-4.07 1.92-6.77 1.92-5.21 0-9.63-3.52-11.21-8.26H6.51v5.16A20 20 0 0 0 24.4 44Z" />
          <path fill="#FBBC05" d="M13.19 27.81A12 12 0 0 1 12.56 24c0-1.32.23-2.61.63-3.81v-5.16H6.51A20 20 0 0 0 4.4 24c0 3.23.77 6.29 2.11 8.97l6.68-5.16Z" />
          <path fill="#EA4335" d="M24.4 11.93c2.94 0 5.57 1.01 7.65 2.99l5.74-5.74C34.33 5.95 29.8 4 24.4 4a20 20 0 0 0-17.89 11.03l6.68 5.16c1.58-4.74 6-8.26 11.21-8.26Z" />
        </svg>
        Continue with Google
      </Button>
      <div className="flex items-center gap-4 text-[12px] leading-[18px] text-muted">
        <span className="h-px flex-1 bg-line" />
        <span>{registering ? 'or sign up with email' : 'or continue with email'}</span>
        <span className="h-px flex-1 bg-line" />
      </div>
      <form onSubmit={(event) => void submit(event)} aria-busy={submitting}>
        <fieldset disabled={submitting} className="m-0 flex min-w-0 flex-col gap-5 border-0 p-0">
          {error && <Alert kind="error">{error}</Alert>}
          {registering && (
            <Input label="Full name" id="name" name="name" placeholder="Your full name" autoComplete="name" required />
          )}
          <Input label="Email address" id="email" name="email" type="email" placeholder="you@example.com" autoComplete="email" required />
          <div className="flex flex-col gap-2">
            <PasswordInput
              label="Password"
              id="password"
              name="password"
              placeholder={registering ? 'Create a password' : 'Enter your password'}
              autoComplete={registering ? 'new-password' : 'current-password'}
              minLength={8}
              maxLength={128}
              disabled={submitting}
              required
              help={registering ? 'Use a strong, unique password. Use between 8 and 128 characters.' : undefined}
            />
            {!registering && (
              <Link className="inline-flex min-h-11 items-center self-end text-[13px] font-semibold text-accent hover:underline" to="/forgot-password">Forgot password?</Link>
            )}
          </div>
          <Button type="submit" className="h-12 w-full">
            {submitting
              ? 'Please wait…'
              : registering
                ? 'Create account'
                : 'Log in'}
          </Button>
        </fieldset>
      </form>
      {registering && <p className="text-[12px] leading-[18px] text-muted">With email signup, verify your email before booking. Creating an account doesn’t reserve a place.</p>}
      <p className="text-center text-[14px] leading-[21px] text-muted">
        {registering ? 'Already have an account? ' : 'New here? '}
        <Link className="inline-flex min-h-11 items-center font-semibold text-accent hover:underline" to={authPath(registering ? '/login' : '/register', returnTo)}>
          {registering ? 'Log in' : 'Create account'}
        </Link>
      </p>
      {!registering && <p className="text-center text-[12px] leading-[18px] text-muted">Signing in doesn’t reserve a place.</p>}
    </AuthLayout>
  )
}
