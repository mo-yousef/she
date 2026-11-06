# Implementation Plan — owner-dashboard performance fix

Worktree: `/Users/mohammadyousit/Desktop/she/.worktrees/perf-dashboard` (branch `perf/dashboard-auth`, base `feat/phases-2-8`).
All paths below are relative to that worktree root. Do not edit files outside it.

## Context discovered during exploration (read before implementing)

- `getCurrentUser()` (lib/current-user.ts) reads the role FRESH from the Prisma row on every
  call via `db.user.upsert({ ..., select: { ..., role: true } })`. Its returned `role` is
  therefore DB-sourced, not taken from the Supabase session token. This is the exact
  "role from DB, never from a stale cached session" guarantee the task protects. `auth()`
  (lib/auth.ts) just reshapes that same `AppUser` into `{ user: { id, email, role, locale, name } }`,
  so `session.user.role` is equally DB-fresh. Reusing it in `requireOwnerBusiness` instead of
  re-running `db.user.findUnique` preserves the guarantee — confirmed by reading both files.
- `requireOwnerBusiness` (lib/owner-session.ts) currently runs, per call: `auth()` ->
  `db.user.findUnique` (redundant, role already in session) -> `findOwnerBusinessId`
  (`business.findFirst` select id) -> `db.business.findUniqueOrThrow` (second Business query).
  Collapsible to `auth()` + one `business.findFirst`.
- `findOwnerBusinessId` (lib/owner-auth.ts) has NO other caller besides `requireOwnerBusiness`
  (`assertOwnsBusiness` does not use it). Verify with grep before deciding whether to remove it;
  the safe default is to leave it exported and unused to avoid touching unrelated surface — see
  item 3.
- `@supabase/ssr` is 0.12.7 and `@supabase/auth-js` is 2.119.0 (confirmed in node_modules). Both
  expose `supabase.auth.getClaims()`. IMPORTANT semantics from the auth-js type docs:
  `getClaims()` verifies the JWT LOCALLY (WebCrypto, no network) ONLY when the project uses
  asymmetric JWT signing keys; with a symmetric secret it still sends a `getUser()`-style
  network request. So `getClaims()` is correct either way, but only a speedup on asymmetric keys.
- Hot-path identity reads calling `supabase.auth.getUser()`:
  - `getCurrentUser()` — needs the verified user + metadata to upsert the Prisma row. KEEP getUser.
  - `getSessionEmail()` — header-only "is someone signed in + their email" check. SAFE to switch.
  - `deleteAccountAction` (app/actions/delete-account.ts) — needs a freshly server-verified
    `authUser.id` to delete the Supabase identity. KEEP getUser.
  - auth callback (app/auth/callback/route.ts) — uses getCurrentUser (keeps getUser). No change.
- `dynamic = 'force-dynamic'` on the dashboard layout & page means no full-route caching;
  React `cache()` (per-request memoisation) is the correct and sufficient fix for the
  layout+page double-call. Confirmed both files call `requireOwnerBusiness`.
- Project commands (package.json): `pnpm typecheck` (= `tsc --noEmit`), `pnpm lint`
  (= `next lint`), `pnpm test` (= `vitest run`). Path alias `@/*` -> `./*`. Prisma client via
  `@/lib/db`. node_modules is NOT installed inside the worktree; run `pnpm install` there first
  (item 0) or the shared monorepo install must cover it.

## Design decisions

- **Memoisation via `import { cache } from 'react'`**, wrapping the exported async functions
  `getCurrentUser` and `requireOwnerBusiness` with identical names/signatures. `cache()` dedupes
  by argument identity within a single server request, which is exactly the layout/page double
  call. Chosen over an ad-hoc module-level map because `cache()` is request-scoped (no cross-request
  leakage of auth state) and is the framework-sanctioned primitive for RSC.
- **Query collapse** reuses `session.user` (id + DB-fresh role) and does the business lookup in one
  `db.business.findFirst` ordered `createdAt asc`, selecting `id, slug, name, status`. Chosen over
  keeping `findOwnerBusinessId` + `findUniqueOrThrow` because the two queries fetch the same row
  twice; one query returns every field the `OwnerContext` needs.
