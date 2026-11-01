import { formatEventDate } from '../../../workshop-time'

export function DateTile({ dateTime }: { dateTime: string }) {
  return (
    <time
      dateTime={dateTime}
      className="discovery-date flex w-14 flex-col items-center gap-2 font-sans tabular-nums [font-optical-sizing:none] desktop:w-20"
    >
      <span className="sr-only">
        {formatEventDate(dateTime, { dateStyle: 'full' })}
      </span>
      <span
        aria-hidden="true"
        className="flex h-[88px] w-14 flex-col items-center overflow-hidden rounded-control bg-elevated [box-shadow:inset_0_0_0_1px_var(--color-line)] desktop:h-28 desktop:w-20"
      >
        <span className="flex h-6 items-center justify-center self-stretch bg-accent text-[11px] leading-[13px] font-semibold tracking-[0.5px] text-canvas uppercase desktop:h-7 desktop:text-[12px] desktop:leading-[15px] desktop:tracking-[1px]">
          {formatEventDate(dateTime, { month: 'short' })}
        </span>
        <span className="mt-2 text-[28px] leading-[31px] font-bold text-ink desktop:mt-3 desktop:text-[36px] desktop:leading-10">
          {formatEventDate(dateTime, { day: '2-digit' })}
        </span>
        <span className="mt-0.5 text-[11px] leading-[13px] text-muted desktop:hidden">
          {formatEventDate(dateTime, { weekday: 'short' })}
        </span>
        <span className="mt-[3px] hidden text-[12px] leading-[15px] text-muted desktop:block">
          {formatEventDate(dateTime, { weekday: 'long' })}
        </span>
      </span>
      <span
        aria-hidden="true"
        className="text-[12px] leading-[15px] text-muted"
      >
        {formatEventDate(dateTime, { year: 'numeric' })}
      </span>
    </time>
  )
}
