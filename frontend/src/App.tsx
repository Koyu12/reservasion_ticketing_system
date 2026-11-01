import { Link, Navigate, Outlet, Route, Routes } from 'react-router'
import { AuthForm } from './components/AuthForm'
import { VerifyEmail } from './components/VerifyEmail'
import { ForgotPassword } from './components/ForgotPassword'
import { ResetPassword } from './components/ResetPassword'
import { RequireAdmin } from './components/RequireAdmin'
import { WorkshopList } from './components/admin/WorkshopList'
import { WorkshopEditor } from './components/admin/WorkshopEditor'
import { WorkshopAttendees } from './components/admin/WorkshopAttendees'
import { FailedEmails } from './components/admin/FailedEmails'
import { Discovery } from './features/discovery/Discovery'
import { WorkshopDetails } from './components/workshops/WorkshopDetails'
import { BookingConfirmation } from './components/workshops/BookingConfirmation'
import { MyReservations } from './components/workshops/MyReservations'
import { ReservationDetails } from './components/workshops/ReservationDetails'
import { Header } from './components/layout/Header/Header'

function SiteLayout() {
  return <><Header /><div id="page-content" tabIndex={-1}><Outlet /></div></>
}

export default function App() {
  return <div className="app-shell min-h-dvh bg-canvas font-sans text-[14px] leading-normal text-ink [color-scheme:dark]">
    <a href="#page-content" className="fixed top-2 left-4 z-50 -translate-y-[200%] rounded-control bg-accent px-4 py-3 text-canvas focus:translate-y-0">Skip to content</a>
    <div>
      <Routes>
        <Route path="/" element={<Navigate to="/events" replace />} />
        <Route path="/login" element={<AuthForm key="login" mode="login" />} />
        <Route path="/register" element={<AuthForm key="register" mode="register" />} />
        <Route path="/verify-email" element={<VerifyEmail />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route element={<SiteLayout />}>
          <Route path="/events" element={<Discovery />} />
          <Route path="/events/:id" element={<WorkshopDetails />} />
          <Route path="/reservations" element={<MyReservations />} />
          <Route path="/reservations/:id" element={<ReservationDetails />} />
          <Route path="/reservations/:id/confirmation" element={<BookingConfirmation />} />
          <Route path="/admin/events" element={<RequireAdmin><WorkshopList /></RequireAdmin>} />
          <Route path="/admin/events/new" element={<RequireAdmin><WorkshopEditor key="new" /></RequireAdmin>} />
          <Route path="/admin/events/:id" element={<RequireAdmin><WorkshopEditor key="edit" /></RequireAdmin>} />
          <Route path="/admin/events/:id/attendees" element={<RequireAdmin><WorkshopAttendees /></RequireAdmin>} />
          <Route path="/admin/notifications" element={<RequireAdmin><FailedEmails /></RequireAdmin>} />
          <Route path="*" element={<main className="mx-auto flex w-[min(800px,calc(100%_-_32px))] flex-col items-start gap-5 py-16"><h1 className="text-[28px] font-bold desktop:text-[36px]">Page not found</h1><p className="text-muted">This page is unavailable or the link is incorrect.</p><Link className="inline-flex min-h-11 items-center rounded-control bg-primary px-5 font-semibold text-primary-ink" to="/events">Explore events</Link></main>} />
        </Route>
      </Routes>
    </div>
  </div>
}