- **`getSessionEmail` -> `getClaims()`**; keep `getUser()` for getCurrentUser, delete-account, and
  the callback. Chosen because the header check only needs "signed in + email", which a verified
  claim satisfies, while identity mutations need a server-verified user. If the project turns out
  to use a symmetric signing secret, `getClaims()` still round-trips but stays correct; documented
  as a caveat, not a blocker.

## Redirect semantics — kept byte-for-byte equivalent

The three redirects in `requireOwnerBusiness` must be identical strings and fire on identical
conditions after the refactor:
1. Not signed in: `redirect(\`/${locale}/signin?callbackUrl=${encodeURIComponent(path)}\`)` when
   `!session?.user?.id` — unchanged, same guard.
2. Not OWNER/ADMIN: `redirect(\`/${locale}/for-business\`)`. New guard reads
   `session.user.role` (DB-fresh, see context) instead of the removed `db.user.findUnique`; the
   boolean test stays `role !== 'OWNER' && role !== 'ADMIN'`. The removed `!user` branch is
   subsumed by the `!session?.user?.id` guard above (no session id means we already redirected),
   so no behavioural gap.
3. No business: `redirect(\`/${locale}/onboarding\`)` when the single `findFirst` returns null —
   same condition as the old `!businessId`.
The returned shape stays `{ userId, role, business: { id, slug, name, status } }`.

---

- [ ] 0. Ensure dependencies are installed in the worktree so typecheck/lint/test can run.
      Files: none (install only).
      Verify: `pnpm install` completes in the worktree, and `pnpm typecheck` runs (even if it
      reports pre-existing errors) rather than failing on missing modules. If the monorepo install
      already covers the worktree, confirm `node_modules/react` and `node_modules/@supabase/ssr`
      resolve, then skip.

- [ ] 1. Memoise `getCurrentUser` in `lib/current-user.ts`.
      Add `import { cache } from 'react';` at the top. Wrap the existing async implementation in
      `cache(...)` while keeping the exported name `getCurrentUser` and its
      `(): Promise<AppUser | null>` signature unchanged (e.g.
      `export const getCurrentUser = cache(async (): Promise<AppUser | null> => { ...existing body... });`).
      Do NOT change the body logic (Supabase getUser + Prisma upsert stay as-is). Leave
      `getSessionEmail` and `signOutUser` untouched in this item.
      Files: lib/current-user.ts
      Verify: `pnpm typecheck` passes with no new errors; `pnpm test lib/owner-auth.test.ts` still
      passes (sanity that the module graph compiles).

- [ ] 2. Memoise and collapse `requireOwnerBusiness` in `lib/owner-session.ts`.
      Add `import { cache } from 'react';`. Wrap the function in `cache(...)` keeping the exported
      name and `(locale: string, path: string): Promise<OwnerContext>` signature. Inside, after the
      `auth()` call and the existing `!session?.user?.id` sign-in redirect, REMOVE the
      `db.user.findUnique` call and instead gate on `session.user.role`
      (`if (session.user.role !== 'OWNER' && session.user.role !== 'ADMIN') redirect(...)`). Replace
      `findOwnerBusinessId` + `db.business.findUniqueOrThrow` with a single
      `const business = await db.business.findFirst({ where: { ownerId: session.user.id }, orderBy: { createdAt: 'asc' }, select: { id: true, slug: true, name: true, status: true } });`
      then `if (!business) redirect(\`/${locale}/onboarding\`);`. Return
      `{ userId: session.user.id, role: session.user.role, business }`. Keep all three redirect
      strings exactly as specified in the "Redirect semantics" section. Remove the now-unused
      `findOwnerBusinessId` import from this file.
      Files: lib/owner-session.ts
      Verify: `pnpm typecheck` passes with no new errors; `pnpm lint` reports no new errors for this
      file (notably no unused-import warning for `findOwnerBusinessId` or `db` — `db` is still used
      by the `findFirst`).

