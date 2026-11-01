import { useState } from 'react'

export function Cover({ src, className = '' }: { src?: string | null; className?: string }) {
  const [failed, setFailed] = useState<string | null>(null)
  return (
    <div className={`relative flex min-h-48 items-center justify-center overflow-hidden rounded-control bg-surface ${className}`}>
      {src && failed !== src ? <img src={src} alt="" onError={() => setFailed(src)} className="absolute inset-0 h-full w-full object-cover" /> : (
        <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-muted" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="m21 15-5-5L5 21" /></svg>
          <span className="text-[20px] font-semibold text-ink">Workshop Collective</span>
          <span className="text-[12px] text-muted">Event image unavailable</span>
        </div>
      )}
    </div>
  )
}
