import { Link, Navigate, Route, Routes } from 'react-router'
import { useState } from 'react'
import { authClient } from './auth-client'
import { AuthForm } from './components/AuthForm'
import { ErrorState } from './components/RequestState'
import { VerifyEmail } from './components/VerifyEmail'
import { ForgotPassword } from './components/ForgotPassword'
import { ResetPassword } from './components/ResetPassword'
import { RequireAdmin } from './components/RequireAdmin'
import { WorkshopList } from './components/admin/WorkshopList'
import { WorkshopEditor } from './components/admin/WorkshopEditor'
import { WorkshopAttendees } from './components/admin/WorkshopAttendees'
import { FailedEmails } from './components/admin/FailedEmails'
import { WorkshopDiscovery } from './components/workshops/WorkshopDiscovery'
import { WorkshopDetails } from './components/workshops/WorkshopDetails'
import { BookingConfirmation } from './components/workshops/BookingConfirmation'
import { MyReservations } from './components/workshops/MyReservations'

export default function App() {
  const {
    data: session,
    isPending,
    error: sessionError,
    refetch,
  } = authClient.useSession()
  const [signingOut, setSigningOut] = useState(false)
  const [logoutError, setLogoutError] = useState('')

  async function logout() {
    setSigningOut(true)
    setLogoutError('')
    try {
      const result = await authClient.signOut()
      if (result.error) setLogoutError('Unable to sign out. Please try again.')
      else await refetch()
    } catch {
      setLogoutError('Unable to connect. Please try again.')
    } finally {
      setSigningOut(false)
    }
  }

  return (
    <>
      <nav aria-label="Main navigation">
        <Link to="/events">Workshops</Link>{' '}
        {isPending ? (
          <span role="status">Checking session…</span>
        ) : session ? (
          <>
            <span>Signed in as {session.user.name}</span>{' '}
            {!session.user.emailVerified && (
              <>
                <Link to="/verify-email">Verify email</Link>{' '}
              </>
            )}
            <Link to="/reservations">My reservations</Link>{' '}
            {session.user.role === 'ADMIN' && (
              <>
                <Link to="/admin/events">Manage workshops</Link>{' '}
                <Link to="/admin/notifications">Failed emails</Link>{' '}
              </>
            )}
            <button
              type="button"
              disabled={signingOut}
              onClick={() => void logout()}
            >
              {signingOut ? 'Signing out…' : 'Sign out'}
            </button>
          </>
        ) : !sessionError ? (
          <>
            <Link to="/login">Sign in</Link>{' '}
            <Link to="/register">Register</Link>
          </>
        ) : null}
      </nav>
      {sessionError && (
        <ErrorState
          message="Unable to check your session."
          onRetry={() => void refetch()}
        />
      )}
      {logoutError && <ErrorState message={logoutError} />}

      <main>
        <Routes>
          <Route path="/" element={<Navigate to="/events" replace />} />
          <Route path="/events" element={<WorkshopDiscovery />} />
          <Route path="/verify-email" element={<VerifyEmail />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/events/:id" element={<WorkshopDetails />} />
          <Route
            path="/reservations/:id/confirmation"
            element={<BookingConfirmation />}
          />
          <Route
            path="/login"
            element={<AuthForm key="login" mode="login" />}
          />
          <Route
            path="/register"
            element={<AuthForm key="register" mode="register" />}
          />
          <Route path="/reservations" element={<MyReservations />} />
          <Route
            path="/admin/events"
            element={
              <RequireAdmin>
                <WorkshopList />
              </RequireAdmin>
            }
          />
          <Route
            path="/admin/notifications"
            element={
              <RequireAdmin>
                <FailedEmails />
              </RequireAdmin>
            }
          />
          <Route
            path="/admin/events/new"
            element={
              <RequireAdmin>
                <WorkshopEditor key="new" />
              </RequireAdmin>
            }
          />
          <Route
            path="/admin/events/:id/attendees"
            element={
              <RequireAdmin>
                <WorkshopAttendees />
              </RequireAdmin>
            }
          />
          <Route
            path="/admin/events/:id"
            element={
              <RequireAdmin>
                <WorkshopEditor key="edit" />
              </RequireAdmin>
            }
          />
          <Route path="*" element={<h1>Page not found</h1>} />
        </Routes>
      </main>
    </>
  )
}