- [ ] 3. Reconcile the now-unused `findOwnerBusinessId` export in `lib/owner-auth.ts`.
      First run `grep -rn "findOwnerBusinessId" --include="*.ts" --include="*.tsx" .` (excluding
      node_modules). If `requireOwnerBusiness` was its only caller, LEAVE the function exported and
      unused (smallest-correct: do not expand the change surface; it is referenced by name in no
      test). Do not delete it unless lint fails the build on an unused export AND no test imports it;
      in that case remove it and its now-dead code only. Document the choice in `docs/shortcuts.md`
      if left intentionally unused.
      Files: lib/owner-auth.ts (likely no edit), docs/shortcuts.md (one line if left unused)
      Verify: `pnpm lint` passes; `pnpm test lib/owner-auth.test.ts` passes (the `ownsBusiness`
      tests must stay green, proving owner-auth still compiles and exports correctly).

- [ ] 4. Switch `getSessionEmail` (lib/current-user.ts) from `getUser()` to `getClaims()`.
      Replace the `supabase.auth.getUser()` read with `const { data } = await supabase.auth.getClaims();`
      and derive the email from the verified claims: `const email = data?.claims?.email;`
      `return typeof email === 'string' ? email.toLowerCase() : null;`. Keep the function's
      no-DB-access property and its `(): Promise<string | null>` signature. Do NOT touch
      `getCurrentUser` (item 1) — it must keep `getUser()` because it needs the full verified user +
      metadata for the upsert.
      Files: lib/current-user.ts
      Verify: `pnpm typecheck` passes (the `getClaims` return type resolves against
      @supabase/auth-js 2.119.0); `pnpm lint` passes.

- [ ] 5. Confirm `getUser()` is retained where a server-verified user is required (no code change
      expected — this is a guard check).
      Re-read `app/actions/delete-account.ts` (must still call `supabase.auth.getUser()` for
      `authUser.id` used in `admin.auth.admin.deleteUser`) and `app/auth/callback/route.ts` (uses
      `getCurrentUser`, which keeps `getUser()`). Do not modify either unless they were changed in
      error.
      Files: none expected.
      Verify: `grep -n "getUser()" app/actions/delete-account.ts lib/current-user.ts` shows getUser
      still present in delete-account and in getCurrentUser; `grep -n "getClaims" lib/current-user.ts`
      shows it only inside getSessionEmail.

- [ ] 6. Add the one-line symmetric-vs-asymmetric caveat to `docs/decisions.md`.
      Note: `getSessionEmail` now uses `getClaims()`, which only avoids a network round-trip when the
      Supabase project uses asymmetric JWT signing keys; with a symmetric secret it stays correct but
      still round-trips. getUser() deliberately retained in getCurrentUser, delete-account, and the
      auth callback.
      Files: docs/decisions.md
      Verify: file contains the new note; `pnpm check:messages` unaffected (no UI strings changed).

- [ ] 7. Full scoped verification of the whole change.
      Files: none.
      Verify, all from the worktree root, each expected to pass with no new failures:
      - `pnpm typecheck`
      - `pnpm lint`
      - `pnpm test lib/owner-auth.test.ts lib/owner-effects.test.ts lib/owner-actions-coverage.test.ts`
        (the auth/owner suites that exercise the owner-auth module graph).
      - `pnpm test` (full unit suite) at the end to confirm no regression elsewhere.
      Expected outcome: all commands exit 0. If any pre-existing failure is unrelated to these
      files, note it; do not let the three edited files introduce any new failure, type error, or
      lint error. Redirect strings in `lib/owner-session.ts` must read identically to the
      "Redirect semantics" section above.

## Notes / assumptions

- No new dependencies; `react`'s `cache` and `getClaims` are already available.
- No test exists today for `getCurrentUser`/`requireOwnerBusiness` because they require live
  Supabase + Prisma; they are covered by Playwright owner flows, not unit tests. Adding a unit test
  here would require mocking the Supabase client and Prisma, which is out of scope for a
  smallest-correct perf refactor. The pure predicate `ownsBusiness` remains the unit-tested core and
  is unchanged. shortcut: no new unit test for the memoised wrappers — revisit if the auth bridge
  gains branching logic.
- If item 0 cannot install dependencies in the worktree (offline/registry blocked), stop and report;
  typecheck/lint/test cannot otherwise run.
