# Performance (task 8.2, req 10)

Measured on a production build (`next start`, scratch DB `she_cy_test`, one seeded published
business), Lighthouse 12.2.1 mobile preset (simulated slow 4G, 4x CPU), headless Chrome for Testing,
on a developer Mac. Single runs, so expect a few points of noise.

| Page | Perf before | Perf after | LCP after | CLS before → after |
| --- | --- | --- | --- | --- |
| Home `/en` | 95 | 95 | 2.8 s | 0 → 0 |
| Search `/en/search` | 95 | 95 | 2.9 s | 0 → 0 |
| Business `/en/b/<slug>` | 82 | 91 | 3.4 s | 0.20 → 0 |
| Booking stepper `/en/b/<slug>/book` | 89 | 88 | 3.5 s | 0.09 → 0.11 |

TBT is 50 ms on all four pages.

## What changed

- **Prisma leaked into client bundles.** `sort-control` and `search-filters` imported `SORTS` from
  `lib/search` (which imports Prisma and the DB). `SORTS`/`Sort` now live in `lib/catalogue.ts`
  (pure). Home and search First Load JS went from 207/208 KB to 133/134 KB gzip.
- **CLS on the business page.** `loading.tsx` was shorter than the viewport, so the footer showed and
  jumped when content streamed in. The skeleton now has `min-h-dvh`.
- **Leaflet** was already `next/dynamic` with `ssr: false`, but it fetched on mount. It now loads only
  when the placeholder is within 300 px of the viewport (IntersectionObserver).
- Already in place and left alone: `next/font` Inter (`latin`, `greek`, `cyrillic`, `display: swap`),
  `priority` only on the first gallery photo, lazy for the rest, `sizes` on cards and gallery.

## Decisions

- The business page stays dynamic. It calls `auth()` for the favourite state. Moving that to a client
  fetch would trade a server wait for an extra request after hydration; the page already scores 91
  with LCP bound by the simulated network, so it was not worth the change. Revisit if LCP regresses.
- Home and search already read through the cached next-slot (`unstable_cache`). No new `revalidate`.

## Budget

`pnpm check:budget` (`scripts/check-bundle-budget.ts`, run in CI after `pnpm build`) sums the gzipped
JS listed in `.next/app-build-manifest.json` per route and fails over budget. No new dependency.

| Route | Measured | Budget |
| --- | --- | --- |
| home | 132.9 KB | 140 KB |
| search | 133.9 KB | 140 KB |
| business | 135.0 KB | 145 KB |
| book | 145.1 KB | 155 KB |

All are well under the 200 KB public-route ceiling. About 100 KB of each is the React/Next floor.

## Not met or not verified

- Business (91) and booking stepper (88) are below the 95 target. The stepper still shows CLS 0.11 in
  Lighthouse; cause not isolated (likely slots rendering after hydration). Follow-up.
- Not verified: real devices, real networks, real Cloudinary images (fixture uses a 1x1 data URI, so
  image bytes and image LCP are not representative), production CDN caching, ISR tag revalidation
  under load.
