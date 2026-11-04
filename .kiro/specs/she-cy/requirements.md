# Requirements — she.cy

A production, multi-tenant booking marketplace for beauty businesses in Cyprus.
Customers discover businesses and book against real availability; owners manage a
branded listing, team, services, hours, photos and calendar from a dashboard.

Format: user stories with acceptance criteria in EARS notation
(WHEN/IF ... THE SYSTEM SHALL ...). Grouped by capability. Numbers are stable IDs
referenced by the design and task documents.

---

## 1. Discovery and search

**1.1** As a visitor, I want to search businesses by text and city, so that I can find
a place that does what I need near me.

- WHEN a visitor submits a text query THE SYSTEM SHALL return businesses whose name,
  tagline or service names match, with typo tolerance (Postgres trigram).
- WHEN a visitor applies filters (category, city, open-now, price range, language,
  minimum rating) THE SYSTEM SHALL reflect every active filter in the URL query string
  so the result is shareable and bookmarkable.
- WHEN a visitor changes sort (Recommended, Top rated, Lowest price, Soonest available)
  THE SYSTEM SHALL re-order results accordingly and keep sort in the URL.
- WHILE results are loading THE SYSTEM SHALL show skeleton cards, and WHEN there are no
  results THE SYSTEM SHALL show an empty state with a clear next action.

**1.2** As a visitor, I want each result card to show key facts, so that I can compare
without opening every page.

- THE SYSTEM SHALL show on each card: cover (brand colours or first photo), logo, name,
  category + city, rating + count (or "New"), open/closed badge (computed in
  Europe/Nicosia), "from €X", next available slot, and a favourite control.
- IF a business has no reviews THE SYSTEM SHALL show "New" instead of a rating.

## 2. Business profile page (`/b/[slug]`)

**2.1** As a visitor, I want a business's own branded page, so that each place feels
distinct and trustworthy.

- THE SYSTEM SHALL render server-side with the business's brand colours on the header,
  primary buttons, selected states and focus rings, while platform chrome stays neutral.
- THE SYSTEM SHALL show, in order: branded header (logo/monogram, name, tagline,
  rating, city, open-now badge, favourite, Book now), gallery with lightbox, about,
  services grouped by category with Book buttons, team, reviews with distribution and
  owner replies, and a sticky sidebar (Book, next slot, hours with today highlighted,
  address, tap-to-call, WhatsApp, Instagram, Open in Maps, embedded map).
- WHEN viewed on mobile THE SYSTEM SHALL show a fixed bottom bar with "from €X", next
  slot and Book now.
- THE SYSTEM SHALL emit `generateMetadata`, JSON-LD `LocalBusiness` with
  `aggregateRating`, `openingHoursSpecification`, `address`, `geo`, a canonical URL,
  `hreflang` for en/el/ru, a dynamic OG image, and be present in sitemap + robots.

**2.2** As a visitor, only genuine reviews are shown.

- THE SYSTEM SHALL mark reviews linked to a completed booking as "Verified visit".
- THE SYSTEM SHALL allow a review to be written only by a customer with a completed
  booking at that business.

## 3. Booking flow

**3.1** As a customer or guest, I want to book an appointment in clear steps, so that I
know exactly what I am confirming.

- THE SYSTEM SHALL present steps: Service → Team → Date/Time → Details → Review →
  Confirm, with a progress bar and a working back button, and SHALL persist step state
  in the URL so refresh and browser-back work.
- WHEN only one staff member offers the chosen service THE SYSTEM SHALL skip the Team
  step and default to that person.
- THE SYSTEM SHALL show a date strip (14 days default, configurable up to 60) with days
  that have no availability disabled, and time slots on the business's grid
  (15/30/60 min).
- IF a slot is unavailable THE SYSTEM SHALL render it non-selectable AND visually
  distinct beyond colour (struck through), and the server SHALL reject it if submitted.
- WHEN a date has no remaining slots THE SYSTEM SHALL show a "no times left, pick
  another date" empty state.
- THE SYSTEM SHALL validate details: full name, mobile in international format (default
  +357), email, optional note; and require consent to terms and to booking messages.
- WHEN a signed-in customer opens Details THE SYSTEM SHALL prefill known fields.

**3.2** As a customer or guest, I want confirmation and a way to manage my booking.

- WHEN a booking is created THE SYSTEM SHALL show a confirmation screen with reference
  `SC-XXXXX`, details, Add to calendar (Google link + downloadable `.ics`), Share on
  WhatsApp, and a manage link.
- THE SYSTEM SHALL let a customer or a guest (via a signed, expiring token link) view,
  reschedule and cancel the booking.
- WHEN rescheduling THE SYSTEM SHALL re-run availability for the same service/staff,
  excluding the booking's own slot.
- WHEN cancelling within the cancellation window THE SYSTEM SHALL cancel and release the
  slot immediately; IF past the cutoff THE SYSTEM SHALL show "contact the business".

**3.3** Booking lifecycle states: PENDING (if the business requires approval),
CONFIRMED, COMPLETED, CANCELLED_BY_CUSTOMER, CANCELLED_BY_BUSINESS, NO_SHOW. Owners can
toggle instant confirmation vs manual approval.

## 4. Availability and concurrency (core)

**4.1** As the platform, I never allow two active bookings for the same staff member to
overlap.

