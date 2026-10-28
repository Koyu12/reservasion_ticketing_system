export function requireTestDatabaseUrl(
  value?: string,
  developmentUrl?: string,
): string {
  if (!value) throw new Error('TEST_DATABASE_URL is required');
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error('TEST_DATABASE_URL must be a PostgreSQL URL');
  }
  if (
    !['postgresql:', 'postgres:'].includes(url.protocol) ||
    decodeURIComponent(url.pathname) !== '/reservation_ticketing_system_test' ||
    (url.searchParams.has('schema') &&
      url.searchParams.get('schema') !== 'public')
  )
    throw new Error('Only reservation_ticketing_system_test/public is allowed');
  if (developmentUrl) {
    const development = new URL(developmentUrl);
    const host = (target: URL) =>
      ['localhost', '127.0.0.1', '[::1]'].includes(target.hostname)
        ? 'localhost'
        : target.hostname;
    if (
      host(url) === host(development) &&
      (url.port || '5432') === (development.port || '5432') &&
      decodeURIComponent(url.pathname) ===
        decodeURIComponent(development.pathname)
    )
      throw new Error('TEST_DATABASE_URL must differ from DATABASE_URL');
  }
  return value;
}
