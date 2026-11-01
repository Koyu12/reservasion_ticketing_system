import type { ComponentProps } from 'react'

const variants = {
  primary:
    'min-h-11 bg-primary px-5 font-semibold text-primary-ink hover:bg-primary-hover',
  secondary:
    'min-h-11 border! border-solid! border-line! bg-surface px-5 font-semibold text-ink hover:bg-elevated',
  destructive:
    'min-h-11 bg-error px-5 font-semibold text-canvas hover:bg-error/85',
  text: 'min-h-11 bg-transparent p-0 font-medium text-accent enabled:hover:underline underline-offset-4',
  icon: 'size-11 shrink-0 bg-transparent p-0 text-ink hover:bg-elevated',
}

export function Button({
  variant = 'primary',
  className = '',
  type = 'button',
  ...props
}: ComponentProps<'button'> & {
  variant?: keyof typeof variants
}) {
  return (
    <button
      {...props}
      type={type}
      className={`inline-flex cursor-pointer items-center justify-center rounded-control border-0 font-sans text-[14px] leading-normal [font-optical-sizing:none] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent disabled:cursor-default disabled:opacity-45 ${variants[variant]} ${className}`}
    />
  )
}
