# Design — she.cy

How the system is built. References requirement IDs from `requirements.md`.

---

## 1. Architecture overview

Next.js 15 App Router monolith deployed on Vercel, Postgres (Neon/Supabase) via Prisma.
Public pages are React Server Components rendered on the server and cached with ISR +
tag revalidation. Mutations run through Server Actions (CSRF-safe by default). Webhooks
(Twilio status, Resend) and scheduled jobs (reminders, review requests) are Route
Handlers triggered by Vercel Cron.

```
app/[locale]/                 public + account + booking routes
app/[locale]/dashboard/       owner dashboard (role-gated)
app/[locale]/admin/           admin (role-gated)
app/api/                       route handlers: auth, cron, webhooks, og image
lib/                           pure domain logic + infra adapters
  availability.ts              PURE engine (no DB) — the core of §4
  booking.ts                   booking create/reschedule/cancel orchestration (DB + tx)
  db.ts                        Prisma client singleton
  auth.ts                      Auth.js config
  money.ts, slug.ts, time.ts   pure utilities
  tokens.ts                    signed manage-booking tokens (HMAC)
  notify/                      provider interface + resend/twilio adapters
  rate-limit.ts, turnstile.ts  abuse controls
messages/{en,el,ru}.json       i18n catalogues
prisma/schema.prisma, seed.ts
components/                     ui primitives + composed components
```

### Key principle: engine vs orchestration

`lib/availability.ts` is a **pure function**. It receives plain data (settings, service,
staff, hours, closures, blocks, existing bookings) and returns slots. It never touches
the database and never reads the clock except through an injected `now`. This makes DST
and concurrency behaviour fully unit-testable (req 4.2).

`lib/booking.ts` is the **impure orchestrator**: it loads the data, calls the engine to
re-validate, opens a transaction, inserts the booking, and relies on the DB exclusion
constraint as the final arbiter of concurrency (req 4.1).

## 2. Data model (Prisma)

Entities per requirements §7 of the brief. Highlights:

- `Business.settings` is a typed JSON blob validated by a Zod schema
  (`BusinessSettings`): `slotIntervalMin`, `bufferMin` default, `minLeadMin`,
  `maxAdvanceDays`, `cancellationWindowHours`, `autoConfirm`, `maxPerCustomerPerDay`.
- Times: all `timestamptz`. Opening hours stored as minutes-from-midnight local
  (`opensMin`/`closesMin`) + `weekday`, interpreted in Europe/Nicosia.
- `Booking.manageTokenHash` stores a hash; the raw token is only in the signed link.
- `Review.bookingId` is unique → one review per completed booking; "Verified visit"
  derives from the linked booking being COMPLETED.
- Translations: `BusinessTranslation`, `ServiceTranslation` keyed by `(entityId, locale)`.

### Exclusion constraint (concurrency)

Prisma cannot express a GiST exclusion constraint, so a follow-up raw-SQL migration adds:

```sql
CREATE EXTENSION IF NOT EXISTS btree_gist;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

ALTER TABLE "Booking" ADD CONSTRAINT booking_no_overlap
  EXCLUDE USING gist (
    "staffId" WITH =,
    tstzrange("startsAt", "endsAt") WITH &&
  ) WHERE (status IN ('PENDING','CONFIRMED'));

ALTER TABLE "Block" ADD CONSTRAINT block_no_overlap
  EXCLUDE USING gist (
    "staffId" WITH =,
    tstzrange("startsAt", "endsAt") WITH &&
  );
```

Bookings and blocks share a staff timeline; a second constraint or a shared check keeps
a booking from overlapping a block (enforced in the orchestrator by re-validating
against blocks, since the two tables cannot share one EXCLUDE). Documented as a
`shortcut:` if the cross-table guard is left to app-level re-validation.

Indexes: `(businessId, startsAt)`, `(staffId, startsAt)`, `slug` unique, GIN trigram on
`Business.name`, `Business.tagline`, `Service.name`.

## 3. Availability engine (`lib/availability.ts`)

```ts
interface AvailabilityInput {
  now: Date;                       // injected for testability
  timezone: string;                // "Europe/Nicosia"
  settings: BusinessSettings;
  service: { durationMin: number; bufferMin: number };
  staff: StaffAvailabilityInput[]; // id + working hours + days off
  openingHours: OpeningHour[];
  closures: DateRange[];
  bookings: BusyInterval[];        // active bookings per staff
  blocks: BusyInterval[];          // per staff
  fromDate: Date; days: number;    // window to compute
}
function computeAvailability(input): DayAvailability[]  // slots per day per staff
function pickStaffForSlot(...): staffId                 // least-booked-first
```

