# Decisions

Short log of choices that are expensive to reverse. Newest first.

## 2026-11-06 — Owner calendar, manual bookings, blocks (task 6.2)

- One write-side guard for everything that takes staff time: `lib/booking-lock.ts`
  (`lockStaff` = `SELECT ... FOR UPDATE` on sorted StaffMember ids, `hasConflict` = active
  bookings + blocks). Online booking, manual booking and block creation all use it, so a block
  and a booking for the same staff serialise. DB constraints still back it (`booking_no_overlap`,
  `block_no_overlap`; 23P01 maps to OVERLAP). No new migration.
- Overlap policy: an owner may book outside opening hours / lead time (walk-ins), never over
  another active booking or block (service buffer counts). A block over a booking is rejected
  whole with the conflicting dates (no PII); the owner resolves the booking first.
- Recurring blocks: expanded to rows at creation (`lib/block-expansion.ts`), each occurrence
  from its own local date via `zonedWallTimeToUtc`, so the local start time survives DST.
- Calendar positions are wall-clock minutes (`lib/calendar-layout.ts`), same unit as opening
  hours; never "minutes since a 24h day start".
- Status rules live in `lib/booking-status.ts`; `changeBookingStatusCore` is generic for 6.3.
- Owner-initiated notices skip the owner copy: `sendBookingNotice(..., { skipBusiness: true })`.
  Manual bookings notify the customer by email only.
- Manual booking double submit: client nonce -> `idempotencyKey` `manual:{businessId}:{nonce}`.

## 2026-11-04 — Cached next-available slot (task 2.3)

- Card "next slot" comes from `getNextSlotIso(businessId)` (`lib/availability-cache.ts`),
  an `unstable_cache` entry keyed by business id + Nicosia date, revalidate 180s, tag
  `business:{id}:availability` (`availabilityTag()` in `lib/next-slot.ts`). Owner edit
  flows and booking create/cancel must call `revalidateTag(availabilityTag(id))` (task 6.9, 4.3).
- Representative service = cheapest active one, staff limited to those linked to it.
  Cache is per instance-agnostic data cache; a stale slot is harmless because booking
  re-validates server-side.

## 2026-11-03 — Foundation

- **ORM: Prisma** (matches the data-model outline; `btree_gist` exclusion constraint
  added via a raw-SQL migration since Prisma has no native type for it).
- **Package manager: pnpm** (spec references `pnpm seed`).
- **Timezone: Europe/Nicosia** is the single business wall-clock. Store everything in
  UTC (`timestamptz`), convert at the edges with `date-fns-tz`.
- **Money: integer cents, EUR.** Format with `Intl.NumberFormat`.
- **i18n: next-intl**, locales en/el/ru, locale-prefixed routes, default `en`.
- **Availability engine is a pure function** (`lib/availability.ts`) with no DB access,
  so it is unit-testable and the DB layer only feeds it data + persists results.
- **Double-booking safety is enforced at the database**, not just in app code:
  a Postgres exclusion constraint on `tstzrange` per staff member. App code catches the
  constraint violation and returns a friendly "that time was just taken".
- **Skills (section 16) are implemented as steering files**, not installed via
  `npx skills`, because that installer is not part of this environment. The substance
  (Apple/HIG design rules, Ponytail discipline, terse replies) lives in
  `.kiro/steering/`.

## 2026-11-03 — Dependency safety

- **Next bumped 15.0.3 → ^15.5.4** (resolved 15.5.28): 15.0.3 carries
  CVE-2025-66478. React pinned to stable **19** (not the RC) to match Next 15.5.
- Build verified: `next build` green, 12 static pages across en/el/ru, middleware
  compiled, typecheck clean, 19 unit tests pass.

## Environment constraints

- Shell rule denies `node *`; pnpm not yet installed. Until relaxed, code is written
  but not executed here. Verification commands are documented in `README.md`.

## 2026-11-03 — Phase 1 Ponytail review

Read the foundation code (not just diffs). Findings:

1. **Booking vs block cross-table overlap** — what: two separate EXCLUDE constraints
   (Booking, Block) can't guard a booking landing on a block. Goes wrong: a race could
   let a booking overlap a manual block. Fix: re-validate against blocks inside the
   booking transaction (lib/booking.ts, phase 4). If skipped: rare owner-block vs
   online-booking clash. Tracked in docs/shortcuts.md.
