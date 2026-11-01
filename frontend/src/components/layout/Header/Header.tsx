import { Link, useLocation, useNavigate } from 'react-router'
import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { authClient } from '../../../auth-client'
import { ErrorState } from '../../RequestState'

export function Header() {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const client = useQueryClient()
  const { data: session, isPending, error, refetch } = authClient.useSession()
  const [signingOut, setSigningOut] = useState(false)
  const [logoutError, setLogoutError] = useState('')
  const active = pathname.startsWith('/reservations') ? 'reservations' : pathname.startsWith('/admin') ? 'admin' : 'events'
  async function logout() {
    setSigningOut(true)
    setLogoutError('')
    try {
      const result = await authClient.signOut()
      if (result.error) throw new Error('Unable to sign out.')
      client.clear()
      await refetch()
      await navigate('/events')
    } catch { setLogoutError('Unable to sign out. Please try again.') }
    finally { setSigningOut(false) }
  }
  const accountClass = 'flex h-11 items-center justify-center rounded-control border border-solid border-line bg-elevated px-4 font-semibold text-ink hover:bg-line narrow:px-3'
  return <header className="discovery-header relative border-0 border-b border-solid border-line text-[14px]">
    <div className="mx-auto grid w-[calc(100%_-_32px)] grid-cols-[1fr_auto] items-center gap-3 py-4 desktop:flex desktop:w-[min(1200px,calc(100%_-_64px))] desktop:justify-between desktop:gap-0 desktop:py-5">
      <Link to="/events" className="text-[18px] leading-[1.45] font-bold narrow:text-[16px] desktop:text-[20px]">Workshop Collective</Link>
      <nav aria-label="Main navigation" className="col-span-full row-start-2 flex items-center gap-7 desktop:gap-8">
        {[{key:'events',to:'/events',label:'Events'}, {key:'reservations',to:'/reservations',label:'My Reservations'}].map(item => <Link key={item.key} to={item.to} aria-current={active === item.key ? 'page' : undefined} className={`relative flex min-h-11 items-center hover:text-accent ${active === item.key ? "font-semibold text-accent after:absolute after:inset-x-0 after:bottom-0 after:h-[3px] after:bg-accent after:content-['']" : 'text-ink'}`}>{item.label}</Link>)}
      </nav>
      <div className="col-start-2 row-start-1">
        {isPending ? <span className={`${accountClass} text-muted`} role="status">Checking…</span> : session ? <details className="relative" onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) event.currentTarget.open = false }}>
          <summary className={`${accountClass} cursor-pointer list-none [&::-webkit-details-marker]:hidden`}>Account</summary>
          <div className="absolute top-full right-0 z-30 mt-2 flex w-60 flex-col gap-1 rounded-control border border-solid border-line bg-surface p-3 shadow-xl" onClick={(event) => { if ((event.target as HTMLElement).closest('a')) event.currentTarget.closest('details')?.removeAttribute('open') }}>
            <p className="mb-2 truncate px-2 py-2 font-semibold" title={session.user.name}>{session.user.name}</p>
            <Link className="rounded-control px-2 py-3 hover:bg-elevated" to="/reservations">My Reservations</Link>
            {!session.user.emailVerified && <Link className="px-2 py-3 text-accent" to="/verify-email">Verify email</Link>}
            {session.user.role === 'ADMIN' && <><Link className="rounded-control px-2 py-3 hover:bg-elevated" to="/admin/events">Manage workshops</Link><Link className="rounded-control px-2 py-3 hover:bg-elevated" to="/admin/notifications">Failed emails</Link></>}
            <button type="button" className="rounded-control border-0 bg-transparent px-2 py-3 text-left text-muted hover:bg-elevated disabled:opacity-50" disabled={signingOut} onClick={() => void logout()}>{signingOut ? 'Signing out…' : 'Sign out'}</button>
          </div>
        </details> : <Link className={accountClass} to="/login">Log in</Link>}
      </div>
    </div>
    {(error || logoutError) && <div className="mx-auto w-[min(1200px,calc(100%_-_32px))] pb-4"><ErrorState message={logoutError || 'Unable to check your session.'} onRetry={logoutError ? () => void logout() : () => void refetch()} /></div>}
    {active === 'admin' && session?.user.role === 'ADMIN' && <nav aria-label="Administration" className="mx-auto flex w-[min(1200px,calc(100%_-_32px))] flex-wrap gap-6 pb-4 text-muted"><Link className="py-2 hover:text-ink" to="/admin/events">Manage workshops</Link><Link className="py-2 hover:text-ink" to="/admin/notifications">Failed emails</Link></nav>}
  </header>
}
