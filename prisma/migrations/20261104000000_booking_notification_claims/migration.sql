-- Cron idempotency claims (task 5.3). Additive, nullable: safe on existing rows.
ALTER TABLE "Booking"
  ADD COLUMN "reminder24SentAt" TIMESTAMP(3),
  ADD COLUMN "reminder2SentAt" TIMESTAMP(3),
  ADD COLUMN "reviewRequestedAt" TIMESTAMP(3);