2. **Ambiguous local time on fall-back** — what: zonedWallTimeToUtc picks one instant
   for the repeated 03:00–04:00 hour. Goes wrong: nothing in practice — businesses open
   at 09:00, so the ambiguous hour is never a slot start. If skipped: n/a. Documented in
   lib/time.ts.
3. **Reference collision** — what: SC-XXXXX is 32^5 ≈ 33M combos with a unique column.
   Goes wrong: astronomically rare duplicate insert fails. Fix: caller retries on unique
   violation (phase 4 booking orchestrator). If skipped: one failed booking, user
   retries.
4. **Placeholder pages** marked with `shortcut:` (search, for-business) — intentional,
   replaced in phases 2 and 6.

No must-fix blockers for phase 1. Built the minimum: no state library, no formatting
library (Intl), no date library beyond date-fns(-tz), CSS-only theming, Postgres-native
concurrency + search. Every dependency justified in package.json intent.

## 5.2 Email/phone templates

- Content is data (`lib/notify/templates/content.ts`); one `BookingLayout` renders it; phone bodies come from the same content. Copy: `messages/*.json` → `emails`, rendered with `createTranslator` (no request context; throws on missing keys).
- Dependencies: `@react-email/components` 1.0.12 + `@react-email/render` 2.2.0 (project convention names React Email).
- Reschedule now ALWAYS re-issues the manage token. The raw token is not stored, so notices/reminders rebuild it with `manageTokenFor(id, endsAt)`; that only matches the stored hash if the hash follows the current `endsAt`. `needsNewToken`/`tokenExpiry` in `lib/manage-policy.ts` are now unused by the app (still unit-tested).
- Review-request route contract for 5.5: `/{locale}/b/{slug}/review/{reference}?t={manageToken}` (same token as manage; verify with `verifyManageToken` against `manageTokenHash`).
- Vitest uses `esbuild.jsx: 'automatic'` because tsconfig keeps `jsx: preserve` for Next.


## 5.4 NotificationLog + provider status webhooks
- Audience: `NotificationLog` has no audience column (no migration). `recordResult` suffixes
  the template with `:business` for the business-facing send on reschedule/cancel
  (`booking-cancelled:business`); the creation notice already has its own kind
  (`booking-new-business`), so it is left unsuffixed. Mapping lives in `lib/notify/status.ts`
  (`audienceTemplate`).
- Status model: our own strings, never provider text. Rank (low -> high), see
  `lib/notify/status.ts`: `INVALID_RECIPIENT/RATE_LIMITED/PROVIDER_ERROR/NOT_CONFIGURED` (0) <
  `QUEUED` (1) < `SENT` (2) < `DELIVERED` (3) < `READ` (4) < `FAILED/UNDELIVERED/BOUNCED` (5) <
  `COMPLAINED` (6). A webhook only raises a row's rank (`applyProviderStatus`, atomic
  `updateMany` scoped to lower-rank rows), so a late 'sent' never regresses 'delivered', and a
  failure/complaint stays once set even if a 'delivered' arrives after.
- `recordResult` (`lib/notify/booking-notices.ts`) is now `async` and awaited at both call
  sites (immediate notices + reminders), so the write finishes before `after()`/cron returns.
  It never throws (`recordNotification`/`applyProviderStatus` catch everything, log the error
  name only).
- Webhooks: `app/api/webhooks/twilio` and `app/api/webhooks/resend`, both `nodejs` runtime,
  `force-dynamic`, read the raw body once before verifying, Zod-validate after. Logic lives in
  `lib/notify/webhooks.ts` as pure `(input) -> {status, body}` functions so Playwright can test
  them without HTTP (route files are thin). Twilio: `twilio.validateRequest` against
  `NEXT_PUBLIC_SITE_URL + /api/webhooks/twilio` (must be the exact public origin Twilio called;
  behind a proxy `req.url` would be internal, so the URL is built from env, not the request).
  Resend: `resend.webhooks.verify()` (Svix HMAC-SHA256, 5 min tolerance) — the SDK call needs a
  non-empty API key argument but never uses it for webhook verification. Both fail closed
  (403) if their secret/token is unset or the signature does not check out; unknown provider
  ids answer 200 (no retry storm) and change nothing.
