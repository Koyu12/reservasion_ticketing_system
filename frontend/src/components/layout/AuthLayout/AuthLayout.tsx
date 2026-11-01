import type { ReactNode } from 'react'

export function AuthLayout({ title, description, children, className = '' }: {
  title: string
  description?: string
  children: ReactNode
  className?: string
}) {
  return (
    <main id="page-content" tabIndex={-1} className={`mx-auto flex min-h-dvh w-full max-w-[472px] flex-col gap-5 px-4 pt-8 pb-10 desktop:pt-16 desktop:pb-16 ${className}`}>
      <header className="flex flex-col gap-3">
        <h1 className="text-[28px] leading-9 font-bold desktop:text-[36px] desktop:leading-11">{title}</h1>
        {description && <p className="text-[16px] leading-6 text-muted">{description}</p>}
      </header>
      {children}
    </main>
  )
}
