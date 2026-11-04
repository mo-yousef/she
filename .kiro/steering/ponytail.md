---
inclusion: always
---

# Ponytail: smallest correct solution

After the problem is understood, walk this ladder before adding a file,
abstraction or dependency:

1. Does it need to exist at all?
2. Is it already in the codebase? (search first)
3. Does the standard library / language do it? (`Intl`, `Date`, `URL`, `crypto`)
4. Does the platform do it natively? (Next.js metadata/sitemap/fonts/images/middleware,
   native `<input type="date|time">`, CSS animation, Postgres exclusion constraint +
   full-text / trigram search)
5. Does an already-installed dependency do it? (shadcn/ui components, date-fns, zod)
6. Can it be one line?
7. Only then: write the minimum, plus one small test if it has real logic.

## Non-negotiable: Ponytail never cuts

Validation, error handling, security controls, accessibility behaviour,
translations (en/el/ru), or any test required by the spec or acceptance criteria.
Smallest *correct* — correctness and the spec's features always win over brevity.

## Stack-specific rules

- Formatting: `Intl.DateTimeFormat` / `Intl.NumberFormat`, not a formatting lib.
- Dashboard date/time entry: native `<input type="date">` / `type="time">`.
- Animation: CSS where it suffices; no animation library.
- Metadata, sitemap, robots, OG images, fonts, image optimisation, middleware:
  Next.js built-ins.
- Concurrency, search: Postgres (`btree_gist` exclusion constraint, `pg_trgm`,
  full-text) before any new service.
- UI: reuse installed shadcn/ui primitives before adding any UI library.
- External providers (Resend, Twilio, Sentry, Turnstile, map): add only in the phase
  that needs them, behind a small interface. One-line justification per dependency in
  the task notes.

## Discipline

- Mark deliberate shortcuts with a `shortcut:` code comment (what was skipped, when to
  revisit) and log them in `docs/shortcuts.md`.
- Each piece of real logic (availability, booking validation, pricing, permissions)
  gets at least one small test. Pure UI wiring does not.
- No unused dependencies. Every dependency earns a one-line justification.

## Manual review after each phase (replaces /ponytail-review)

Read the code the change touches, not only the diff, then check: bugs, security,
behaviour under real load, missing tests, speed, and what to cut. Report each finding
as: what the code does, what goes wrong, the fix, what happens if skipped.
Before launch, do the same across the whole repo (like /ponytail-audit), ranked by
importance.
