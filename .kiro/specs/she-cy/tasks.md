# Tasks — she.cy

Phase-by-phase plan. Each phase ends with its tests and the design + Ponytail review.
`[ ]` not started, `[~]` in progress, `[x]` done.

---

## Phase 1 — Foundation (complete, verified)

- [x] 1.1 Scaffold Next.js 15 + TS strict, Tailwind v4, ESLint/Prettier, pnpm, Husky,
      base config files. (req 10, 11)
- [x] 1.2 Design tokens in `globals.css` (Apple scale, semantic light/dark, radii,
      spacing); `next/font` Inter; theme toggle + `prefers-color-scheme`. (req 10)
- [x] 1.3 i18n skeleton: next-intl middleware, locale routing en/el/ru, `messages/*`
      with the shared keys, locale switcher, `scripts/check-messages.ts`. (req 8)
- [x] 1.4 Prisma schema for all entities + enums; schema validates + client generates.
      (req 7)
- [x] 1.5 Raw-SQL migration: `btree_gist`, `pg_trgm`, exclusion constraints, trigram
      indexes. (req 4.1, 1.1)
- [x] 1.6 `lib/availability.ts` pure engine. (req 4.2)
- [x] 1.7 Vitest for the engine incl. both Cyprus DST transitions — 12 tests green.
      (req 4.2, AC10)
- [x] 1.8 `prisma/seed.ts` — 6 businesses, staff, services, hours, reviews, upcoming +
      past bookings, demo accounts; `pnpm seed` resets + repopulates. (req 11)
- [x] 1.9 Auth.js v5 (magic link + Google), roles, session. (req 7)
- [x] 1.10 `.env.example`, README with run/verify commands, CI workflow. (req 11)
- [x] 1.11 Phase-1 review (Ponytail) + record shortcuts/decisions. See
      `docs/decisions.md` and `docs/shortcuts.md`.

Verification: `next build` green (12 static pages × en/el/ru), `tsc --noEmit` clean,
19 Vitest tests pass, message keys in sync. Not yet run here: `prisma migrate`/`seed`
(need a live Postgres `DATABASE_URL`) and Playwright (lands phase 4).

## Phase 2 — Public discovery

- [x] 2.1 Home: hero, search bar, category chips, sort, results grid, trust points,
      "List your business" CTA. (req 1.1, 1.2)
- [x] 2.2 `/search` with URL-synced filters + sorting (Postgres trigram + full-text).
- [x] 2.3 Business card component incl. next-available-slot (cached). (req 1.2)
- [x] 2.4 Favourites (DB + optimistic). (req 1)
- [x] 2.5 Skeletons + empty states. (req 1.1)
- [x] 2.6 **Design audit** (mandatory). (AC11, AC12)

## Phase 3 — Business page

- [x] 3.1 All sections per req 2.1, branded header, sticky sidebar, mobile bottom bar.
- [x] 3.2 Gallery + lightbox (keyboard nav, alt text).
- [x] 3.3 Map (Leaflet/OSM), open-in-maps, tap-to-call, WhatsApp link.
- [x] 3.4 SEO: generateMetadata, JSON-LD, canonical + hreflang, OG image, sitemap,
      robots.
- [x] 3.5 Reviews display + distribution + owner replies + verified badge. (req 2.2)
- [x] 3.6 **Design audit** (mandatory).

## Phase 4 — Availability + booking flow

- [x] 4.1 Date strip + slot grid components; unavailable non-selectable + struck.
      (req 3.1)
- [x] 4.2 Booking stepper with URL-persisted state; auto-skip single-staff. (req 3.1)
- [x] 4.3 `lib/booking.ts` create inside tx; exclusion-constraint catch; idempotency;
      server re-validation. (req 4.1)
- [x] 4.4 Confirmation screen: reference, .ics + Google link, WhatsApp share, manage
      link. (req 3.2)
