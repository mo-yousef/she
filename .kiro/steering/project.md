---
inclusion: always
---

# she.cy — project conventions

Multi-tenant beauty booking marketplace for Cyprus. Read `docs/` notes first each
session; do not re-read the whole repo.

## Stack (locked)

- Next.js 15, App Router, TypeScript strict, RSC by default, Server Actions for
  mutations, Route Handlers for webhooks/cron.
- PostgreSQL + Prisma. `btree_gist` exclusion constraint prevents double-booking.
- Auth.js (NextAuth v5): email magic link + Google. Roles CUSTOMER/OWNER/STAFF/ADMIN.
- next-intl, locales en/el/ru, locale-prefixed routes, default en.
- Tailwind CSS v4 (CSS-variable tokens) + shadcn/ui primitives.
- next/image for delivery; UploadThing or Cloudinary for uploads.
- Resend + React Email; Twilio (WhatsApp + SMS fallback) behind a provider interface.
- Zod on every input, shared client/server.
- date-fns + date-fns-tz. Store UTC; compute/display in Europe/Nicosia.
- Vitest (availability engine mandatory) + Playwright (booking/reschedule/cancel/owner).
- Package manager: pnpm.

## Conventions

- All times stored UTC; the single source of truth for a business's wall-clock is
  Europe/Nicosia. Never do timezone math by hand — use date-fns-tz.
- Money in integer cents, EUR, formatted with Intl.NumberFormat per locale.
- Booking reference format `SC-XXXXX`.
- Server-side authorisation on every action: an owner may touch only their own
  business. Re-validate availability server-side on confirm and reschedule; never trust
  client state.
- No PII in logs.
- Secrets only via env; keep `.env.example` current.

## Where things live

- `lib/availability.ts` — pure availability engine, no DB access inside core fn.
- `lib/` — pure utilities (dates, money, slug, tokens, pricing).
- `messages/{en,el,ru}.json` — all UI strings; a script fails CI on any missing key.
- `prisma/schema.prisma`, `prisma/seed.ts`.
- `docs/decisions.md`, `docs/shortcuts.md` — keep short and current.

## Credit discipline

One phase and one task at a time. Targeted edits, not whole-file regens. Run only
affected tests during dev; full suite at phase end. Summarise long outputs; never paste
logs/lockfiles into chat.
