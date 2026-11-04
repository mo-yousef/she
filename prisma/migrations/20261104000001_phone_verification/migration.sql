-- Task 5.5: one-time phone codes for review submission. Additive only.
CREATE TABLE "PhoneVerification" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "consumedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PhoneVerification_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PhoneVerification_bookingId_createdAt_idx" ON "PhoneVerification"("bookingId", "createdAt");

ALTER TABLE "PhoneVerification" ADD CONSTRAINT "PhoneVerification_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;
