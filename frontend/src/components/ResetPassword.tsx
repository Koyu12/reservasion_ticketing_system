import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router'
import { authClient } from '../auth-client'
import { ErrorState } from './RequestState'

export function ResetPassword() {
  const [params, setParams] = useSearchParams()
  const { refetch } = authClient.useSession()
  const token = params.get('token')
  const [pending, setPending] = useState(false)
  const [complete, setComplete] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
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
      <>
        <h1>Password reset</h1>
        <p role="status">
          Your password has been reset and all previous sessions have been
          signed out.
        </p>
        <Link to="/login">Sign in with your new password</Link>
      </>
    )

  if (!token || params.has('error'))
    return (
      <>
        <h1>Reset password</h1>
        <ErrorState message="This reset link is missing, invalid, expired, or already used." />
        <Link to="/forgot-password">Request a new reset link</Link>
      </>
    )

  return (
    <>
      <h1>Reset password</h1>
      <p id="reset-password-help">
        Use between 8 and 128 characters. Resetting signs out all existing
        sessions.
      </p>
      {error && <ErrorState message={error} />}
      <form onSubmit={(event) => void submit(event)} aria-busy={pending}>
        <fieldset disabled={pending}>
          <p>
            <label htmlFor="new-password">New password</label>
            <br />
            <input
              id="new-password"
              name="newPassword"
              type={showPassword ? 'text' : 'password'}
              autoComplete="new-password"
              minLength={8}
              maxLength={128}
              aria-describedby="reset-password-help"
              required
            />
          </p>
          <p>
            <label htmlFor="confirm-password">Confirm new password</label>
            <br />
            <input
              id="confirm-password"
              name="confirmation"
              type={showPassword ? 'text' : 'password'}
              autoComplete="new-password"
              minLength={8}
              maxLength={128}
              required
            />
            <button
              type="button"
              aria-pressed={showPassword}
              onClick={() => setShowPassword((visible) => !visible)}
            >
              {showPassword ? 'Hide passwords' : 'Show passwords'}
            </button>
          </p>
          <button type="submit">
            {pending ? 'Resetting password…' : 'Reset password'}
          </button>
        </fieldset>
      </form>
      <p>
        <Link to="/forgot-password">Request a new reset link</Link>
      </p>
    </>
  )
}
