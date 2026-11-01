import { useEffect, useId, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import { Icon } from '../Icon/Icon'
import { Button } from '../Button/Button'
import { toWibInput, formatFilterDate } from '../../../workshop-time'

type DateRange = { from: string; to: string }

function dateKey(date: Date) {
  return date.toISOString().slice(0, 10)
}

function calendarDate(value: string) {
  return new Date(`${value}T00:00:00Z`)
}

export function Calendar({
  from,
  to,
  endpoint,
  today = toWibInput(new Date().toISOString()).slice(0, 10),
  onApply,
  onDismiss,
}: DateRange & {
  endpoint: 'from' | 'to'
  today?: string
  onApply: (range: DateRange) => void
  onDismiss: () => void
}) {
  const id = useId()
  const initialDate = endpoint === 'to' ? to || from || today : from || today
  const [month, setMonth] = useState(() => initialDate.slice(0, 7))
  const [focused, setFocused] = useState(initialDate)
  const [range, setRange] = useState({ from, to })
  const [selectingEnd, setSelectingEnd] = useState(
    endpoint === 'to' && Boolean(from),
  )
  const dialog = useRef<HTMLDialogElement>(null)
  const first = calendarDate(`${month}-01`)
  const monthLabel = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'UTC',
    month: 'long',
    year: 'numeric',
  }).format(first)
  const dayCount = new Date(
    Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0),
  ).getUTCDate()
  const offset = (first.getUTCDay() + 6) % 7
  const cells = Array.from(
    { length: Math.ceil((offset + dayCount) / 7) * 7 },
    (_, i) => {
      const day = i - offset + 1
      return day > 0 && day <= dayCount
        ? `${month}-${String(day).padStart(2, '0')}`
        : null
    },
  )

  useEffect(() => {
    const element = dialog.current!
    const trigger = document.activeElement
    element.showModal()
    return () => {
      element.close()
      if (trigger instanceof HTMLElement) trigger.focus()
    }
  }, [])

  useEffect(() => {
    dialog.current
      ?.querySelector<HTMLButtonElement>(`[data-date="${focused}"]`)
      ?.focus()
  }, [focused, month])

  function changeMonth(amount: number) {
    const date = calendarDate(`${month}-01`)
    date.setUTCMonth(date.getUTCMonth() + amount)
    const next = dateKey(date)
    setMonth(next.slice(0, 7))
    setFocused(next)
  }

  function select(date: string) {
    if (!selectingEnd || !range.from || date < range.from) {
      setRange({ from: date, to: '' })
      setSelectingEnd(true)
      setFocused(date)
      return
    }
    onApply({ from: range.from, to: date })
    onDismiss()
  }

  function keyDown(event: KeyboardEvent<HTMLButtonElement>, value: string) {
    const date = calendarDate(value)
    const weekday = (date.getUTCDay() + 6) % 7
    const offsets: Record<string, number> = {
      ArrowLeft: -1,
      ArrowRight: 1,
      ArrowUp: -7,
      ArrowDown: 7,
      Home: -weekday,
      End: 6 - weekday,
    }
    if (event.key in offsets)
      date.setUTCDate(date.getUTCDate() + offsets[event.key])
    else if (event.key === 'PageUp' || event.key === 'PageDown') {
      const day = date.getUTCDate()
      date.setUTCDate(1)
      date.setUTCMonth(date.getUTCMonth() + (event.key === 'PageUp' ? -1 : 1))
      const lastDay = new Date(
        Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0),
      ).getUTCDate()
      date.setUTCDate(Math.min(day, lastDay))
    } else return
    event.preventDefault()
    const next = dateKey(date)
    setMonth(next.slice(0, 7))
    setFocused(next)
  }

  return (
    <dialog
      ref={dialog}
      className="discovery-calendar box-border max-h-[calc(100dvh_-_32px)] w-[min(342px,calc(100%_-_32px))] overflow-auto rounded-control border border-solid border-control bg-elevated p-4 font-sans text-[14px] leading-normal text-ink [font-optical-sizing:none] [color-scheme:dark] backdrop:bg-black/60"
      aria-labelledby={`${id}-title`}
      onCancel={(event) => {
        event.preventDefault()
        onDismiss()
      }}
      onClick={(event) => {
        const bounds = event.currentTarget.getBoundingClientRect()
        if (
          event.target === event.currentTarget &&
          (event.clientX < bounds.left ||
            event.clientX > bounds.right ||
            event.clientY < bounds.top ||
            event.clientY > bounds.bottom)
        )
          onDismiss()
      }}
    >
      <h2 id={`${id}-title`} className="sr-only">
        Choose dates
      </h2>
      <p
        className="sr-only"
        role="status"
      >
        {selectingEnd && range.from
          ? `From ${formatFilterDate(range.from)}. Choose an end date.`
          : 'Choose a start date.'}
      </p>
      <div className="mb-2 flex h-11 items-center justify-between gap-2">
        <Button
          variant="icon"
          aria-label="Previous month"
          onClick={() => changeMonth(-1)}
        >
          <Icon name="previous" />
        </Button>
        <h3
          id={`${id}-month`}
          className="m-0 text-[14px] font-semibold"
          aria-live="polite"
        >
          {monthLabel}
        </h3>
        <Button
          variant="icon"
          aria-label="Next month"
          onClick={() => changeMonth(1)}
        >
          <Icon name="next" />
        </Button>
      </div>
      <table
        role="grid"
        aria-labelledby={`${id}-month`}
        className="calendar-grid w-full table-fixed border-collapse text-center tabular-nums"
      >
        <thead>
          <tr>
            {['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'].map((day) => (
              <th
                scope="col"
                key={day}
                className="h-8 text-[12px] font-semibold text-muted"
              >
                {day}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: cells.length / 7 }, (_, week) => (
            <tr key={week}>
              {cells.slice(week * 7, week * 7 + 7).map((date, index) => {
                const selected = Boolean(
                  date && (date === range.from || date === range.to),
                )
                const inRange = Boolean(
                  date &&
                  range.from &&
                  range.to &&
                  date > range.from &&
                  date < range.to,
                )
                return (
                  <td
                    className="h-11 p-0 data-[in-range]:bg-surface"
                    key={date ?? `blank-${index}`}
                    aria-selected={selected || inRange}
                    data-in-range={inRange || undefined}
                  >
                    {date && (
                      <button
                        className="relative box-border min-h-11 w-full cursor-pointer rounded-control border-0 bg-transparent p-0 text-ink [font:inherit] hover:bg-surface aria-[current=date]:underline aria-[current=date]:underline-offset-4 data-[selected]:bg-accent data-[selected]:font-semibold data-[selected]:text-canvas focus-visible:outline-2 focus-visible:-outline-offset-3 focus-visible:outline-accent data-[selected]:focus-visible:outline-canvas"
                        type="button"
                        data-date={date}
                        data-selected={selected || undefined}
                        aria-label={new Intl.DateTimeFormat('en-GB', {
                          timeZone: 'UTC',
                          dateStyle: 'full',
                        }).format(calendarDate(date))}
                        aria-current={date === today ? 'date' : undefined}
                        tabIndex={date === focused ? 0 : -1}
                        onFocus={() => setFocused(date)}
                        onKeyDown={(event) => keyDown(event, date)}
                        onClick={() => select(date)}
                      >
                        {Number(date.slice(-2))}
                      </button>
                    )}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-2 flex min-h-11 items-center justify-between gap-2">
        <span className="text-[12px] font-semibold">
          {range.from && range.to
            ? `${range.from.slice(0, 7) === range.to.slice(0, 7) ? Number(range.from.slice(-2)) : formatFilterDate(range.from)}–${formatFilterDate(range.to)} · WIB`
            : 'Dates use WIB'}
        </span>
        <Button
          variant="text"
          disabled={!from && !to && !range.from}
          onClick={() => {
            onApply({ from: '', to: '' })
            onDismiss()
          }}
        >
          Clear dates
        </Button>
      </div>
    </dialog>
  )
}
