-- CreateEnum
CREATE TYPE "Role" AS ENUM ('CUSTOMER', 'OWNER', 'STAFF', 'ADMIN');

-- CreateEnum
CREATE TYPE "BusinessStatus" AS ENUM ('DRAFT', 'PENDING', 'PUBLISHED', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "BookingStatus" AS ENUM ('PENDING', 'CONFIRMED', 'COMPLETED', 'CANCELLED_BY_CUSTOMER', 'CANCELLED_BY_BUSINESS', 'NO_SHOW');

-- CreateEnum
CREATE TYPE "BookingSource" AS ENUM ('ONLINE', 'MANUAL');

-- CreateEnum
CREATE TYPE "ReviewStatus" AS ENUM ('VISIBLE', 'HIDDEN', 'FLAGGED');

-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('EMAIL', 'WHATSAPP', 'SMS');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT,
    "email" TEXT,
    "emailVerified" TIMESTAMP(3),
    "phone" TEXT,
    "phoneVerifiedAt" TIMESTAMP(3),
    "role" "Role" NOT NULL DEFAULT 'CUSTOMER',
    "locale" TEXT NOT NULL DEFAULT 'en',
    "image" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "refresh_token" TEXT,
    "access_token" TEXT,
    "expires_at" INTEGER,
    "token_type" TEXT,
    "scope" TEXT,
    "id_token" TEXT,
    "session_state" TEXT,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "sessionToken" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VerificationToken" (
    "identifier" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL
);

-- CreateTable
CREATE TABLE "Business" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tagline" TEXT,
    "about" TEXT,
    "category" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "address" TEXT,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "phone" TEXT,
    "whatsapp" TEXT,
    "website" TEXT,
    "instagram" TEXT,
    "languages" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "brandPrimary" TEXT NOT NULL DEFAULT '#4a2c6d',
    "brandAccent" TEXT NOT NULL DEFAULT '#a98bd6',
    "logoUrl" TEXT,
    "status" "BusinessStatus" NOT NULL DEFAULT 'DRAFT',
    "settings" JSONB NOT NULL,
    "ratingAvg" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "ratingCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Business_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BusinessTranslation" (
    "businessId" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "tagline" TEXT,
    "about" TEXT,

    CONSTRAINT "BusinessTranslation_pkey" PRIMARY KEY ("businessId","locale")
);

-- CreateTable
CREATE TABLE "Photo" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "alt" TEXT NOT NULL DEFAULT '',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Photo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Service" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "durationMin" INTEGER NOT NULL,
    "bufferMin" INTEGER NOT NULL DEFAULT 0,
    "priceCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Service_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceTranslation" (
    "serviceId" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "name" TEXT,
    "description" TEXT,

    CONSTRAINT "ServiceTranslation_pkey" PRIMARY KEY ("serviceId","locale")
);

-- CreateTable
CREATE TABLE "StaffMember" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "userId" TEXT,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'Specialist',
    "photoUrl" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "StaffMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StaffService" (
    "staffId" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,

    CONSTRAINT "StaffService_pkey" PRIMARY KEY ("staffId","serviceId")
);

-- CreateTable
CREATE TABLE "OpeningHours" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "weekday" INTEGER NOT NULL,
    "opensMin" INTEGER NOT NULL,
    "closesMin" INTEGER NOT NULL,
    "closed" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "OpeningHours_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StaffHours" (
    "id" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "weekday" INTEGER NOT NULL,
    "opensMin" INTEGER NOT NULL,
    "closesMin" INTEGER NOT NULL,
    "closed" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "StaffHours_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Closure" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "fromDate" TEXT NOT NULL,
    "toDate" TEXT NOT NULL,
    "reason" TEXT,

    CONSTRAINT "Closure_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Block" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "startsAt" TIMESTAMPTZ(3) NOT NULL,
    "endsAt" TIMESTAMPTZ(3) NOT NULL,
    "reason" TEXT,

    CONSTRAINT "Block_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Booking" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "customerId" TEXT,
    "guestName" TEXT,
    "guestPhone" TEXT,
    "guestEmail" TEXT,
    "note" TEXT,
    "startsAt" TIMESTAMPTZ(3) NOT NULL,
    "endsAt" TIMESTAMPTZ(3) NOT NULL,
    "status" "BookingStatus" NOT NULL DEFAULT 'CONFIRMED',
    "priceCents" INTEGER NOT NULL,
    "source" "BookingSource" NOT NULL DEFAULT 'ONLINE',
    "locale" TEXT NOT NULL DEFAULT 'en',
    "manageTokenHash" TEXT NOT NULL,
    "idempotencyKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cancelledAt" TIMESTAMP(3),
    "cancelReason" TEXT,

    CONSTRAINT "Booking_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Review" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "authorName" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "body" TEXT,
    "ownerReply" TEXT,
    "status" "ReviewStatus" NOT NULL DEFAULT 'VISIBLE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Review_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Favourite" (
    "userId" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Favourite_pkey" PRIMARY KEY ("userId","businessId")
);

