import { useId, useState } from 'react'
import type { ComponentProps } from 'react'

export function Input({ label, help, error, id, className = '', ...props }: ComponentProps<'input'> & {
  label: string
  help?: string
  error?: string
}) {
  const generated = useId()
  const inputId = id ?? generated
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <label htmlFor={inputId} className="text-[13px] leading-[19px] font-semibold">{label}</label>
      <input {...props} id={inputId} aria-invalid={Boolean(error) || undefined} aria-describedby={error || help ? `${inputId}-help` : props['aria-describedby']} className={`h-12 w-full min-w-0 rounded-control border border-solid border-control bg-surface px-[14px] text-[14px] text-ink placeholder:text-muted disabled:opacity-50 ${className}`} />
      {(error || help) && <p id={`${inputId}-help`} className={`text-[12px] leading-[18px] ${error ? 'text-error' : 'text-muted'}`}>{error ?? help}</p>}
    </div>
  )
}

export function PasswordInput(props: Omit<ComponentProps<typeof Input>, 'type'>) {
  const [visible, setVisible] = useState(false)
  return (
    <div className="relative">
      <Input {...props} type={visible ? 'text' : 'password'} className={`pr-[76px] ${props.className ?? ''}`} />
      <button type="button" className="absolute top-[27px] right-1 flex h-12 min-w-16 items-center justify-center text-[12px] font-semibold text-muted hover:text-ink disabled:opacity-50" aria-label={visible ? 'Hide password' : 'Show password'} aria-pressed={visible} disabled={props.disabled} onClick={() => setVisible(!visible)}>{visible ? 'Hide' : 'Show'}</button>
    </div>
  )
}
