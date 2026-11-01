import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router'
import { authClient } from '../auth-client'
import { AuthLayout } from './layout/AuthLayout/AuthLayout'
import { Input } from './ui/Input/Input'
import { Button } from './ui/Button/Button'
import { Alert } from './ui/Alert/Alert'

export function ForgotPassword() {
  const [pending, setPending] = useState(false)
  const [requested, setRequested] = useState(false)
  const [error, setError] = useState('')
  const [requestedEmail, setRequestedEmail] = useState('')

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const email = String(
      new FormData(event.currentTarget).get('email') ?? '',
    ).trim()
    setPending(true)
    setError('')
    setRequested(false)
    try {
      const result = await authClient.requestPasswordReset({
        email,
        redirectTo: new URL('/reset-password', window.location.origin).href,
      })
      if (result.error) {
        setError(
          result.error.status === 429
            ? 'Too many requests. Please wait before requesting another link.'
            : 'Unable to request a reset link. Please try again.',
        )
        return
      }
      setRequestedEmail(email)
      setRequested(true)
    } catch {
      setError('Unable to connect. Please try again.')
    } finally {
      setPending(false)
    }
  }

  if (requested) return (
    <AuthLayout title="Check your email" description={`If an account exists for ${requestedEmail}, a reset link has been requested. Check your inbox and spam folder.`} className="desktop:pt-20">
      <p className="sr-only" role="status">Password reset link requested.</p>
      <Link to="/login" className="inline-flex min-h-12 items-center justify-center rounded-control bg-primary px-5 text-[14px] font-semibold text-primary-ink hover:bg-primary-hover">Back to login</Link>
      <Button variant="text" className="self-center font-semibold" onClick={() => setRequested(false)}>Request another link</Button>
    </AuthLayout>
  )

  return (
    <AuthLayout title="Forgot your password?" description="Enter your email to request a password reset link." className="desktop:pt-20">
      {error && <Alert kind="error">{error}</Alert>}
      <form onSubmit={(event) => void submit(event)} aria-busy={pending}>
        <fieldset disabled={pending} className="m-0 flex min-w-0 flex-col gap-5 border-0 p-0">
            <Input
              label="Email address"
              id="recovery-email"
              name="email"
              type="email"
              placeholder="you@example.com"
              autoComplete="email"
              defaultValue={requestedEmail}
              required
            />
          <Button type="submit" className="h-12 w-full">
            {pending ? 'Requesting link…' : 'Send reset link'}
          </Button>
        </fieldset>
      </form>
      <Link to="/login" className="inline-flex min-h-11 items-center justify-center text-[14px] font-semibold text-accent hover:underline">Back to login</Link>
    </AuthLayout>
  )
}