- THE SYSTEM SHALL enforce a Postgres exclusion constraint (btree_gist) so that no two
  active bookings or blocks for the same staff member have overlapping
  `tstzrange(starts_at, ends_at)`.
- WHEN the constraint fires on create THE SYSTEM SHALL return "That time was just taken.
  Please pick another." and return the user to the time step with fresh availability.
- THE SYSTEM SHALL create bookings in a transaction, re-validate availability
  server-side on confirm and reschedule, and use an idempotency key to prevent duplicate
  submissions.
- WHEN two requests race for the same slot THE SYSTEM SHALL ensure at most one succeeds
  (covered by an automated concurrency test).

**4.2** As a business owner, availability reflects my real rules.

- THE SYSTEM SHALL compute slots on the business grid within opening hours such that
  `start + duration + buffer <= close`, excluding overlaps with active bookings and
  blocks for that staff member, honouring minimum lead time (default 60 min) and maximum
  advance window (default 60 days), returning no slots on closed days (weekly or
  holiday), all computed in Europe/Nicosia with correct DST handling.
- WHEN "Any available" is chosen THE SYSTEM SHALL assign an eligible, free staff member
  using least-booked-first.

## 5. Owner dashboard

**5.1** Overview, calendar, bookings, services, team, hours, profile, reviews, settings,
onboarding — each as described in the IA. Key rules:

- THE SYSTEM SHALL let an owner create/edit services (duration, buffer, price,
  description, category, staff eligibility, visibility) and SHALL block deleting a
  service that has future bookings, offering "hide" instead.
- THE SYSTEM SHALL validate hours so close is after open, offer copy-to-all-days, and
  support holiday closures.
- THE SYSTEM SHALL allow manual bookings (walk-in/phone) and time blocks (single or
  recurring) from the calendar, validated server-side like online bookings.
- THE SYSTEM SHALL enforce a publish checklist: a listing publishes only with name,
  category, city, address, >=1 service, >=1 staff, hours, and >=1 photo.
- WHEN an owner edits anything on the public page THE SYSTEM SHALL revalidate the public
  page immediately and write an audit-log entry.
- THE SYSTEM SHALL authorise every owner action against ownership of the target
  business.

## 6. Notifications

- THE SYSTEM SHALL send, in the customer's locale, via email and WhatsApp/SMS:
  confirmation (customer + business), reminders 24h and 2h before, reschedule and
  cancellation notices, and a review request 2h after a completed appointment.
- THE SYSTEM SHALL record each send in a notification log and SHALL route through a
  provider interface that can swap Twilio for another provider.

## 7. Accounts, auth, roles

- THE SYSTEM SHALL support email magic-link and Google sign-in with roles CUSTOMER,
  OWNER, STAFF, ADMIN.
- THE SYSTEM SHALL allow guest bookings and SHALL let a guest claim bookings by signing
  in with the same email or by verifying the phone via OTP.
- THE SYSTEM SHALL require phone verification (OTP) before a customer leaves a review or
  claims guest bookings.

## 8. Internationalisation

- THE SYSTEM SHALL offer en/el/ru with a header switcher (EN/ΕΛ/РУ), remembered in a
  cookie and the user profile, and SHALL translate all UI strings, validation errors,
  emails, messages and legal pages using ICU for plurals and dates.
- THE SYSTEM SHALL format dates and numbers per locale (en-GB, el-GR, ru-RU), currency
  EUR, and SHALL fail CI if any message key is missing in any locale.
- THE SYSTEM SHALL support optional owner-provided translations for about/tagline/
  service descriptions, falling back to the default language.

## 9. Security, privacy, compliance

- THE SYSTEM SHALL capture consent, provide a privacy policy, and support customer data
  export and deletion, with a retention policy and no PII in logs.
- THE SYSTEM SHALL validate every input with Zod, use CSRF-safe Server Actions, secure
  cookies, rate limiting per IP and per phone on booking endpoints, Turnstile on guest
  bookings, upload type/size checks, sanitised user content, and signed manage-booking
  tokens with expiry.

## 10. Design, accessibility, performance

- THE SYSTEM SHALL follow the Apple/HIG design steering: Apple text scale, semantic
  light/dark tokens, 44px targets, translucency only on the navigation layer with solid
  fallbacks, purposeful motion respecting reduced-motion, and the per-business brand
  colour as the only signature element.
- THE SYSTEM SHALL meet WCAG 2.2 AA on key screens (contrast, keyboard, SR names/states,
  no colour-only meaning, reduced motion/transparency, increased contrast) in light and
  dark and at 200% text, with zero blocking findings.
- THE SYSTEM SHALL server-render public pages, use ISR with tag revalidation on owner
  edits, optimise images, and target Lighthouse 95+ on mobile.

## 11. Quality and delivery

- THE SYSTEM SHALL ship with Vitest unit tests (availability engine incl. DST edge
  cases mandatory), Playwright e2e (booking, reschedule, cancel, owner edit), ESLint,
  Prettier, Husky pre-commit, and GitHub Actions CI that runs lint + typecheck + tests.
- THE SYSTEM SHALL seed 6+ realistic businesses across Larnaca, Limassol, Nicosia,
  Paphos with staff, services, varied hours, reviews, brand colours, placeholder images,
  demo accounts and existing bookings, resettable via `pnpm seed`.

## 12. Acceptance (mirrors spec §14 and §16.6)

The 13 acceptance criteria from the build brief are adopted verbatim as the definition
of done and are tracked in the task document.
