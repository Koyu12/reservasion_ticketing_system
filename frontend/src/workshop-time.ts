export function formatWib(value: string) {
  return `${new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Jakarta',
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))} WIB`
}

export function toWibInput(value: string) {
  return new Date(new Date(value).getTime() + 7 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 23)
}

export function fromWibInput(value: string) {
  return new Date(`${value}+07:00`).toISOString()
}

export function formatFilterDate(value: string) {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'UTC',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(`${value}T00:00:00Z`))
}

export function formatEventDate(
  value: string,
  options: Intl.DateTimeFormatOptions,
) {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Jakarta',
    ...options,
  }).format(new Date(value))
}
