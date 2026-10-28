import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router'
import { authClient } from '../auth-client'
import { ErrorState } from './RequestState'

export function ForgotPassword() {
  const [pending, setPending] = useState(false)
  const [requested, setRequested] = useState(false)
  const [error, setError] = useState('')

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
      setRequested(true)
    } catch {
      setError('Unable to connect. Please try again.')
    } finally {
      setPending(false)
    }
  }

  return (
    <>
      <h1>Forgot password</h1>
      <p>Enter your account email to request a password-reset link.</p>
      {requested && (
        <p role="status">
          If an account exists for that email, check your inbox and spam folder
          for a reset link. If it does not arrive, you can request another.
        </p>
      )}
      {error && <ErrorState message={error} />}
      <form onSubmit={(event) => void submit(event)} aria-busy={pending}>
        <fieldset disabled={pending}>
          <p>
            <label htmlFor="recovery-email">Email</label>
            <br />
            <input
              id="recovery-email"
              name="email"
              type="email"
              autoComplete="email"
              required
            />
          </p>
          <button type="submit">
            {pending ? 'Requesting link…' : 'Request reset link'}
          </button>
        </fieldset>
      </form>
      <p>
        <Link to="/login">Back to sign in</Link>
      </p>
    </>
  )
}
