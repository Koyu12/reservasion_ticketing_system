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
    throw new Error(`Request failed (${response.status}). Please try again.`)
  }

  const text = await response.text()

  if (!text.trim()) {
    return undefined
  }

  return JSON.parse(text) as T
}