-- CreateTable
CREATE TABLE "NotificationLog" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "channel" "NotificationChannel" NOT NULL,
    "template" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "providerId" TEXT,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NotificationLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "actorId" TEXT,
    "businessId" TEXT,
    "action" TEXT NOT NULL,
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Account_provider_providerAccountId_key" ON "Account"("provider", "providerAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "Session_sessionToken_key" ON "Session"("sessionToken");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_token_key" ON "VerificationToken"("token");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_identifier_token_key" ON "VerificationToken"("identifier", "token");

-- CreateIndex
CREATE UNIQUE INDEX "Business_slug_key" ON "Business"("slug");

-- CreateIndex
CREATE INDEX "Business_status_city_idx" ON "Business"("status", "city");

-- CreateIndex
CREATE INDEX "Business_category_idx" ON "Business"("category");

-- CreateIndex
CREATE INDEX "Photo_businessId_sortOrder_idx" ON "Photo"("businessId", "sortOrder");

-- CreateIndex
CREATE INDEX "Service_businessId_active_idx" ON "Service"("businessId", "active");

-- CreateIndex
CREATE INDEX "StaffMember_businessId_active_idx" ON "StaffMember"("businessId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "OpeningHours_businessId_weekday_key" ON "OpeningHours"("businessId", "weekday");

-- CreateIndex
CREATE UNIQUE INDEX "StaffHours_staffId_weekday_key" ON "StaffHours"("staffId", "weekday");

-- CreateIndex
CREATE INDEX "Closure_businessId_idx" ON "Closure"("businessId");

-- CreateIndex
CREATE INDEX "Block_staffId_startsAt_idx" ON "Block"("staffId", "startsAt");

-- CreateIndex
CREATE UNIQUE INDEX "Booking_reference_key" ON "Booking"("reference");

-- CreateIndex
CREATE UNIQUE INDEX "Booking_idempotencyKey_key" ON "Booking"("idempotencyKey");

-- CreateIndex
CREATE INDEX "Booking_businessId_startsAt_idx" ON "Booking"("businessId", "startsAt");

-- CreateIndex
CREATE INDEX "Booking_staffId_startsAt_idx" ON "Booking"("staffId", "startsAt");

-- CreateIndex
CREATE UNIQUE INDEX "Review_bookingId_key" ON "Review"("bookingId");

-- CreateIndex
CREATE INDEX "Review_businessId_status_idx" ON "Review"("businessId", "status");

-- CreateIndex
CREATE INDEX "NotificationLog_bookingId_idx" ON "NotificationLog"("bookingId");

-- CreateIndex
CREATE INDEX "AuditLog_businessId_createdAt_idx" ON "AuditLog"("businessId", "createdAt");

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Business" ADD CONSTRAINT "Business_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusinessTranslation" ADD CONSTRAINT "BusinessTranslation_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Photo" ADD CONSTRAINT "Photo_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Service" ADD CONSTRAINT "Service_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceTranslation" ADD CONSTRAINT "ServiceTranslation_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffMember" ADD CONSTRAINT "StaffMember_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffMember" ADD CONSTRAINT "StaffMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffService" ADD CONSTRAINT "StaffService_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "StaffMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffService" ADD CONSTRAINT "StaffService_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpeningHours" ADD CONSTRAINT "OpeningHours_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffHours" ADD CONSTRAINT "StaffHours_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "StaffMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Closure" ADD CONSTRAINT "Closure_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Block" ADD CONSTRAINT "Block_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Block" ADD CONSTRAINT "Block_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "StaffMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "StaffMember"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Favourite" ADD CONSTRAINT "Favourite_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Favourite" ADD CONSTRAINT "Favourite_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationLog" ADD CONSTRAINT "NotificationLog_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;

