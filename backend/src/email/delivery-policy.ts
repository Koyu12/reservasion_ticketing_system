export const EMAIL_DELIVERY_POLICY = {
  maxAttemptsPerCycle: 5,
  retryDelaysMs: [30_000, 120_000, 600_000, 3_600_000],
  pollIntervalMs: 5_000,
  requestTimeoutMs: 10_000,
  claimTtlMs: 60_000,
  idempotencyWindowMs: 86_400_000,
} as const;