- [x] 4.5 Manage page (signed token): view/reschedule/cancel honouring policy. (req 3.2)
- [x] 4.6 Rate limiting + Turnstile on guest booking. (req 9)
- [x] 4.7 Vitest booking validation + Playwright concurrency test (exactly one wins).
      (AC4, AC5)
- [x] 4.8 **Design audit** (mandatory).

## Phase 5 — Notifications + reviews

- [x] 5.1 Notifier interface + Resend + Twilio (WhatsApp + SMS fallback) adapters.
      (req 6)
- [x] 5.2 React Email templates in en/el/ru: confirm, reschedule, cancel, reminders,
      review request. (req 6, 8)
- [x] 5.3 Cron route handlers: 24h/2h reminders, review request 2h post-completion.
- [x] 5.4 NotificationLog + provider status webhooks. (req 6)
- [x] 5.5 Review submission (OTP-gated, completed-booking-only) + owner replies.
      (req 2.2, 7)

## Phase 6 — Owner dashboard

- [x] 6.1 Onboarding wizard + publish checklist. (req 5.1)
- [x] 6.2 Calendar day/week per-staff grid; manual booking; block time. (req 5.1)
- [x] 6.3 Bookings table + filters + state transitions. (req 3.3, 5.1)
- [x] 6.4 Services CRUD (hide-not-delete when future bookings). (req 5.1)
- [x] 6.5 Team CRUD + staff hours/days off. (req 5.1)
- [x] 6.6 Hours editor (validation, copy-to-all, holidays). (req 5.1)
- [x] 6.7 Profile + brand colours (contrast check) + photos (reorder, alt, cover,
      quota). (req 5.1, 10)
- [x] 6.8 Reviews management; Settings (booking rules, publish/unpublish). (req 5.1)
- [x] 6.9 Revalidate tags on edit + audit log. (req 5.1)
- [x] 6.10 Playwright owner-edit e2e. (AC7)
- [x] 6.11 **Design audit** (mandatory).

## Phase 7 — Admin + GDPR + legal

- [-] 7.1 Admin: businesses approve/suspend, reviews moderation, users, metrics. (req 5)
- [ ] 7.2 GDPR: consent capture, data export, deletion/anonymise, retention. (req 9)
- [ ] 7.3 Legal pages (terms, privacy, cancellation) in en/el/ru. (req 8, 9)

## Phase 8 — Polish + hardening

- [ ] 8.1 Accessibility pass (axe) light/dark, 200% text — zero blocking. (AC9, AC11)
- [ ] 8.2 Performance budget, image/map lazy-load, Lighthouse 95+. (req 10)
- [ ] 8.3 Error + empty states everywhere; Sentry + analytics. (req 10)
- [ ] 8.4 Full Playwright suite green. (AC10)
- [ ] 8.5 Security review + whole-repo Ponytail audit + Apple code-audit (translucency,
      fixed-width/custom-bar misuse). (AC12, AC13)
- [ ] 8.6 Deployment docs (Vercel + Neon/Supabase). (req 11)

---

## Acceptance criteria tracker (brief §14 + §16.6)

1. [ ] Find + open a branded business page in any of 3 languages.
2. [ ] Business page shows identity, gallery, hours, services+prices, team, reviews,
   map, contact, visible Book button on both viewports.
3. [ ] Full booking flow → on-screen confirmation + email + WhatsApp/SMS.
4. [ ] No double-book under race (automated concurrency test).
5. [ ] Past/closed/booked/blocked never selectable; server rejects tampering.
6. [ ] Reschedule + cancel; policy respected; slot released immediately.
7. [ ] Owner onboarding → edits reflected on public page.
8. [ ] Each business's data fully independent.
9. [ ] Light/dark, responsive at 360/768/1024/1440, axe passes on key pages.
10. [ ] CI green: lint, typecheck, unit (DST), Playwright (booking/reschedule/cancel/
    owner).
11. [ ] Apple a11y audit zero blocking on key screens, light+dark, 200% text.
12. [ ] Translucency only on nav layer; degrades without backdrop-filter.
13. [ ] No unused deps; every dep justified; `docs/shortcuts.md` lists open shortcuts.