Algorithm per day:
1. Convert the local day boundaries to UTC via date-fns-tz (DST-correct).
2. If the weekday is closed or the date is in a closure, return no slots.
3. For each staff member, intersect business hours with staff hours; step by
   `slotIntervalMin` from open; a candidate at `t` is valid when
   `t + duration + buffer <= close`, `t >= now + minLead`, `t <= now + maxAdvance`, and
   `[t, t+duration+buffer)` does not overlap any busy interval for that staff.
4. Aggregate per day; a slot is offered if >=1 staff is free (respecting the chosen
   staff filter or "Any available").

Tested with Vitest: normal day, lead-time cutoff, buffer at close, fully booked, closed
day, and both DST transitions for Europe/Nicosia (spring forward late March, fall back
late October) — req 4.2 and acceptance criterion 10.

## 4. Booking orchestration (`lib/booking.ts`)

`createBooking(input)`:
1. Zod-validate input; verify Turnstile (guest); check rate limit (IP + phone).
2. Load business/service/staff/hours/closures/blocks + active bookings.
3. Re-run `computeAvailability` and assert the requested slot is still offered
   (req 3.1, 4.1). Resolve "Any available" via `pickStaffForSlot`.
4. In a transaction: insert booking with `tstzrange` → DB exclusion constraint is the
   final guard. Catch the 23P01 exclusion violation → return `SLOT_TAKEN`.
5. Generate `SC-XXXXX` reference + manage token; enqueue notifications.
6. Idempotency: a key derived from (business, service, staff, slot, email/phone) stored
   with a short TTL prevents duplicate submits.

`rescheduleBooking` re-runs availability excluding the booking's own interval.
`cancelBooking` checks the cancellation window, sets the state, releases the slot
(status change drops it out of the partial exclusion constraint), notifies.

## 5. Auth and authorisation

Auth.js v5 with Prisma adapter, email (Resend magic link) + Google. `role` on the
session. A `requireOwner(businessId)` guard loads the business and asserts
`ownerId === session.user.id` (or ADMIN) at the top of every owner Server Action
(req 5.1). Staff see only their own schedule. Manage-booking links carry a signed HMAC
token (req 3.2) verified without a session.

## 6. i18n

next-intl middleware for locale-prefixed routing, default `en`. `messages/*.json` hold
every string; a `scripts/check-messages.ts` compares key sets across locales and exits
non-zero on a mismatch (req 8, CI). Dates/numbers via `Intl` with the locale mapped to
en-GB/el-GR/ru-RU. Owner content translations fall back to the business default.

## 7. Design system

Tailwind v4 with CSS-variable tokens in `app/globals.css`: Apple text scale, semantic
light/dark colours, radii and spacing per the apple-design steering. Per-business
`--b1`/`--b2` injected via inline style on the business page root; contrast validated at
save with a WCAG ratio helper. shadcn/ui provides Dialog/Sheet/Tabs/Select/Calendar/
Toast; custom-built: date strip, slot grid, stepper, dashboard calendar grid (CSS grid).
Translucency only on nav layers with `@supports` + `prefers-reduced-transparency`
fallbacks.

## 8. Notifications

`lib/notify/index.ts` defines `Notifier` (`sendEmail`, `sendMessage`). Adapters:
`resend.ts`, `twilio.ts` (WhatsApp template with SMS fallback). Templates are React
Email + i18n strings. Cron Route Handlers (`/api/cron/reminders`,
`/api/cron/review-requests`) scan due bookings and dispatch, logging to
`NotificationLog`. Secured with a cron secret header.

## 9. Security

Zod everywhere; Server Actions for CSRF safety; secure/httpOnly cookies; `rate-limit.ts`
(in-memory dev, Upstash/Vercel KV prod) keyed by IP and phone; Turnstile on guest
booking; upload MIME+size validation; no raw HTML (render user text as plain). GDPR:
`/account` export (JSON) and delete (soft-delete + anonymise PII) actions; retention job.

## 10. Testing + CI

- Vitest: availability engine (mandatory, incl. DST), money, slug, token, booking
  validation.
- Playwright: guest booking happy path, reschedule, cancel, owner edits a service and
  it appears on the public page, concurrency (two parallel confirms → exactly one wins).
- GitHub Actions: install → lint → typecheck → unit → (build) → e2e, plus the
  message-key check.

## 11. Phasing

Maps 1:1 to brief §15 and is enumerated in `tasks.md`.
