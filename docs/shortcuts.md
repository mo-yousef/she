# Open shortcuts

Every deliberate shortcut is marked in code with a `shortcut:` comment and listed here.
When a shortcut is resolved, move it to the "Resolved" section with a date.

## Open

- **Calendar (task 6.2).** (1) No drag-and-drop to move bookings; no edit/reschedule from the
  calendar (6.3 may add). (2) Recurring blocks are expanded into plain rows (no series id), so
  removing a series means removing each block; cap 60 occurrences / 90 days / 120 rows per request.
  (3) A block that overlaps any active booking or block is rejected as a whole (no "skip the
  conflicting days" option). (4) Manual bookings take the dashboard locale as the customer's email
  language and cannot capture WhatsApp/SMS consent: notices are email-only (5.2 rule); there is no
  "customer language" field. (5) Manual bookings may be up to 24h in the past and 400 days ahead;
  opening hours, lead time and the max-per-customer rule are NOT enforced (owner override). A manual
  start time inside the spring-forward gap is rejected. (6) Bookings cannot be created `COMPLETED`;
  mark them after the start. (7) Confirming a PENDING booking from the calendar sends no email
  (6.3 / 5.2 may add). (8) Click-to-add uses a mouse handler on the empty column; keyboard and
  touch users use the "Add booking" button. (9) Day axis is wall-clock: on 2026-03-29 the
  non-existent 03:00-04:00 hour and on 2026-10-25 the repeated hour are drawn as normal rows
  (nobody works then). (10) No browser/screen-reader/axe run; mobile is a horizontally scrolling
  grid, not a one-column-at-a-time switcher (staff chips filter instead). (11) Dates in the
  "block overlaps" message are shown as `YYYY-MM-DD`.
- **Booking-vs-Block cross-table overlap** (`prisma/migrations/.../migration.sql`,
  `lib/booking.ts`): a single Postgres EXCLUDE constraint cannot span two tables, so a
  booking overlapping a *block* (rather than another booking) is prevented by
  re-validating against blocks inside the booking transaction (now via `lib/booking-lock.ts`,
  shared with manual bookings and block creation), not by the DB. Revisit by
  folding blocks into `Booking` as a `BLOCK`-like status so one constraint covers both.

- **Business page 404 for unpublished** (`app/[locale]/b/[slug]/page.tsx`): unpublished
  or missing businesses both fall through to the generic `not-found.tsx` ("We couldn't
  find that page") with no business-specific copy or "browse studios" action. Revisit
  in phase 3/8.3 error-and-empty pass.

- **Phase 2 design-audit leftovers** (see `docs/design-audit-phase2.md`): no h2 between
  the search h1 and card h3s; search text state does not resync on back/forward;
  results count is not a live region; home search fields use placeholder-only visible
  labels and a free-text city; no axe/browser run. Revisit in the 8.1 accessibility pass.

- **Dark map tiles are a CSS invert filter, not real dark tiles**
  (`app/globals.css`, `.map-tiles .leaflet-tile-pane`): OSM has no official free dark
  tile set; inverting the raster tile pane is a cheap approximation (labels become
  legible but tile colours are imprecise). Revisit only if a dark tile provider becomes
  a hard requirement — design marks this nice-to-have, not required.

## Resolved

- **Sign-in page missing (2026-11-05, task 6.1).** `app/[locale]/account/page.tsx` now
  exists: email magic link + Google, signed-in state, open-redirect-safe `callbackUrl`.
  Auth.js `pages.signIn`/`error`/`verifyRequest` still point at the static `/en/account`
  (Auth.js config has no request-locale access); the account page itself reads
  `callbackUrl` and redirects to the matching locale. `lib/auth.ts`'s dev-only console
  magic-link print (no `RESEND_API_KEY` + `NODE_ENV=development`) is a new `shortcut:`.

- **OG image font (3.4):** `app/[locale]/b/[slug]/opengraph-image.tsx` uses the built-in
  ImageResponse font (Latin only). Greek/Cyrillic business names may render with missing
  glyphs. Revisit: bundle a Noto Sans latin+greek+cyrillic subset via `fonts`.
- **Sitemap lastModified (3.4):** `Business` has no `updatedAt`, so `createdAt` is used.
  Revisit: add `updatedAt @updatedAt` in a migration, then use it.

- **Brand-colour contrast (phase 3/4 KNOWN GAP): RESOLVED in 6.7** for colours saved through the profile page
  (`lib/brand.ts`, enforced in `saveBrandCore`). Colours written any other way (seed, SQL) are not re-checked at render;
  the public page does not fall back to defaults for a failing stored colour (OG image does).
- **Phase 3 design-audit leftovers** (see `docs/design-audit-phase3.md`): contact card has
  no heading; info cards sit after reviews on mobile (consider a "Hours & location" jump
  link); OG image `alt` and the 404 metadata title ("Not found") are English-only; site
  header "Skip to content" is hard-coded English; OSM attribution link is a small target
  (required by tile policy); map drags with one finger on touch and can catch page scroll;
  bottom-bar text contrast over scrolling content not measured; no axe/browser/200% zoom
  run. Revisit in 8.1/8.3.
- **Booking stepper (task 4.2)**: (1) Standard page layout, not the mobile bottom sheet /
  desktop modal from the apple-design rule; revisit in the 4.8 design audit.
  (2) Typed Details (PII) are held in client state only and never in the URL, so a hard
  refresh on Details/Review loses them and the stepper falls back to Details; consider
  sessionStorage if drop-off shows. (3) Only the selected date's slot grid is computed
  (re-fetched via `router.replace` on date change), so a date switch is one server round
  trip. (4) "Strip days" is a URL param (`days`, 14 to 60, "Show more dates"), not a
  business setting. (5) Terms/cancellation consent has no link yet; legal pages land in 7.3.
  (6) Resolved in 4.3: `createBooking` now creates bookings (`lib/booking.ts`).
- **Booking creation (task 4.3)**: (1) Rate limiting / Turnstile not yet in
  `app/actions/booking.ts` (marked `shortcut:`), lands in 4.6. (2) `maxPerCustomerPerDay`
  RESOLVED in 6.8 (enforced, `DAILY_LIMIT`). (3) RESOLVED in 6.2: block creation takes the same
  `StaffMember ... FOR UPDATE` lock via `lib/booking-lock.ts` (e2e race test). (4) The
  `NOT_IMPLEMENTED` result code and its i18n string are now unused.

- **Confirmation: no clipboard fallback / no VALARM (task 4.4).** `CopyReferenceButton` uses
  `navigator.clipboard` only; the .ics has no VALARM. Revisit if support reports either.
- **Confirmation: Referrer-Policy via `<meta name="referrer">` (task 4.4).** The page sets it through
  metadata; the .ics route sets the real header. Add a header rule in `next.config.ts` if a response
  header on the HTML page is required.

- **Manage page notifications (task 4.5).** Cancel and reschedule send no email/WhatsApp. Plug-in
  points are marked `shortcut:` in `app/actions/manage-booking.ts`. Revisit in task 5.x.
- **Reschedule picker window (task 4.5).** Offers at most 30 days (or the business max advance if
  smaller), computed server-side in one pass; no "show more dates". Revisit if owners ask for longer.
- **Rate limiting + Turnstile (task 4.6).** (1) `lib/rate-limit.ts` is an in-memory sliding
  window (5/IP/10 min, 3/phone/hour on `createBooking`): resets on redeploy/cold start and is
  per instance, not shared across serverless instances. Chosen to avoid a new dependency or
  migration; revisit with a Postgres table or Upstash before scaling out. (2) IP comes from
  `x-forwarded-for` (first hop), which is only trustworthy behind a proxy that overwrites it
  (Vercel does); unknown IP skips the IP bucket. (3) Turnstile is guests-only; signed-in
  customers skip it. In production it is always enforced and a missing `TURNSTILE_SECRET_KEY`
  fails closed; in dev/test it is skipped when the secret is unset. Needs real
  `TURNSTILE_SITE_KEY` / `TURNSTILE_SECRET_KEY` in production; never exercised against
  Cloudflare here (verify call mocked in tests).

- **E2E CI job is unverified on GitHub (task 4.7).** The `.github/workflows/ci.yml` steps (create
  `shecy_test`, `db:deploy`, `playwright install chromium`, `pnpm test:e2e`) were written but never run
  on GitHub Actions; the suite itself passes locally. Check the first CI run.
- **Baseline migration added (task 4.7).** The repo previously had only the exclusion-constraint
  migration, so `prisma migrate deploy` failed on an empty database (this also broke CI `db:deploy`).
  `20261103000000_baseline` (from `prisma migrate diff --from-empty`) + `migration_lock.toml` fix that.
  EXISTING databases created via `db push`/`migrate dev` already have these tables: mark the baseline
  applied instead of running it: `pnpm exec prisma migrate resolve --applied 20261103000000_baseline`.
- **E2E runs on `next dev` (task 4.7).** Production mode makes Turnstile fail closed for guests
  (needs real Cloudflare keys). In dev, Next 15 intermittently throws `frame.join is not a function`
  (React dev-only `buildFakeCallStack`); `e2e/booking-ui.spec.ts` retries its SETUP once. Revisit if
  Turnstile gets a test-key path, then run against `next build && next start`.
- **Phase 4 design audit leftovers (task 4.8, see `docs/design-audit-phase4.md`).** (1) Bottom-sheet
  booking flow stays deferred: a URL-state-preserving sheet needs an intercepting route, not a
  `<dialog>` hack. (2) Booking Details (PII) are client state only; a refresh loses them by design.
  (3) "Back" pushes history instead of popping it. (4) `book/page.tsx` metadata falls back to the
  English title "Not found". (5) Default no-brand dark theme has white-on-`#a98bd6` (`--b1-contrast`)
  at ~2.9:1 (platform tint, not a business colour: reported in 6.7, not a validator concern). (6) No axe/screen-reader/200%-zoom run yet.
- **UI race test covers 2 contexts only (task 4.7).** The in-memory limiter is per phone (3/hour) and
  per IP (skipped locally); N-way races are covered at `createBookingRecord` level instead.

- **Notifier plumbing (task 5.1).** (1) Resend `validation_error` is mapped to
  `INVALID_RECIPIENT` even though it can be any bad field (`lib/notify/resend.ts`, marked
  `shortcut:`). (2) WhatsApp sends are plain free-form `body` via Twilio; production WhatsApp
  outside the 24h session window needs approved templates (Content SIDs), to be handled
  with the 5.2 templates. (3) Missing keys in production skip sending (NOT_CONFIGURED + a
  generic warning) rather than failing; watch the 5.4 log for it. (4) Never run against
  real Resend/Twilio here; SDK calls are mocked in tests.

- **Notification log (5.2 → 5.4):** `recordResult()` in `lib/notify/booking-notices.ts` is a no-op; 5.4 writes `NotificationLog` there.
- **Consent (5.2):** Booking has no consent column. ONLINE = consented to WhatsApp/SMS, MANUAL = email-only. Still true after 6.2: manual bookings capture no consent, so they stay email-only (the calendar form only offers an email confirmation).
- **Notices run in `after()` with no retry (5.2):** a failed send is logged by name only and not retried. 5.3/5.4 may add retries.
- **Business phone (5.2):** business notices use `Business.whatsapp`, else the owner's `User.phone`, only if it looks like E.164. No format validation upstream yet.
- **Email client rendering (5.2):** templates are not tested in real clients (Gmail, Outlook, Apple Mail); `@react-email/components` 1.0.12 is marked deprecated upstream (successor package not adopted).

- **Notification cron (5.3).** (1) Route: `GET /api/cron/notifications`, `Authorization: Bearer $CRON_SECRET`,
  fails closed (401) if the secret is unset. `vercel.json` schedules it every 10 min, which needs Vercel
  **Pro**; Hobby allows daily crons only. On Hobby use an external scheduler (GitHub Actions `schedule`
  or cron-job.org) sending the same bearer header; final wording goes in the 8.6 deployment docs.
  (2) Idempotency uses three nullable `Booking` columns (`reminder24SentAt`, `reminder2SentAt`,
  `reviewRequestedAt`) claimed atomically before sending; NotificationLog (5.4) is not used for this.
  (3) A claim is released for retry only when nothing was delivered and a failure was retriable. If a
  process crashes between claim and send, that one notice is lost (chosen over risking a duplicate).
  (4) Batch is 200 per kind per run, oldest first, filtered in JS after the query; bookings skipped by the
  "created late" rule are not marked, so >200 of them in one window could starve later ones (unlikely).
  (5) COMPLETED is set by the owner dashboard (6.3); until then no review requests are sent.
  (6) Review links need the 5.5 route `/{locale}/b/{slug}/review/{reference}?t=...`.
  (7) Results are logged to NotificationLog since 5.4.
- **NotificationLog + webhooks (5.4).** (1) Audience is encoded as a `:business` template suffix, not
  a column; if the owner dashboard (6.x) needs to filter by audience in SQL, add a nullable column
  then. (2) No retention/purge of log rows (they cascade with the booking); revisit with GDPR (7.2).
  (3) `RESEND_WEBHOOK_SECRET` and Twilio webhooks are untested against live providers. (4) A failed
  log write is dropped (error name logged), not retried. (5) Resend `email.delivery_delayed`,
  `opened`, `clicked` are ignored on purpose.

- **Review OTP (5.5).** (1) Dev-only console print of the code when no Twilio keys and `NODE_ENV=development`. (2) Per-IP OTP/submit limits use the in-memory limiter (per instance); per-booking limits and attempts are persisted. (3) The receipt lives in client state, so a page reload after verifying means verifying again. (4) No cleanup job for expired `PhoneVerification` rows (they cascade with the booking); add with GDPR retention (7.2). (5) Review window equals the manage-token lifetime (30 days), so `WINDOW_PASSED` is only reachable at the boundary.

- **Onboarding / dashboard shell (task 6.1).** (1) **Photos: RESOLVED in 6.7 part 2.** The checklist photo item now
  links to `/dashboard/profile#photos`, where the owner can upload (needs the Cloudinary env vars; see docs/decisions.md). (2) **No admin approval UI yet:** "Submit for review"
  moves DRAFT to PENDING and only 7.1 can move PENDING to PUBLISHED; locally set `status` in the DB.
  (3) **No geocoding:** lat/lng are optional manual fields (`shortcut:` in the onboarding page);
  the public map is hidden without them. (4) **One business per owner in the dashboard:** the
  oldest `Business` of the owner is used; no switcher. (5) **Mobile nav is a scrollable tab list,
  not a menu sheet** (single item today). (6) **Hours step** is the minimal 7-row form (no
  per-day split shifts, no holidays); 6.6 replaces the UI and reuses `lib/hours.ts`. (7) **Sign-in
  actions are only build/route-smoke-tested:** no real email/Google round trip was run, and the
  sign-in rate limiter is the in-memory one. (8) Wizard text fields blur-validate only
  "required"; every other rule is enforced server-side. (9) A `SUSPENDED`/`PENDING` owner can
  still edit details through the wizard (edits re-revalidate the public page paths).

## Task 6.3 — Bookings table

- No CSV export (not in requirements). No bulk actions. Transitions only from the details dialog, not inline
  row buttons.
- Search is ILIKE, not trigram (typos are not tolerated); add `pg_trgm` GIN indexes on `guestName` if a single
  business ever has tens of thousands of bookings. Offset pagination degrades on very deep pages; switch to a
  cursor then.
- ~~RESOLVED 6.11:~~ The `calendar.error.CHANGED` message said "Reload the calendar"; the bookings table reuses it. Reword to a
  neutral "Reload the page" when 6.11 reviews copy.
- Staff filter lists all staff (incl. inactive) so old bookings stay findable.
- Filter changes do a full navigation (GET form); focus moves to the page heading and the result count is a live
  region, but there is no in-place update. Not verified with a screen reader or in a browser.

## Task 6.4 — Services CRUD

- Reordering is Move up / Move down buttons within a category; no drag-and-drop.
- Delete of a service with history is "archive" (hidden), never a real delete; there is no UI to see or purge archived
  services beyond the Hidden badge. Past/terminal bookings keep the row alive forever.
- Service translations are wired into the public business page and the booking stepper only; the confirmation,
  manage and calendar views still show the base name. Search matches base names only.
- Warnings for "no visible service" are shown after the action and as a banner; there is no pre-confirm dialog when
  hiding the last visible service (a persistent note sits on that row instead).
- No browser, screen-reader or axe run of the services page; dialogs reuse FormSheet/ConfirmSheet from 6.2.
- Onboarding's `saveFirstServiceCore` re-activates the first service if it was hidden (it forces `active: true`).
## Task 6.5 — Team, staff hours, days off
- Changing a staff member's weekly schedule (or the business hours later in 6.6) never touches existing bookings,
  and the owner is NOT warned about bookings that now fall outside the new hours. 6.6 should warn/adjust staff
  overrides when business hours shrink (a staff window is validated against business hours only at save time).
- Deactivated staff are not calendar columns, so their old bookings do not appear on the dashboard calendar (they do
  in the bookings table, manage page and notices). Only history can exist for them, since deactivating needs no
  future bookings.
- Owner manual bookings (6.2) still ignore staff days off, like they ignore opening hours (walk-ins). Online booking
  and reschedule do enforce them under the staff row lock.
- Day-off ranges may overlap each other (harmless); max 200 ranges per person; no recurring days off.
- No staff login accounts (`StaffMember.userId` untouched), no photo upload (6.7: `photoUrl` is display-only), no
  per-staff breaks or split shifts. "Any available" tie-breaking is unchanged.
- Warnings about uncovered services / no active staff are shown after the action (plus a per-row "only provider"
  note); there is no pre-confirm dialog. No browser, screen-reader or axe run of the team page.
## Task 6.6 — Hours editor
- No split shifts or lunch breaks: one window per weekday (schema is unique(businessId, weekday)).
- Closed-day bookings are not rescheduled automatically. Hours changes never touch existing bookings (the owner gets an
  "N upcoming bookings fall outside the new hours" notice); a new closure over active bookings is refused instead.
- No Cyprus public-holiday calendar import, no recurring closures, no per-day exceptions other than closure date ranges,
  no "show past closures" toggle (past ranges are hidden).
- The time input cannot show 24:00, so a business that closes at 24:00 is displayed as 23:59 (saving without touching it
  would store 23:59).
- The editor has its own row markup (controlled, array payload) instead of sharing the onboarding `HoursForm`
  (FormData + useActionState); validation is shared, the markup is not. Same as the staff-hours rows in 6.5.
- Closure reasons are free text shown only to the owner. Weekly "outside the new hours" count looks at the first 5000 upcoming bookings.
- No browser, screen-reader or axe run of the hours page.
## Task 6.7 part 1 — Profile + brand colours
- The slug is not editable (stable URLs); renaming a business keeps `/b/<slug>`. Revisit: slug history + redirects.
- Lat/lng are typed by hand; there is no geocoding from the address (shortcut kept from onboarding).
- Translations (el/ru) cover tagline and about only, and are wired into the business page body and its meta description.
  Business cards, search results and JSON-LD show the base (en) text; search matches base text only.
- Brand contrast is checked against WHITE (4.5:1) for the main colour and for the 35% accent blend. Text in the brand
  colour on the light GROUPED background `#f2f2f7` (not a white card) can fall to ~4.0:1 for a colour at exactly 4.5:1
  on white; the page uses `--b1-text` mostly on white cards. Not raised to 4.5 on `#f2f2f7`.
- Business cards keep their raw `primary -> accent` gradient (no text sits on it); only the OG image uses the 35% blend.
- Part 2 (photos, uploads) is below; the logo control is deferred (see 6.7 part 2).
- No browser, screen-reader or axe run of the profile page; the colour input and live readout are untested in a browser.
## Task 6.7 part 2 — Photos
- **No drag and drop.** Reorder is Move earlier / Move later buttons plus Set as cover (move to position 0). Revisit with a
  keyboard-accessible sortable if owners ask.
- **Orphaned Cloudinary assets.** Deleting a photo removes the DB row only; the file stays in Cloudinary. Add a cleanup job
  (list `she/<businessId>/*`, delete assets not referenced by `Photo.url`) or a signed destroy call.
- **Size/format are enforced by Cloudinary, not by us.** The browser pre-checks type and 5 MB; the server only checks the
  client-reported `format`/`bytes` (advisory, a hostile client can lie) and that the URL is a Cloudinary URL for THIS
  business folder. Without the Cloudinary console limits below, an owner could upload a bigger file straight to Cloudinary.
- **No logo control.** `Business.logoUrl` has no editor (it needs a separate core, wrapper and control, over the ~40-line budget).
  Reuse `isTrustedPhotoUrl` and the same signature action when it is built.
- **A trusted URL is not proof of upload.** `isTrustedPhotoUrl` proves the URL points into the business folder, not that the
  file exists (the owner could add a URL for an asset that was never uploaded, or one uploaded earlier then deleted). It
  shows as a broken image to that owner only. A HEAD check or Cloudinary's Admin API would close this.
- **Dashboard images are not resized by us.** Cards use next/image with Cloudinary originals (up to 5 MB); add `f_auto,q_auto,w_*`
  transformations (the URL check already allows one transformation segment) when load matters.
- **Not verified:** the real Cloudinary round trip (no keys), the upload UI, focus handling and screen-reader output in a browser.
- Photo `alt` empty is allowed (public gallery falls back to a generated alt).

## Task 6.8 — Reviews management and Settings
- Owners cannot hide reviews, only report them (FLAGGED stays public). Until 7.1 there is no admin UI, so reports wait in the DB
  (audit `review.flag` holds the reason). The 5-open-report cap only frees up once 7.1 decides them.
- The owner reply core (5.5) does not refuse a reply on a HIDDEN review; the dashboard just does not render the form for it.
- Report reason is only in the audit log (no column). Add a column if 7.1 needs to query/filter by reason.
- `maxAdvanceDays` goes up to 365 but the public date strip shows at most 60 days (strip is a URL param, 14 to 60).
- The booking page reads PUBLISHED before the transaction and the create path re-checks inside it, but an unpublish committed after
  that re-check and before the insert still lets that one booking through (it stays valid and manageable).
- Not verified: no browser, screen-reader or axe run of the reviews page, the settings form, the report and unpublish sheets.
- 6.9: `lib/owner-actions-coverage.test.ts` is a string-matching heuristic (no AST). It catches a missing helper import/audit call or a
  bare `writeAudit(` without `tx`; it cannot prove every code path audits. Real behaviour is covered by e2e/owner-effects.spec.ts.
- 6.9: Revalidation is asserted against an injected revalidator only; actual ISR refresh was not exercised (no browser).
- 6.9: `replyToReview` now also revalidates home/search (reply changes neither); accepted to keep one helper call.
## Task 6.10 — Owner e2e in a browser
- **Soft 404 on the public business page:** `app/[locale]/b/[slug]/loading.tsx` makes Next stream the page, so `notFound()` for an
  unknown / unpublished / draft business answers HTTP 200 with the not-found UI (and Next's noindex meta), not 404. Search engines may
  treat it as a soft 404. The e2e asserts the not-found heading instead of the status. Fix (phase 8): resolve the business in
  `generateMetadata`/a parent layout before streaming, or drop the page-level loading file.
- Owner spec runs on `next dev` only; no production-server run (see docs/decisions.md). Real email/Google sign-in and the Cloudinary
  upload are not exercised (Photo row inserted directly with a data URI).
- RESOLVED 6.11 (now `useId`): `FormSheet` used fixed ids (`form-sheet-title`); its title only renders while open, so two never coexist today.
- Found in 6.10, all RESOLVED in 6.11 (see `docs/design-audit-phase6.md`):
  - Several unmet checklist items would render identical "Fix this" links (no item name in the link text). Add `aria-label` with the item.
  - Profile / service forms repeat the labels "Tagline", "About", "Name" in the Greek and Russian fieldsets. They are inside named
    `fieldset`s, but the specs had to disambiguate with `.first()` / ids. Consider `aria-label`s with the language.
  - The bookings page renders both the table and the card list in the DOM (CSS hides one); screen readers are fine, tests need `.first()`.
- Test-data note: `createFixture` businesses have no address/languages; `createOwnerFixture` (e2e/owner-helpers.ts) adds them because the
  profile form (correctly) requires them.


## Task 6.11 — Phase 6 design audit (see `docs/design-audit-phase6.md`)
- Audit was code-based; no screenshots or screen reader pass (`e2e/design-audit-screenshots.spec.ts` exists, runs only with AUDIT_SHOTS=1).
- Still open: soft 404 on public business page; `--b1-text` dark-mode token review (both unchanged, phase 8).
## Task 7.1 — Admin
- Metrics are plain counts (no charts, no caching); lists are offset-paginated at 20. Revisit if the tables get large.
- Business search is `contains` (ILIKE) on name/slug and user search on email: no trigram index yet.
- Report reasons are read from `review.flag` audit rows with one JSON-path OR query per page (max 20 ids).
- No admin UI to change OWNER/STAFF/CUSTOMER roles; no impersonation. Admin actions have no per-action rate limit.
