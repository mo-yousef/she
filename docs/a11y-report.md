# Accessibility report (task 8.1, AC9, AC11)

Spec: `e2e/a11y.spec.ts` (axe-core 4.11 via `@axe-core/playwright` 4.11.0; tags wcag2a, wcag2aa, wcag21aa, wcag22aa;
serious/critical fail the test). Run: `pnpm exec playwright test e2e/a11y.spec.ts` (scratch DB, `next dev`).

## Pages covered
- 1440x900, light and dark: home, search, business page, booking stepper (service step, date/time step), confirmation,
  manage, account (signed out), legal privacy, dashboard overview / calendar / bookings / services (add-service sheet open) /
  profile, admin overview.
- 360x800 light: home, business page, stepper date/time step, dashboard overview.
- 200% text (`html { font-size: 200% }`, 1440 and 360 wide): home, business page, stepper date/time step, dashboard overview.
  Asserts no horizontal document overflow and no link/button clipped outside the viewport (buttons inside a horizontal
  scroller such as the date strip are exempt: reachable by scrolling).

## Result
- axe: 0 violations of any impact on all 34 page/theme/viewport combinations. Checked that dark mode really applied
  (black background, 36 contrast nodes checked on home).
- Earlier suspects already fixed in 6.11 and now confirmed by axe: dark primary-button contrast, `--b1-text`,
  repeated "Fix this" link names, duplicate el/ru field labels, FormSheet ids, bookings table + cards.
- Found by the 200% check and fixed: home `h1` (`max-w-[18ch]`, large title) overflowed at 360px / 200% (document
  353px wider). Fix: `overflow-wrap: break-word` on h1-h3 in `app/globals.css`.
- Fixed (cheap): the "Skip to content" link and the primary nav `aria-label` were hard-coded English; now
  `nav.skipToContent` / `nav.primary` in en/el/ru.

## Exclusions
- `.leaflet-container` is excluded from axe (OSM tiles and attribution are third-party content). No rules are disabled.
  The Turnstile iframe never renders in e2e (no site key), so it was not scanned.

## Not verified
- Screen readers (VoiceOver, NVDA, TalkBack), real devices, real browser text-size settings (only the CSS emulation above),
  Safari/Firefox. axe finds roughly a third of WCAG issues; focus order, announcements and meaning need manual testing.
- Pages outside the set (team, hours, reviews, settings, onboarding, favourites, for-business, other admin pages, review
  page, OG image alt) and the el/ru locales were not scanned.
- Searching with results (the business card h3 under the search h1 skips h2) was not flagged by axe on the empty-result
  page; heading order with cards is unverified.
- Contrast over the translucent glass nav layer on scrolling content was not measured.
- States not scanned: validation errors, confirm sheets, the colour picker's failing state, the calendar's booking dialog.
