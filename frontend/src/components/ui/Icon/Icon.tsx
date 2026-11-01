export type IconName =
  'search' | 'calendar' | 'search-x' | 'previous' | 'next' | 'close'

export function Icon({
  name,
  className,
}: {
  name: IconName
  className?: string
}) {
  const paths = {
    search: (
      <>
        <circle cx="11" cy="11" r="8" />
        <path d="m21 21-4.35-4.35" />
      </>
    ),
    calendar: (
      <>
        <path d="M8 2v4m8-4v4M3 10h18" />
        <rect x="3" y="4" width="18" height="18" rx="2" />
        <path d="M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01M16 18h.01" />
      </>
    ),
    'search-x': (
      <>
        <path d="m13.5 8.5-5 5m0-5 5 5m7.5 7.5-4.35-4.35" />
        <circle cx="11" cy="11" r="8" />
      </>
    ),
    previous: <path d="m15 18-6-6 6-6" />,
    next: <path d="m9 18 6-6-6-6" />,
    close: <path d="m18 6-12 12M6 6l12 12" />,
  }
  return (
    <svg
      className={className}
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  )
}
