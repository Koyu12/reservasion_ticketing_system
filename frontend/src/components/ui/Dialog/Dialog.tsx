import { useEffect, useId, useRef } from 'react'
import type { ReactNode } from 'react'
import { Button } from '../Button/Button'
import { Icon } from '../Icon/Icon'

export function Dialog({ title, children, onClose, busy = false }: { title: string; children: ReactNode; onClose: () => void; busy?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null)
  const id = useId()
  useEffect(() => {
    const trigger = document.activeElement
    const dialog = ref.current!
    dialog.showModal()
    return () => {
      dialog.close()
      if (trigger instanceof HTMLElement && trigger.isConnected) trigger.focus()
    }
  }, [])
  return (
    <dialog ref={ref} aria-labelledby={id} aria-busy={busy} onCancel={(event) => { event.preventDefault(); if (!busy) onClose() }} className="m-auto max-h-[calc(100dvh_-_32px)] w-[min(560px,calc(100%_-_32px))] overflow-auto rounded-control border border-solid border-line bg-surface p-6 text-ink backdrop:bg-black/65 desktop:p-8">
      <div className="mb-6 flex items-start justify-between gap-4">
        <h2 id={id} className="text-[22px] leading-8 font-semibold desktop:text-[24px]">{title}</h2>
        <Button variant="icon" aria-label="Close dialog" disabled={busy} onClick={onClose}><Icon name="close" /></Button>
      </div>
      <div className="flex flex-col gap-5">{children}</div>
    </dialog>
  )
}