- Twilio status callback: passed per-message (`statusCallback` in `messages.create`) rather
  than configured once in the console, gated to `https` + non-localhost
  `NEXT_PUBLIC_SITE_URL` (`twilioStatusCallback` in `lib/notify/twilio.ts`) so dev/test sends
  never try to call out. Simpler than a second place (Twilio console) to keep in sync.
- Env: added `RESEND_WEBHOOK_SECRET` to `.env.example`. Configure in Resend dashboard → Webhooks
  → endpoint `${NEXT_PUBLIC_SITE_URL}/api/webhooks/resend`, events `email.sent`,
  `email.delivered`, `email.delivery_delayed`, `email.bounced`, `email.complained` (opened/clicked
  not subscribed — no tracking). Twilio needs no new env; the callback URL is sent in code.
- Not verified: no real Twilio/Resend callback was received in this environment (no public
  https URL during review) — only the exact signed-request shapes from each SDK's own verify
  function, exercised in `lib/notify/webhooks.test.ts` and `e2e/notification-log.spec.ts`.

## 5.5 Reviews: OTP, submission, owner replies

- OTP storage: new additive model `PhoneVerification` (migration `20261104000001_phone_verification`), not Auth.js `VerificationToken`: that model has no attempts column and an in-memory counter would not hold across serverless instances. Only an HMAC of the code (bound to the booking id) is stored.
- OTP rules: 6 digits from `crypto.randomInt`, 10 min expiry, 5 guesses (counted by a guarded atomic increment before comparing), single use, new code voids the old one, 60 s resend cooldown and 3 sends/hour per booking (from persisted rows), plus per-IP limits via `lib/rate-limit.ts`. Secret: `OTP_SECRET`, falling back to `MANAGE_TOKEN_SECRET`.
- Delivery goes to `Booking.guestPhone` (WhatsApp, SMS fallback), so the reviewer proves control of the number that booked. Dev-only hatch: with `NODE_ENV=development` and no Twilio keys the code is printed to the server console (`shortcut:` in `lib/review-verification.ts`); never in production/test.
- Proof of verification: HMAC-signed receipt `{bookingId, exp}` (15 min) held in the form's state and re-checked by `submitReview`; no DB state for guests. A signed-in customer whose `User.phone` equals the booking phone and has `phoneVerifiedAt` skips the OTP; a successful OTP sets `phoneVerifiedAt` only for the booking's own customer (and only if their phone is empty or equal).
- Submission: manage token re-verified in each action, booking must be COMPLETED, 30-day window (`REVIEW_WINDOW_DAYS`; the manage token also expires 30 days after the end, so the window is effectively the token's life), one review per booking (unique `bookingId`, P2002 -> `ALREADY_REVIEWED`). Author name is derived from `guestName` (first name + initial), never typed. Status VISIBLE by default.
- Rating aggregates: `recomputeBusinessRating` (`lib/review-rating.ts`) recomputes avg/count from VISIBLE reviews inside the same transaction, after `lockBusiness` (row lock) so concurrent writers cannot drift. 6.8 (hide/show) and 7.1 (moderation) must call both.
- Owner replies: `lib/review-reply.ts`. Role is re-read from the DB; allowed only for OWNER/ADMIN who own the review's business (`canReplyToReview`). Staff and other owners get FORBIDDEN. Audit rows `review.reply` / `review.reply.remove` hold the review id only. `OwnerReplyForm` is mounted on the dashboard reviews page (6.8).

## 6.1 Onboarding wizard, owner auth, publish checklist

- **Submit = DRAFT -> PENDING, not PUBLISHED.** 7.1 lists "businesses approve/suspend", so approval is
  intended; PENDING -> PUBLISHED belongs to the admin. `submitForReviewCore` recomputes the checklist from
  the DB on a row-locked business; the client only triggers it. Unpublish landed in 6.8 (Settings).
- **Role upgrade:** a signed-in CUSTOMER who saves wizard step 1 gets a DRAFT `Business` and role OWNER in one
  transaction (user row locked, so a double submit reuses the first business). ADMIN keeps ADMIN. STAFF cannot
  self-onboard (`NOT_ALLOWED`). Audit rows: `business.create`, `user.role.owner`.
- **Authorisation:** `lib/owner-auth.ts` `assertOwnsBusiness(userId, businessId)` (role OWNER/ADMIN read from the
  DB AND `Business.ownerId === userId`; missing and foreign businesses both answer FORBIDDEN). Cores start with
  it and return result codes. `requireOwnerBusiness` lives in `lib/owner-session.ts` (not `owner-auth.ts`) so
  the DB-only helpers stay importable from Playwright without the Auth.js chain. Server actions never take a
  business id from the client; it is derived from the signed-in owner.
- **Audit + revalidation helpers:** `lib/audit.ts` `writeAudit(entry, client?)` (ids/field names only, usable in
  a transaction) and `lib/revalidate-public.ts` `revalidateBusinessPublic({id, slug})` (paths for all locales +
  home + search + `availabilityTag`). 6.2-6.8 call both after a successful core; 6.9 audits coverage.
- **Checklist staff rule:** the staff item counts only active staff linked to an active service (unlinked staff
  are not bookable). Pure function `publishChecklist` in `lib/publish-checklist.ts`.
- **Wizard is DB-saved per step** at `/{locale}/onboarding?step=basics|location|hours|services|review`, outside
  the dashboard layout (a user with no business must reach it). The dashboard layout redirects owners without a
  business there.
- **Sign-in:** Nodemailer provider unchanged; with `NODE_ENV=development` and no `RESEND_API_KEY` the magic link
  (URL only) is printed to the server console. Look for `[dev] Magic sign-in link:` in the `pnpm dev` output.
- `CITIES`/`CATEGORIES` moved to `lib/catalogue.ts` (re-exported from `lib/search.ts`) so pure code can use them
  without importing Prisma/Next.

## Task 6.3 — Bookings table (owner dashboard)

- **One status action, one details body:** the table reuses `changeBookingStatus` (app/actions/calendar.ts),
  `changeBookingStatusCore`, `ConfirmSheet` and `FormSheet`. The booking details body + status buttons were
  extracted from `calendar-grid.tsx` into `components/calendar/booking-details.tsx` (also exports `STATUS_STYLE`,
  the icon + border-style status convention). Status, detail and error wording stays in the `calendar` namespace
  (one key per concept); only table/filter/empty-state copy is in the new `bookings` namespace. The action now also
  revalidates `/[locale]/dashboard/bookings`.
- **Filters are a plain GET form + Links** (status chips, date range, staff, search, sort). Works without JS,
  URL-shareable, any filter change returns to page 1. Params are parsed in `lib/bookings-params.ts`; invalid values
  are dropped. `Upcoming` = PENDING/CONFIRMED starting from now (a "from" date can only narrow it).
- **Sort:** "Date" is soonest-first for Upcoming and newest-first for every history view (otherwise page 1 of
  Completed would be the oldest visit). "Newest booked" sorts by `createdAt` desc. `id` is the tiebreaker.
- **Search:** Prisma `contains` + `mode: insensitive` (parameterised ILIKE) on name and reference, plus a
  digits-only match on `guestPhone` for phone-like input. Always AND-ed with `businessId`. `%`, `_` and `\` are
  escaped (`escapeLike`) because Prisma does not. No trigram index: per-business row counts are small and the
  existing `(businessId, startsAt)` index narrows the scan first. No migration.
- **Pagination:** offset, 20 per page, page clamped to the last page. Cursor paging is not worth it at this scale.
- **Mobile layout:** a real `<table>` from `lg`; below that, rows render as cards (both lists are in the DOM,
  one is `display: none`). No horizontal scroll.
- **Empty states:** three, chosen server-side: never booked (link to public page when PUBLISHED), nothing upcoming
  (link to "All"), filters match nothing (Clear filters).

## Task 6.4 — Services CRUD

- **Cores:** `lib/services.ts` (create/update/setActive/move/delete + page loader), `lib/services-schema.ts`
  (zod + pure `decideDelete`, `moveWithinCategory`, `parseServicePrice`), thin wrappers in `app/actions/services.ts`
  (revalidate public page + dashboard services/calendar/bookings). Result codes: UNAUTHENTICATED | FORBIDDEN |
  VALIDATION(+field errors) | NOT_FOUND | HAS_FUTURE_BOOKINGS(+count) | UNKNOWN. Another owner's service id is
  NOT_FOUND (own business id) or FORBIDDEN (their business id); staff ids must belong to the business.
- **Price:** 0 to €5,000.00; a FREE service (0) is allowed (`parseServicePrice` wraps `parseEuroToCents`, which
  rejects 0 for onboarding). Duration 5..480 step 5; buffer 0..120.
- **Staff rule:** a VISIBLE service needs >= 1 ACTIVE eligible staff (`staffRequired`); a HIDDEN one may have none.
  Showing a service re-checks the rule. Eligibility save replaces links to ACTIVE staff only (links to inactive
  staff, not shown in the form, are kept). Hiding the last visible service / a visible service with no active staff
  is never blocked; a PENDING/PUBLISHED listing gets a visible warning (banner, per-row note, result `warnings`).
- **Delete = three outcomes** (Booking.serviceId is RESTRICT): future PENDING/CONFIRMED booking -> refuse with
  `HAS_FUTURE_BOOKINGS` + count (UI offers Hide); only history -> ARCHIVED (active=false, row kept, UI says it was
  hidden); no bookings -> hard delete (translations/StaffService cascade) and sortOrder is re-densified. Check and
  delete run in one transaction with `SELECT ... FOR UPDATE` on the Service row (a booking insert holds a KEY SHARE
  lock through its FK, so the two serialise). A P2003 that still slips through is caught and the decision re-run.
  `createBookingRecord` now maps a P2003 (service deleted mid-booking) to `VALIDATION` instead of throwing.
- **Reorder:** Move up/down swaps with the nearest same-category neighbour; the whole business is rewritten 0..n-1
  inside a locked transaction (no unique index, ties heal). New services get max+1.
- **Hidden services:** public page, booking stepper, `loadAvailabilityInput`, `createBookingRecord`, search cards and
  the cached next-slot all filter `active: true` (verified by grep; e2e asserts the loader returns null and a new
  booking is VALIDATION). Booking readers (bookings table, calendar events, manage, notices) read service by id with
  no active filter, so existing bookings keep rendering.
- **Translations (req 8):** in scope. Optional el/ru name+description per service (en = base fields); empty fields
  delete the row/fall back per field via `lib/localized-service.ts`. Now read by the public business page and the
  booking stepper service step (notices already read them). Not wired: manage/confirmation pages, search matching.
- **onboarding `saveFirstServiceCore`** is unchanged: it still edits the first service by sortOrder (and sets it
  active). It never creates a second service, so it cannot duplicate services made here.
- Audit actions: `service.create|update|hide|show|delete|archive|move`, meta = `{ serviceId, fields | direction }`.
## Task 6.5 — Team CRUD, staff hours, days off
- **Cores:** `lib/team.ts` (create/update/setActive/move/delete, add/removeDayOff, page loader), `lib/team-schema.ts`
  (zod + pure `checkStaffHours`, `outsideBusinessWeekdays`, `copyToAllDays`, `checkDayOffRange`), thin wrappers in
  `app/actions/team.ts`. Result codes: UNAUTHENTICATED | FORBIDDEN | VALIDATION(+field errors) | NOT_FOUND |
  HAS_FUTURE_BOOKINGS(+count) | HAS_BOOKINGS(+count, <=10 local dates) | UNKNOWN. Staff, service and day-off ids are
  always resolved through the owner's business (another business's id is NOT_FOUND). Audit actions
  `staff.create|update|activate|deactivate|move|delete|archive|dayoff.add|dayoff.remove`, meta ids + field names only.
- **Hours override:** all 7 `StaffHours` rows, or none (inherit). The engine treats a missing weekday as "not working"
  and uses the staff window ALONE, so the server requires each custom day to lie WITHIN that weekday's business
  window, and a business-closed day cannot be open for staff (field error `hours.<weekday>` / `hours` =
  `outsideBusinessHours`). An all-closed override is rejected (`allClosed`): deactivate or use days off instead.
- **Days off:** new table `StaffDayOff` (inclusive local `YYYY-MM-DD` text keys, mirroring `Closure`). `expandDaysOff`
  turns ranges into the engine's `daysOff` keys, clipped to the loader horizon. Wired into `loadAvailabilityInput`
  (booking page, create, reschedule), the cached `getNextSlotIso`, the dashboard calendar (column renders closed) and
  the slot grid. Rules: to >= from, <= 366 days, not entirely in the past, one range per submit.
- **Bookings policy:** a day off over a future PENDING/CONFIRMED booking is refused (`HAS_BOOKINGS`), as are
  deactivate/delete with a future booking (`HAS_FUTURE_BOOKINGS`). Checks and writes run under the `StaffMember`
  row lock (`lockStaff`). Online booking and reschedule re-check `staffBookableOn` (active and not on a day off) AFTER
  taking the lock, so a day off or deactivation committed after their pre-lock availability read cannot be missed.
  `loadAvailabilityInput` now returns null for a named staff id that is inactive or not eligible.
- **Delete = three outcomes** (Booking.staffId is RESTRICT): future active booking -> refuse; history only -> ARCHIVED
  (active=false, row kept); none -> hard delete (links, hours, days off, blocks cascade) and sortOrder re-densified.
  Reuses `decideDelete` and the P2003 retry from services. Lock order: Business, then StaffMember.
- **Reorder:** same dense rewrite as services, reusing `moveWithinCategory` with a constant category.
- **Services rule:** saving or deactivating a member that leaves a visible service without an active provider is
  allowed, with a non-blocking warning (`SERVICE_WITHOUT_STAFF` / `NO_ACTIVE_STAFF`) plus a per-row "only provider" note.
- **Migration:** `20261105000000_staff_days_off` (additive).
## Task 6.6 — Hours editor, holidays and closures
- **Cores:** `lib/business-hours.ts` (`saveBusinessHoursCore`, `addClosureCore`, `removeClosureCore`, page loader), pure rules in
  `lib/hours.ts` (`clampStaffHours`, `isOpenNow`, `countOutsideHours`, `copyToAllDays`, moved here from team-schema and
  re-exported) and `lib/hours-schema.ts` (`checkBusinessHours`, closure schema/range, caps). Thin wrappers in
  `app/actions/hours.ts`. Result codes: UNAUTHENTICATED | FORBIDDEN | VALIDATION(+field errors) | NOT_FOUND | HAS_BOOKINGS
  (count + <=10 local dates) | UNKNOWN. Audit: `business.hours`, `staff.hours.clamp` (staff ids), `closure.add|remove`
  (closure id); never reason text or times.
- **Weekly hours:** all 7 `OpeningHours` rows are always upserted; one window per day. An all-closed week is allowed and
  returns a non-blocking `NO_OPEN_DAYS` warning for PENDING/PUBLISHED listings (the publish checklist still requires one
  open day to submit). `saveHoursCore` (onboarding) is unchanged and uses the same `validateWeek`.
- **Staff overrides vs shrinking business hours (resolves the 6.5 deferred item):** the engine uses a staff window alone,
  so on save every staff override is CLAMPED to the intersection with the new business window in the same transaction
  (business-closed day or empty intersection -> the staff day becomes closed). Staff rows are locked first. Widening
  business hours never widens a staff override. The result carries `adjustedStaff` for the UI message. A clamp can leave a
  member with every day closed; they stay active but unbookable (the owner sees the adjusted count and can edit them).
- **Existing bookings:** a weekly hours change never touches bookings and is not blocked; the result reports
  `outsideBookings` (upcoming PENDING/CONFIRMED whose local weekday/minutes no longer fit; DST-safe via lib/time) as a
  warning. A NEW closure over upcoming active bookings is refused (`HAS_BOOKINGS`), checked and written under the row locks
  of ALL the business's staff. Local-midnight bounds, as for day-offs.
- **Closures honoured everywhere** (gaps found and fixed): `isOpenNow` is now ONE helper in `lib/hours.ts` (weekly hours +
  closure days, Europe/Nicosia) used by the public page badge and the search "open now" filter/card (both previously ignored
  closures and duplicated the logic); `staffBookableOn` (the post-lock re-check used by online booking and reschedule) now
  also rejects a business closure committed after the pre-lock availability read. Engine, booking page, availability cache
  and dashboard calendar already honoured closures.
- **Public page:** the hours card adds "Closed on <dates>" for closures starting within 14 days (date range only, the reason
  stays private).
- **Migration:** none.

## 6.7 — Brand colours and profile text
- Contrast rule (`lib/brand.ts`, server `saveBrandCore` + live in the picker): main colour >= 4.5:1 against white. That one
  inequality covers white text on `--b1` (header, buttons, selected) and `--b1` as text on white; `--b1-contrast` therefore
  stays a constant white and no per-business contrast token is needed. Dark mode lightens `--b1` into `--b1-text`.
- Accent: only ever blended at 35% (`ACCENT_WEIGHT`), so `mixColors(primary, accent, 0.35)` must also be >= 4.5:1 against
  white. The public header does NOT mix the accent (3.6 audit); the OG image now ends on that same blend and falls back to
  platform defaults if stored colours fail the check.
- Failures return the computed ratio and a darker suggestion (HSL lightness steps, hue kept). Hex is normalised to `#rrggbb`.
- Translations: `BusinessTranslation` el/ru for tagline and about, per-field fallback to the base (`localizedBusinessText`),
  row deleted when both are empty. Slug never changes on rename. Audit meta: changed field NAMES only.
- Seed accents `#8cc7d9` and `#d9b98c` failed the blend rule (3.77 and 4.49); changed to `#43a4c1` and `#d8b788`.
## 6.7 part 2 — Photos and uploads
- **Cover = first photo by sortOrder.** No `isCover` column, no migration. Search cards, favourites and the public page all
  read the first photo by `sortOrder`; "Set as cover" moves a photo to position 0. Order is dense (0..n-1), rewritten under
  the Business row lock (the same lock `add` takes for the quota, so parallel adds cannot exceed 12).
- **Upload mechanism: Cloudinary signed direct browser upload, no SDK.** `createUploadSignature` (after auth, ownership and a
  quota pre-check) signs `allowed_formats`, `folder=she/<businessId>`, `timestamp` (SHA-1, documented scheme, unit-tested
  against the Cloudinary example vector). The browser POSTs the file to Cloudinary, then calls `addPhoto`. The API secret
  stays server-side.
- **Trust model.** The server never trusts the client URL: `isTrustedPhotoUrl` accepts only `https://res.cloudinary.com/<our
  cloud>/image/upload/[one transformation|v123/]she/<this business>/<name>.<jpg|jpeg|png|webp>` (no userinfo, port, query,
  fragment, backslash, percent-encoding or dots in folders). Client-reported `format`/`bytes` are an advisory second line.
- **What Cloudinary must enforce (console; menu names not verified here, check the current UI):** (1) only signed uploads
  (no unsigned upload preset); (2) allowed image formats limited to jpg, jpeg, png, webp (no svg, gif, pdf); (3) a maximum
  image file size of about 5 MB in the account/upload-preset limits; (4) uploads go to `she/<businessId>` (the signature
  forces the folder); (5) optionally a moderation add-on. The signed `allowed_formats` is enforced per upload, but file size
  is not a signed parameter, so the account/preset limit is the real size gate.
- **Not configured:** with any `CLOUDINARY_*` var missing, the section shows a translated notice and no Add button; reorder,
  alt text and delete still work, and `addPhoto` answers `NOT_CONFIGURED`.
- **Public pages:** no change. Checklist photo item now links to `/dashboard/profile#photos`.
- **Migration:** none.


## 6.8 — Reviews management, booking rules, unpublish
- **Review visibility (one constant, `lib/review-visibility.ts`):** the public sees and the aggregate counts `VISIBLE` + `FLAGGED`.
  An owner REPORT sets `FLAGGED` ("reported, pending admin review") and hides nothing, so reporting cannot suppress a bad
  review. Only `HIDDEN` (admin-only, 7.1) removes a review everywhere. Used by: public page query + distribution,
  `recomputeBusinessRating` (so cards/search via `Business.ratingAvg`), the dashboard summary, seed. 7.1 moves FLAGGED -> HIDDEN
  or back to VISIBLE under `lockBusiness` + `recomputeBusinessRating` (tested directly).
- **Reports** (`lib/review-manage.ts`): VISIBLE -> FLAGGED only; already FLAGGED is an idempotent success; HIDDEN is NOT_ALLOWED;
  cross-tenant id is NOT_FOUND; max 5 open (FLAGGED) reports per business (`LIMIT_REACHED`), counted under the Business row lock.
  Reason = fixed code (spam, offensive, not_customer, other), stored only in audit `review.flag` `{reviewId, reason}` (no column,
  no migration). No owner email, appeal or bulk action.
- **Unpublish** (`unpublishCore`): PUBLISHED|PENDING -> DRAFT under the Business row lock; DRAFT/SUSPENDED -> NOT_ALLOWED (SUSPENDED
  is admin-only). Allowed with upcoming bookings (the confirmation shows the count). Existing bookings stay valid; the manage
  link and notices keep working (`loadConfirmedBooking` does not require PUBLISHED; only the reschedule picker does). New online
  bookings stop: `createBookingRecord` requires PUBLISHED before AND re-checks inside the transaction. Public page 404s, sitemap
  and search list PUBLISHED only. Re-publish = normal submit for review.
- **Settings effects (all verified in `e2e/manage-settings.spec.ts`):** autoConfirm (CONFIRMED vs PENDING), slotIntervalMin,
  minLeadMin, maxAdvanceDays (engine and create path), cancellationWindowHours (manage policy), maxPerCustomerPerDay (now enforced:
  `DAILY_LIMIT`). Write bounds are tighter than the read schema (`lib/settings-schema.ts`); saving merges into the JSON, keeps
  unknown keys and never touches existing bookings. The audit holds changed field names only.
- **maxPerCustomerPerDay:** counts ACTIVE bookings of the business on that Nicosia day by account id, email (case-insensitive) or
  phone, inside the booking transaction. An advisory transaction lock per (business, identity, day) makes it race-safe across
  different staff (the staff lock alone is per staff). Idempotent retries are answered before the check.
- 6.9: owner revalidation sets live in `lib/owner-effects.ts` (surfaces as data, injectable revalidator for tests). Booking-level owner
  changes (manual booking, block, status) revalidate only `availabilityTag` plus dashboard pages; the public page shows no per-booking data.
  `revalidateBusinessPublic` also revalidates the OG image route. Audit + change must share one transaction (block delete, status change fixed).
  See docs/owner-actions-audit.md.
- 6.10 (owner e2e in a browser): **auth in e2e** = a `Session` row + `authjs.session-token` cookie (`e2e/auth.ts`), because
  `lib/auth.ts` uses `session.strategy: 'database'` (not JWT). Test-only; nothing in product code knows about it. The real sign-in
  page has its own test (invalid email error, valid email reaches "check your email" with no mail: dev prints the link to the server console).
- 6.10 **server mode = `next dev`** (the existing webServer), not `next build && next start`. Reasons: the public business page calls
  `auth()` (favourites), so it is dynamic in production too and has no static/ISR copy that could go stale; production would make
  Turnstile fail closed for the guest booking in B6 and drop the dev magic-link print the sign-in test relies on. So dev proves the
  edit -> next load behaviour; the only truly cached piece (next-slot, `unstable_cache` tag) is covered by `owner-effects` unit tests.
  Not proven: ISR/data-cache behaviour on a production server.
- 6.10 `ConfirmSheet` ids come from `useId()` (were fixed `confirm-sheet-title/body`). Pages with several sheets (calendar: cancel +
  remove) gave the second dialog the first one's accessible name.

- 7.1 Admin lives at `/[locale]/admin` (overview, businesses, reviews, users). `assertAdmin` / `requireAdmin` re-read the role from the DB; non-admins get `notFound()` so the route is not revealed. Transitions are tables in `lib/admin-params.ts`, applied under the Business row lock with an audit row (`admin.business.*`, `admin.review.*`, `admin.user.role`: ids + statuses only).
- Unsuspend goes SUSPENDED -> DRAFT, so the owner must resubmit and an admin re-approves; approve re-runs `publishChecklist`. Suspend keeps existing bookings valid. Review hide/restore/keep run under `lockBusiness` + `recomputeBusinessRating`.
- Admin roles: only "Make admin" / "Remove admin". Cannot remove your own role; last admin guarded under a lock on all ADMIN rows. Removed admins become OWNER if they own a business, else CUSTOMER. Emails show on the users page only, never in logs or audit.
