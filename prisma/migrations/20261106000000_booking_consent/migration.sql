-- GDPR consent capture (task 7.2). Additive and nullable: manual bookings and rows created
-- before this migration have no consent timestamps.
ALTER TABLE "Booking" ADD COLUMN "consentTermsAt" TIMESTAMP(3),
ADD COLUMN "consentMessagesAt" TIMESTAMP(3),
ADD COLUMN "consentVersion" TEXT;
