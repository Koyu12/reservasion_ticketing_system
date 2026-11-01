import type { ComponentProps, ReactNode } from 'react'
import { Icon } from '../Icon/Icon'
import type { IconName } from '../Icon/Icon'

export function Empty({
  icon,
  title,
  description,
  children,
  className = '',
  ...props
}: Omit<ComponentProps<'div'>, 'title'> & {
  icon?: IconName
  title: string
  description: string
  children?: ReactNode
}) {
  return (
    <div
      {...props}
      className={`discovery-empty box-border flex min-h-[280px] flex-col gap-4 border-0 border-t border-solid border-line py-6 font-sans text-ink [font-optical-sizing:none] **:box-border desktop:min-h-[240px] desktop:flex-row desktop:gap-6 desktop:py-8 ${className}`}
    >
      {icon && (
        <div className="discovery-empty-icon flex size-8 shrink-0 items-start justify-start text-muted desktop:h-10 desktop:w-[72px] desktop:items-center desktop:justify-center">
          <Icon name={icon} className="size-[26px]" />
        </div>
      )}
      <div className="discovery-empty-body flex min-w-0 flex-col items-start gap-3">
        <h2 className="m-0 text-[22px] leading-[30px] font-semibold desktop:text-[24px] desktop:leading-8">
          {title}
        </h2>
        <p className="m-0 text-[14px] leading-[21px] wrap-break-word text-muted">
          {description}
        </p>
        {children}
      </div>
    </div>
  )
}
