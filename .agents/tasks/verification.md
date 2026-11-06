# Verification — owner-dashboard performance fix

Branch: `perf/dashboard-auth`. All commands run from the worktree root
`/Users/mohammadyousit/Desktop/she/.worktrees/perf-dashboard` with pnpm.

## Setup

- `pnpm install` — completed (node_modules was not present in the worktree).
- `pnpm exec prisma generate` — generated the Prisma client. Required before typecheck:
  without it `@prisma/client` has no `Prisma` / `PrismaClient` exports, which produced
  ~40 pre-existing errors unrelated to this change (lib/team.ts, prisma/seed.ts, etc.).
  After generating, those errors are gone.

## Commands and results

### `pnpm exec tsc --noEmit`
PASS — exit 0, no errors.

### `pnpm lint` (= `next lint`)
PASS — exit 0. One pre-existing warning only, in a file NOT touched by this change:
`app/actions/auth.ts:72 'locale' is assigned a value but never used`. No new warnings
for `lib/current-user.ts` or `lib/owner-session.ts` (notably no unused-import warning:
`findOwnerBusinessId` is still imported and used by nine action/page files, and `db`
is still used by the new `business.findFirst`).

### `pnpm vitest run` — scoped to affected areas
`pnpm vitest run lib/owner-auth.test.ts lib/owner-effects.test.ts lib/owner-actions-coverage.test.ts lib/cron-auth.test.ts`
PASS — 4 files, 37 tests passed, 0 failed.
- lib/cron-auth.test.ts — 3 passed
- lib/owner-actions-coverage.test.ts — 24 passed
- lib/owner-effects.test.ts — 7 passed
- lib/owner-auth.test.ts — 3 passed

### `pnpm vitest run` — full unit suite (regression check)
PASS — 51 files, 518 tests passed, 0 failed.

## Code review of the behavioural guarantees

- **Once per request:** `getCurrentUser` (lib/current-user.ts) and `requireOwnerBusiness`
  (lib/owner-session.ts) are each wrapped in React `cache(...)` with identical exported
  names and signatures (`getCurrentUser(): Promise<AppUser | null>`,
  `requireOwnerBusiness(locale, path): Promise<OwnerContext>`). `cache()` memoises by
  argument identity within a single server request, deduping the dashboard layout + page
  double call. Routes are `force-dynamic`, so memoisation is request-scoped — no
  cross-request auth leakage.
- **Role still from DB, never from a stale session:** `requireOwnerBusiness` now reads
  `session.user.role`. `auth()` (lib/auth.ts) returns that from `getCurrentUser`, which
  reads `role` FRESH from the Prisma row on every call via
  `db.user.upsert({ ..., select: { role: true } })`. So reusing it preserves the
  "role from DB" guarantee while removing the redundant `db.user.findUnique`.
- **Redirect semantics unchanged (byte-for-byte):**
  1. Not signed in (`!session?.user?.id`): `redirect(\`/${locale}/signin?callbackUrl=${encodeURIComponent(path)}\`)`.
  2. Not OWNER/ADMIN (`role !== 'OWNER' && role !== 'ADMIN'`): `redirect(\`/${locale}/for-business\`)`.
     The old `!user` branch is subsumed by the sign-in guard above (no session id ->
     already redirected), so no behavioural gap.
  3. No business (single `business.findFirst` returns null): `redirect(\`/${locale}/onboarding\`)`.
  Returned shape unchanged: `{ userId, role, business: { id, slug, name, status } }`.
- **Query collapse:** `findOwnerBusinessId` + `db.business.findUniqueOrThrow` replaced by one
  `db.business.findFirst({ where: { ownerId }, orderBy: { createdAt: 'asc' }, select: { id, slug, name, status } })`
  — same row, same ordering, every OwnerContext field in one query.
- **getClaims switch is safe:** `getSessionEmail` (read-only "signed in + email" check, no DB)
  now uses `supabase.auth.getClaims()` (auth-js 2.119.0 exposes it; verifies the JWT locally
  on asymmetric signing keys, otherwise still correct but round-trips — noted in
  docs/decisions.md). `getUser()` is retained where a freshly server-verified user is required:
  `getCurrentUser` (full verified user + metadata for the upsert), `deleteAccountAction`
  (`authUser.id` for `admin.auth.admin.deleteUser`), and the auth callback (via `getCurrentUser`).
  Confirmed by grep: `getUser()` present in `app/actions/delete-account.ts` and
  `getCurrentUser`; `getClaims` appears only inside `getSessionEmail`.

## Notes

- No new dependencies. `react`'s `cache` and `getClaims` were already available.
- `findOwnerBusinessId` (lib/owner-auth.ts) left unchanged and exported — it has nine other
  callers (team, services, calendar, hours, onboarding, review-manage, profile, settings,
  photos actions + the onboarding page), so it is neither dead nor unused.
- No new unit test for the memoised wrappers: they require a live Supabase + Prisma and are
  covered by Playwright owner flows, not unit tests (pre-existing project constraint). The
  pure predicate `ownsBusiness` remains unit-tested and is unchanged.
