import type { ReactNode } from 'react'

export function Alert({ children, kind = 'info' }: { children: ReactNode; kind?: 'info' | 'error' | 'success' }) {
  const colors = { info: 'border-info/35 bg-info/5 text-info', error: 'border-error/35 bg-error/5 text-error', success: 'border-success/35 bg-success/5 text-success' }
  return <div role={kind === 'error' ? 'alert' : 'status'} className={`rounded-control border border-solid p-4 text-[14px] leading-[21px] ${colors[kind]}`}>{children}</div>
}
