# she.cy

A multi-tenant booking marketplace for beauty businesses in Cyprus (salons, nail
studios, lash bars, makeup artists, facial and skin studios). Customers discover
businesses and book against real availability; owners manage a branded listing, team,
services, hours, photos and calendar from a dashboard.

Built with Next.js 15 (App Router, RSC, Server Actions), PostgreSQL + Prisma, Auth.js
v5, next-intl (en/el/ru), Tailwind v4 + shadcn/ui, and an Apple/HIG design language.

## Requirements

- Node 20+ and [pnpm](https://pnpm.io) 9+ (`corepack enable && corepack prepare pnpm@9 --activate`)
- A PostgreSQL 14+ database (local, Neon or Supabase). The `btree_gist` and `pg_trgm`
  extensions are enabled by a migration.

## Setup

```bash
pnpm install
cp .env.example .env            # then fill in DATABASE_URL and secrets
pnpm db:generate                # generate the Prisma client
pnpm db:migrate                 # create tables + exclusion constraints
pnpm seed                       # reset + populate demo data
pnpm dev                        # http://localhost:3000 → redirects to /en
```

Demo accounts after seeding: `owner@she.cy`, `customer@she.cy`, `admin@she.cy`
(sign in by email magic link once SMTP/Resend is configured).

## Scripts

| Command | What it does |
|---|---|
| `pnpm dev` | Dev server |
| `pnpm build` | Production build |
| `pnpm typecheck` | `tsc --noEmit` (strict) |
| `pnpm lint` | ESLint (next config) |
| `pnpm test` | Vitest unit tests (availability engine, utilities) |
| `pnpm test:e2e` | Playwright: booking, owner-core and owner-UI specs (needs a scratch DB, see below) |
| `pnpm check:messages` | Fails if en/el/ru message keys are out of sync |
| `pnpm db:migrate` | Apply migrations (dev) |
| `pnpm db:deploy` | Apply migrations (CI/prod) |
| `pnpm seed` | Reset and repopulate demo data |

## Verify the foundation

```bash
pnpm typecheck      # 0 errors
pnpm test           # availability engine incl. DST + utility tests
pnpm check:messages # locales in sync
pnpm build          # all locales prerender, middleware compiles
```

## End-to-end tests (booking concurrency)

The suite creates and deletes its own business/staff/service fixtures, so it needs a
scratch database, never your dev DB. The config refuses to run unless the database name
contains `test`.

```bash
# one-time: create the scratch DB, tables and exclusion constraints
createdb she_cy_test
export E2E_DATABASE_URL="postgresql://USER@localhost:5432/she_cy_test?schema=public"
DATABASE_URL="$E2E_DATABASE_URL" DIRECT_URL="$E2E_DATABASE_URL" pnpm db:deploy
pnpm exec playwright install chromium   # one-time browser download

pnpm test:e2e    # starts `next dev` on :3100 against the scratch DB
```

Migrations since the first e2e setup (for example `20261105000000_staff_days_off`, staff days off) must be applied to
the scratch DB with the same `db:deploy` line before `pnpm test:e2e`. Apply them to your dev database deliberately,
with `pnpm db:deploy` pointed at it.

What it proves (req 4.1): 8 parallel `createBookingRecord` calls for the same staff and
slot yield exactly one booking and seven `SLOT_TAKEN`; 5 parallel retries with one
idempotency key create one booking; cancel then rebook works; "any staff" fills each
staff member once; and two real browser contexts confirming the same slot end with one
confirmation page and one "That time was just taken" message. No `pnpm seed` needed.

## Architecture notes

- **Times:** stored UTC (`timestamptz`); the business wall-clock is Europe/Nicosia.
  All conversion goes through `lib/time.ts` (date-fns-tz), so DST is handled correctly.
- **Availability engine** (`lib/availability.ts`) is a pure function with no database
  access, fully unit-tested including both Cyprus DST transitions.
- **Double-booking prevention** is enforced at the database with a Postgres GiST
  exclusion constraint on `tstzrange` per staff member (see
  `prisma/migrations/*_exclusion_constraints`). The app catches the violation and
  returns a friendly "that time was just taken".
- **i18n:** every string lives in `messages/{en,el,ru}.json`; CI fails on a missing key.

See `.kiro/specs/she-cy/` for requirements, design and the phased task list, `docs/`
for decisions and open shortcuts, and `.kiro/steering/` for the design + engineering
rules the build follows.

## Status

Phase 1 (foundation) complete and verified: tooling, design tokens, i18n, Prisma
schema + exclusion-constraint migration, the tested availability engine, seed data,
auth config and CI. Phases 2–8 (discovery, business page, booking flow, notifications,
owner dashboard, admin/GDPR, polish) are tracked in `.kiro/specs/she-cy/tasks.md`.

### Owner dashboard in a real browser (`e2e/owner-flow.spec.ts`, task 6.10, AC7)

Same command and scratch DB, no extra env. It drives the sign-in page, the onboarding wizard, every dashboard route in
en/el/ru (console errors fail the test), the owner edits that must appear on the public page and booking stepper
(profile, brand colour, services, hours/closure, team/day off, booking rules, unpublish), dashboard access control and
the calendar. Sign-in uses `e2e/auth.ts` (`signInAs(context, userId)`): Auth.js here uses database sessions, so the helper
inserts a `Session` row and sets the `authjs.session-token` cookie; no real email or Google, and no backdoor in product
code. Not covered: real email/Google sign-in, the Cloudinary upload (the Photo row is inserted directly with a data URI).
Run just this file with `pnpm exec playwright test e2e/owner-flow.spec.ts`.

Flakiness note: the e2e server shares `.next` with any other `next dev` or `pnpm build` in this checkout. Once, right after a
`pnpm build` with two other dev servers running, the owner-flow specs hung for minutes (the next two runs were green in
about 2.5 minutes). Stop other dev servers and avoid running a build just before `pnpm test:e2e`.
