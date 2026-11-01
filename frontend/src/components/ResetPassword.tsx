import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router'
import { authClient } from '../auth-client'
import { AuthLayout } from './layout/AuthLayout/AuthLayout'
import { PasswordInput } from './ui/Input/Input'
import { Button } from './ui/Button/Button'
import { Alert } from './ui/Alert/Alert'

export function ResetPassword() {
  const [params, setParams] = useSearchParams()
  const { refetch } = authClient.useSession()
  const token = params.get('token')
  const [pending, setPending] = useState(false)
  const [complete, setComplete] = useState(false)
  const [error, setError] = useState('')

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!token) return
    const form = new FormData(event.currentTarget)
    const newPassword = String(form.get('newPassword') ?? '')
    if (newPassword !== String(form.get('confirmation') ?? '')) {
      setError('Passwords do not match.')
      return
    }
    setPending(true)
    setError('')
    try {
      const result = await authClient.resetPassword({ token, newPassword })
      if (result.error) {
        if (result.error.code === 'INVALID_TOKEN') {
          setParams({}, { replace: true })
        } else {
          setError('Unable to reset your password. Please try again.')
        }
        return
      }
      setComplete(true)
      setParams({}, { replace: true })
      // A session refresh failure must not turn a successful reset into a failed reset.
      void refetch().catch(() => undefined)
    } catch {
      setError('Unable to connect. Please try again.')
    } finally {
      setPending(false)
    }
  }

  if (complete)
    return (
      <AuthLayout title="Password updated" description="Your password has been updated. Log in with your new password to continue." className="desktop:pt-20">
        <p role="status" className="text-[14px] leading-[21px] text-muted">
          All previous sessions have been signed out.
        </p>
        <Link to="/login" className="inline-flex min-h-12 items-center justify-center rounded-control bg-primary px-5 text-[14px] font-semibold text-primary-ink hover:bg-primary-hover">Log in</Link>
        <Link to="/events" className="inline-flex min-h-11 items-center justify-center text-[14px] font-semibold text-accent hover:underline">Explore events</Link>
      </AuthLayout>
    )

  if (!token || params.has('error'))
    return (
      <AuthLayout title="Reset link unavailable" description="This link is invalid, expired or already used. Request a new reset link to continue." className="desktop:pt-20">
        <Link to="/forgot-password" className="inline-flex min-h-12 items-center justify-center rounded-control bg-primary px-5 text-[14px] font-semibold text-primary-ink hover:bg-primary-hover">Request new reset link</Link>
        <Link to="/login" className="inline-flex min-h-11 items-center justify-center text-[14px] font-semibold text-accent hover:underline">Back to login</Link>
      </AuthLayout>
    )

  return (
    <AuthLayout title="Set a new password" description="Choose a strong, unique password for your account." className="desktop:pt-20">
      {error && <Alert kind="error">{error}</Alert>}
      <form onSubmit={(event) => void submit(event)} aria-busy={pending}>
        <fieldset disabled={pending} className="m-0 flex min-w-0 flex-col gap-5 border-0 p-0">
            <PasswordInput
              label="New password"
              id="new-password"
              name="newPassword"
              placeholder="Create a new password"
              autoComplete="new-password"
              minLength={8}
              maxLength={128}
              help="Use a strong, unique password. Use between 8 and 128 characters."
              disabled={pending}
              required
            />
            <PasswordInput
              label="Confirm new password"
              id="confirm-password"
              name="confirmation"
              placeholder="Confirm your new password"
              autoComplete="new-password"
              minLength={8}
              maxLength={128}
              disabled={pending}
              error={error === 'Passwords do not match.' ? error : undefined}
              required
            />
          <Button type="submit" className="h-12 w-full">
            {pending ? 'Resetting password…' : 'Reset password'}
          </Button>
        </fieldset>
      </form>
      <p className="text-[12px] leading-[18px] text-muted">Resetting your password signs out all existing sessions.</p>
      <Link to="/login" className="inline-flex min-h-11 items-center justify-center text-[14px] font-semibold text-accent hover:underline">Back to login</Link>
      <Link to="/forgot-password" className="inline-flex min-h-11 items-center justify-center text-[13px] text-muted hover:text-ink hover:underline">Request a new reset link</Link>
    </AuthLayout>
  )
}
