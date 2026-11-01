import { useState } from 'react'
import { Button } from '../../ui/Button/Button'
import { Dialog } from '../../ui/Dialog/Dialog'
import { Input } from '../../ui/Input/Input'
import { Alert } from '../../ui/Alert/Alert'

export function ShareEvent({ id, title }: { id: string; title: string }) {
  const [fallback, setFallback] = useState(false)
  const [notice, setNotice] = useState('')
  const url = typeof window === 'undefined' ? `/events/${id}` : new URL(`/events/${id}`, window.location.origin).href
  async function share() {
    setNotice('')
    if (navigator.share) {
      try { await navigator.share({ title, url }); return }
      catch (error) { if (error instanceof Error && error.name === 'AbortError') return }
    }
    setFallback(true)
  }
  async function copy() {
    try { await navigator.clipboard.writeText(url); setNotice('Event link copied.') }
    catch { setNotice('Select the link above and copy it manually.') }
  }
  return <>
    <Button variant="secondary" onClick={() => void share()}>Share Event</Button>
    {fallback && <Dialog title="Share event" onClose={() => setFallback(false)}>
      <Input label="Public event link" value={url} readOnly onFocus={(event) => event.currentTarget.select()} />
      <p className="text-muted">This link contains no private reservation details.</p>
      {notice && <Alert>{notice}</Alert>}
      <Button onClick={() => void copy()}>Copy link</Button>
    </Dialog>}
  </>
}
