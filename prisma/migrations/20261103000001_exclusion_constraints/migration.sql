-- Double-booking prevention (requirements §4.1) and search support (§1.1).
-- Run AFTER the initial Prisma migration that creates the tables.
-- Prisma cannot express GiST EXCLUDE constraints, so they are added here.

-- Extensions.
CREATE EXTENSION IF NOT EXISTS btree_gist;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- No two ACTIVE bookings (PENDING/CONFIRMED) for the same staff member may
-- have overlapping time ranges. Cancelled/completed/no-show bookings are
-- excluded by the WHERE clause so a released slot can be rebooked.
ALTER TABLE "Booking"
  ADD CONSTRAINT booking_no_overlap
  EXCLUDE USING gist (
    "staffId" WITH =,
    tstzrange("startsAt", "endsAt") WITH &&
  )
  WHERE (status IN ('PENDING', 'CONFIRMED'));

-- Blocks never overlap each other for the same staff member.
ALTER TABLE "Block"
  ADD CONSTRAINT block_no_overlap
  EXCLUDE USING gist (
    "staffId" WITH =,
    tstzrange("startsAt", "endsAt") WITH &&
  );

-- shortcut: a booking vs block cross-table overlap cannot be enforced by a
-- single EXCLUDE constraint (two tables). The booking orchestrator
-- (lib/booking.ts) re-validates against blocks inside the same transaction, so
-- a block always shows as busy to the availability engine. Revisit if we move
-- blocks into the Booking table as a BLOCK status. Logged in docs/shortcuts.md.

-- Trigram indexes for typo-tolerant search (requirement 1.1 / §8).
CREATE INDEX IF NOT EXISTS business_name_trgm
  ON "Business" USING gin ("name" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS business_tagline_trgm
  ON "Business" USING gin ("tagline" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS service_name_trgm
  ON "Service" USING gin ("name" gin_trgm_ops);
