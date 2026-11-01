import { Button } from './ui/Button/Button'
import { Alert } from './ui/Alert/Alert'

export function LoadingState() {
  return <p className="py-8 text-[14px] text-muted" role="status">Loading…</p>
}

type ErrorStateProps = {
  message: string
  onRetry?: () => void
}

export function ErrorState({ message, onRetry }: ErrorStateProps) {
  return (
    <Alert kind="error">
      <p>{message}</p>
      {onRetry && (
        <Button variant="text" className="mt-2" onClick={onRetry}>
          Try again
        </Button>
      )}
    </Alert>
  )
}
