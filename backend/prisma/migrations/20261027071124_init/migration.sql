-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'ATTENDEE');

-- CreateEnum
CREATE TYPE "EventStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ReservationStatus" AS ENUM ('CONFIRMED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "CancellationSource" AS ENUM ('SELF_SERVICE', 'ADMIN', 'EVENT_CANCELLED');

-- CreateEnum
CREATE TYPE "EmailJobType" AS ENUM ('BOOKING_CONFIRMED', 'RESERVATION_CANCELLED', 'EVENT_CANCELLED', 'EVENT_CHANGED');

-- CreateEnum
CREATE TYPE "EmailJobStatus" AS ENUM ('PENDING', 'PROCESSING', 'SENT', 'FAILED', 'SKIPPED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "image" TEXT,
    "role" "Role" NOT NULL DEFAULT 'ATTENDEE',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "password" TEXT,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "idToken" TEXT,
    "scope" TEXT,
    "accessTokenExpiresAt" TIMESTAMPTZ(3),
    "refreshTokenExpiresAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Verification" (
    "id" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Verification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Event" (
    "id" UUID NOT NULL,
    "createdById" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "venueName" TEXT NOT NULL,
    "venueAddress" TEXT NOT NULL,
    "startsAt" TIMESTAMPTZ(3) NOT NULL,
    "endsAt" TIMESTAMPTZ(3) NOT NULL,
    "registrationClosesAt" TIMESTAMPTZ(3) NOT NULL,
    "capacity" INTEGER NOT NULL,
    "status" "EventStatus" NOT NULL DEFAULT 'DRAFT',
    "scheduleRevision" INTEGER NOT NULL DEFAULT 0,
    "cancelledAt" TIMESTAMPTZ(3),
    "cancelledById" TEXT,
    "cancellationReason" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventChange" (
    "id" UUID NOT NULL,
    "eventId" UUID NOT NULL,
    "revision" INTEGER NOT NULL,
    "oldStartsAt" TIMESTAMPTZ(3) NOT NULL,
    "oldEndsAt" TIMESTAMPTZ(3) NOT NULL,
    "newStartsAt" TIMESTAMPTZ(3) NOT NULL,
    "newEndsAt" TIMESTAMPTZ(3) NOT NULL,
    "oldVenueName" TEXT NOT NULL,
    "oldVenueAddress" TEXT NOT NULL,
    "newVenueName" TEXT NOT NULL,
    "newVenueAddress" TEXT NOT NULL,
    "changedById" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EventChange_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Reservation" (
    "id" UUID NOT NULL,
    "eventId" UUID NOT NULL,
    "userId" TEXT NOT NULL,
    "bookingReference" TEXT NOT NULL,
    "status" "ReservationStatus" NOT NULL DEFAULT 'CONFIRMED',
    "bookedRevision" INTEGER NOT NULL,
    "cancelledAt" TIMESTAMPTZ(3),
    "cancelledById" TEXT,
    "cancellationSource" "CancellationSource",
    "cancellationReason" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Reservation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailJob" (
    "id" UUID NOT NULL,
    "reservationId" UUID NOT NULL,
    "eventChangeId" UUID,
    "type" "EmailJobType" NOT NULL,
    "recipientEmail" TEXT NOT NULL,
    "deduplicationKey" TEXT NOT NULL,
    "status" "EmailJobStatus" NOT NULL DEFAULT 'PENDING',
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "retryCycleAttemptCount" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMPTZ(3),
    "lastAttemptAt" TIMESTAMPTZ(3),
    "claimToken" UUID,
    "claimExpiresAt" TIMESTAMPTZ(3),
    "providerMessageId" TEXT,
    "sentAt" TIMESTAMPTZ(3),
    "lastError" TEXT,
    "skippedAt" TIMESTAMPTZ(3),
    "skipReason" TEXT,
    "lastManualRetryById" TEXT,
    "lastManualRetryAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "Account_userId_idx" ON "Account"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Account_providerId_accountId_key" ON "Account"("providerId", "accountId");

-- CreateIndex
CREATE UNIQUE INDEX "Session_token_key" ON "Session"("token");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE INDEX "Verification_identifier_idx" ON "Verification"("identifier");

-- CreateIndex
CREATE INDEX "Event_status_startsAt_idx" ON "Event"("status", "startsAt");

-- CreateIndex
CREATE UNIQUE INDEX "EventChange_eventId_revision_key" ON "EventChange"("eventId", "revision");

-- CreateIndex
CREATE UNIQUE INDEX "Reservation_bookingReference_key" ON "Reservation"("bookingReference");

-- CreateIndex
CREATE INDEX "Reservation_userId_createdAt_idx" ON "Reservation"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "Reservation_eventId_status_idx" ON "Reservation"("eventId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "EmailJob_deduplicationKey_key" ON "EmailJob"("deduplicationKey");

-- CreateIndex
CREATE INDEX "EmailJob_status_nextAttemptAt_idx" ON "EmailJob"("status", "nextAttemptAt");

-- CreateIndex
CREATE INDEX "EmailJob_status_claimExpiresAt_idx" ON "EmailJob"("status", "claimExpiresAt");

-- CreateIndex
CREATE INDEX "EmailJob_reservationId_idx" ON "EmailJob"("reservationId");

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_cancelledById_fkey" FOREIGN KEY ("cancelledById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventChange" ADD CONSTRAINT "EventChange_changedById_fkey" FOREIGN KEY ("changedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventChange" ADD CONSTRAINT "EventChange_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reservation" ADD CONSTRAINT "Reservation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reservation" ADD CONSTRAINT "Reservation_cancelledById_fkey" FOREIGN KEY ("cancelledById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reservation" ADD CONSTRAINT "Reservation_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailJob" ADD CONSTRAINT "EmailJob_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "Reservation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailJob" ADD CONSTRAINT "EmailJob_eventChangeId_fkey" FOREIGN KEY ("eventChangeId") REFERENCES "EventChange"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailJob" ADD CONSTRAINT "EmailJob_lastManualRetryById_fkey" FOREIGN KEY ("lastManualRetryById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Event: valid capacity, schedule, revision, and cancellation details.
ALTER TABLE "Event"
  ADD CONSTRAINT "Event_capacity_positive"
    CHECK ("capacity" > 0),

  ADD CONSTRAINT "Event_schedule_valid"
    CHECK ("endsAt" > "startsAt"),

  ADD CONSTRAINT "Event_registration_deadline_valid"
    CHECK ("registrationClosesAt" <= "startsAt"),

  ADD CONSTRAINT "Event_revision_nonnegative"
    CHECK ("scheduleRevision" >= 0),

  ADD CONSTRAINT "Event_cancellation_metadata_valid"
    CHECK (
      (
        "status" = 'CANCELLED'
        AND "cancelledAt" IS NOT NULL
        AND "cancelledById" IS NOT NULL
        AND "cancellationReason" IS NOT NULL
        AND "cancellationReason" ~ '[^[:space:]]'
      )
      OR
      (
        "status" <> 'CANCELLED'
        AND "cancelledAt" IS NULL
        AND "cancelledById" IS NULL
        AND "cancellationReason" IS NULL
      )
    );

-- EventChange: positive revision, valid schedules, and nonblank reason.
ALTER TABLE "EventChange"
  ADD CONSTRAINT "EventChange_revision_positive"
    CHECK ("revision" > 0),

  ADD CONSTRAINT "EventChange_old_schedule_valid"
    CHECK ("oldEndsAt" > "oldStartsAt"),

  ADD CONSTRAINT "EventChange_new_schedule_valid"
    CHECK ("newEndsAt" > "newStartsAt"),

  ADD CONSTRAINT "EventChange_reason_nonblank"
    CHECK ("reason" ~ '[^[:space:]]');

-- Reservation: valid revision and cancellation details.
ALTER TABLE "Reservation"
  ADD CONSTRAINT "Reservation_booked_revision_nonnegative"
    CHECK ("bookedRevision" >= 0),

  ADD CONSTRAINT "Reservation_cancellation_metadata_valid"
    CHECK (
      (
        "status" = 'CONFIRMED'
        AND "cancelledAt" IS NULL
        AND "cancelledById" IS NULL
        AND "cancellationSource" IS NULL
        AND "cancellationReason" IS NULL
      )
      OR
      (
        "status" = 'CANCELLED'
        AND "cancelledAt" IS NOT NULL
        AND "cancelledById" IS NOT NULL
        AND "cancellationSource" IS NOT NULL
        AND (
          "cancellationSource" = 'SELF_SERVICE'
          OR (
            "cancellationSource" IN ('ADMIN', 'EVENT_CANCELLED')
            AND "cancellationReason" IS NOT NULL
            AND "cancellationReason" ~ '[^[:space:]]'
          )
        )
      )
    );

-- Allow cancelled booking history, but only one confirmed booking.
CREATE UNIQUE INDEX reservation_one_confirmed_per_attendee
  ON "Reservation" ("eventId", "userId")
  WHERE "status" = 'CONFIRMED';

-- EmailJob: valid counters, notification context, and retry metadata.
ALTER TABLE "EmailJob"
  ADD CONSTRAINT "EmailJob_attempt_counts_valid"
    CHECK (
      "attemptCount" >= 0
      AND "retryCycleAttemptCount" >= 0
      AND "retryCycleAttemptCount" <= "attemptCount"
    ),

  ADD CONSTRAINT "EmailJob_change_context_valid"
    CHECK (
      ("type" = 'EVENT_CHANGED') = ("eventChangeId" IS NOT NULL)
    ),

  ADD CONSTRAINT "EmailJob_manual_retry_metadata_valid"
    CHECK (
      ("lastManualRetryById" IS NOT NULL)
      = ("lastManualRetryAt" IS NOT NULL)
    ),

  ADD CONSTRAINT "EmailJob_state_metadata_valid"
    CHECK (
      -- Only pending jobs have a scheduled attempt.
      (("status" = 'PENDING') = ("nextAttemptAt" IS NOT NULL))

      -- Only sent jobs have a sent timestamp.
      AND (("status" = 'SENT') = ("sentAt" IS NOT NULL))

      -- Only processing jobs have a complete processing claim.
      AND (
        (
          "status" = 'PROCESSING'
          AND "claimToken" IS NOT NULL
          AND "claimExpiresAt" IS NOT NULL
        )
        OR
        (
          "status" <> 'PROCESSING'
          AND "claimToken" IS NULL
          AND "claimExpiresAt" IS NULL
        )
      )

      -- Only skipped jobs have skip metadata.
      AND (
        (
          "status" = 'SKIPPED'
          AND "skippedAt" IS NOT NULL
          AND "skipReason" IS NOT NULL
          AND "skipReason" ~ '[^[:space:]]'
        )
        OR
        (
          "status" <> 'SKIPPED'
          AND "skippedAt" IS NULL
          AND "skipReason" IS NULL
        )
      )

      -- Failed jobs require a nonblank error.
      AND (
        "status" <> 'FAILED'
        OR (
          "lastError" IS NOT NULL
          AND "lastError" ~ '[^[:space:]]'
        )
      )
    );