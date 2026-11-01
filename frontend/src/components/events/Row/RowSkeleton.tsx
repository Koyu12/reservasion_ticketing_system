export function RowSkeleton() {
  return (
    <div
      aria-hidden="true"
      className="flex gap-5 border-0 border-b border-solid border-line py-6 motion-safe:animate-pulse"
    >
      <div className="h-[88px] w-14 shrink-0 rounded-control bg-elevated desktop:h-28 desktop:w-20" />
      <div className="flex min-w-0 flex-1 flex-col gap-3">
        <div className="h-4 w-full rounded-sm bg-elevated" />
        <div className="h-4 w-[min(200px,80%)] rounded-sm bg-elevated" />
        <div className="h-4 w-[min(240px,90%)] rounded-sm bg-elevated" />
      </div>
    </div>
  )
}
