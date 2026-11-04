-- CreateTable
CREATE TABLE "StaffDayOff" (
    "id" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "fromDate" TEXT NOT NULL,
    "toDate" TEXT NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StaffDayOff_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StaffDayOff_staffId_idx" ON "StaffDayOff"("staffId");

-- AddForeignKey
ALTER TABLE "StaffDayOff" ADD CONSTRAINT "StaffDayOff_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "StaffMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;
