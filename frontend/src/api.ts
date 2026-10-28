export class ApiError extends Error {
  readonly status: number
  readonly fieldErrors: { field: string; message: string }[]
  readonly code?: string
  readonly reservationId?: string

  constructor(
    message: string,
    status: number,
    fieldErrors: { field: string; message: string }[] = [],
    code?: string,
    reservationId?: string,
  ) {
    super(message)
    this.status = status
    this.fieldErrors = fieldErrors
    this.code = code
    this.reservationId = reservationId
  }
}

export async function apiRequest<T>(
  path: string,
  options: RequestInit = {},
): Promise<T | undefined> {
  const headers = new Headers(options.headers)
  headers.set('Accept', 'application/json')

  if (typeof options.body === 'string' && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }

  const response = await fetch(`/api${path}`, {
    ...options,
    headers,
  })

  if (!response.ok) {
    const body: unknown = await response.json().catch(() => null)
    let message = `Request failed (${response.status}). Please try again.`
    let fieldErrors: { field: string; message: string }[] = []
    let code: string | undefined
    let reservationId: string | undefined
    if (body && typeof body === 'object') {
      if ('message' in body && typeof body.message === 'string')
        message = body.message
      if ('code' in body && typeof body.code === 'string') code = body.code
      if ('reservationId' in body && typeof body.reservationId === 'string')
        reservationId = body.reservationId
      if ('fieldErrors' in body && Array.isArray(body.fieldErrors)) {
        fieldErrors = body.fieldErrors.filter(
          (issue: unknown): issue is { field: string; message: string } =>
            Boolean(issue) &&
            typeof issue === 'object' &&
            issue !== null &&
            'field' in issue &&
            typeof issue.field === 'string' &&
            'message' in issue &&
            typeof issue.message === 'string',
        )
      }
    }
    throw new ApiError(
      message,
      response.status,
      fieldErrors,
      code,
      reservationId,
    )
  }

  const text = await response.text()

  if (!text.trim()) {
    return undefined
  }

  return JSON.parse(text) as T
}
