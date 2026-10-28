const uuid =
  '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}'
const destination = new RegExp(
  `^/(?:events/${uuid}|reservations(?:/${uuid}/confirmation)?)$`,
)

export function safeReturnTo(value: string | null): string {
  return value && value.trim() === value && destination.test(value)
    ? value.toLowerCase()
    : '/events'
}

export function authPath(
  path: '/login' | '/register' | '/verify-email',
  returnTo: string,
) {
  const target = safeReturnTo(returnTo)
  return target === '/events'
    ? path
    : `${path}?returnTo=${encodeURIComponent(target)}`
}
