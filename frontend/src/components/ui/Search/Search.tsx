import { useId } from 'react'
import type { ComponentProps } from 'react'
import { Icon } from '../Icon/Icon'

export function Search({
  label,
  id,
  className = '',
  ...props
}: Omit<ComponentProps<'input'>, 'type'> & { label: string }) {
  const generatedId = useId()
  const inputId = id ?? generatedId
  return (
    <div className="box-border min-w-0 font-sans [font-optical-sizing:none] **:box-border">
      <label
        htmlFor={inputId}
        className="mb-2 block text-[13px] leading-[19px] font-semibold text-ink"
      >
        {label}
      </label>
      <div className="flex h-12 items-center gap-2.5 rounded-control border border-solid border-line bg-surface px-[14px] text-muted focus-within:outline-2 focus-within:outline-offset-3 focus-within:outline-accent">
        <Icon name="search" className="shrink-0" />
        <input
          {...props}
          id={inputId}
          type="search"
          className={`h-full w-full min-w-0 border-0 bg-transparent p-0 font-sans text-[14px] leading-normal text-ink caret-accent outline-none placeholder:text-muted placeholder:opacity-100 focus-visible:outline-none ${className}`}
        />
      </div>
    </div>
  )
}
