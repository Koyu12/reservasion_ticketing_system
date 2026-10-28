import assert from 'node:assert/strict'
import { test } from 'node:test'
import { authPath, safeReturnTo } from '../src/return-to.ts'

const id = 'abcdef12-1234-4321-8123-abcdef123456'

test('returns only permitted workshop and confirmation destinations', () => {
  assert.equal(safeReturnTo('/reservations'), '/reservations')
  assert.equal(safeReturnTo(`/events/${id.toUpperCase()}`), `/events/${id}`)
  assert.equal(
    safeReturnTo(`/reservations/${id}/confirmation`),
    `/reservations/${id}/confirmation`,
  )
})

test('rejects external, encoded, malformed and unrelated destinations', () => {
  for (const value of [
    null,
    '',
    '/events',
    'https://example.com',
    '//example.com',
    `/events/${id}\n`,
    `/events/${id}?next=https://example.com`,
    `/events/${id}#fragment`,
    `/events/${id}/../..`,
    '/events/not-a-uuid',
    '/admin/events',
    '/login',
    '/%2f%2fexample.com',
    '\\example.com',
    `/reservations/${id}`,
    `/reservations/${id}/confirmation/`,
  ])
    assert.equal(safeReturnTo(value), '/events', String(value))
})

test('carries the validated destination through account flows', () => {
  for (const path of ['/login', '/register', '/verify-email'] as const) {
    const result = authPath(path, `/events/${id}`)
    const url = new URL(result, 'https://workshops.example')
    assert.equal(url.pathname, path)
    assert.equal(url.searchParams.get('returnTo'), `/events/${id}`)
    assert.equal(authPath(path, 'https://example.com'), path)
    assert.equal(
      new URL(
        authPath(path, '/reservations'),
        'https://workshops.example',
      ).searchParams.get('returnTo'),
      '/reservations',
    )
  }
})
