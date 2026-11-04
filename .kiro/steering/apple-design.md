---
inclusion: always
---

# Apple design language (HIG) — supersedes generic design rules on conflict

Goal: the web app feels at home next to native iOS/macOS apps — calm, clear,
familiar — without looking like a template. Treat Apple's eight principles as the
review checklist: purpose, agency, responsibility, familiarity, flexibility,
simplicity, craft, delight.

One signature element: each business page takes on its own brand colour; the platform
chrome stays neutral.

## Typography

System stack with Inter fallback (loaded via `next/font`):
`-apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display", system-ui, Inter, sans-serif`.
Cover Latin + Greek + Cyrillic so en/el/ru render consistently.

Use Apple's text-style scale in `rem` (follows browser text size; layout survives 200%):

- Large Title 34/41 bold, Title 1 28/34, Title 2 22/28, Title 3 20/25
- Headline 17/22 semibold, Body 17/22, Callout 16/21, Subhead 15/20
- Footnote 13/18, Caption 12/16

Line length under ~75 characters.

## Colour — semantic tokens, never raw hex in components

- Light: grouped background `#f2f2f7`, surface `#ffffff`, label `#000000`,
  secondary label `rgba(60,60,67,0.6)`, separator `rgba(60,60,67,0.18)`.
- Dark: background `#000000`, surface `#1c1c1e`, elevated `#2c2c2e`,
  label `#ffffff`, secondary label `rgba(235,235,245,0.6)`.
- One platform tint for interactive elements: `#4a2c6d` light / `#a98bd6` dark.
  Inside a business's pages and booking flow the tint becomes that business's `--b1`,
  validated at save time for >= 4.5:1 contrast against white text.
- Never colour alone for meaning. Support `prefers-contrast: more`.

## Layout and shape

Clear grid, generous margins, safe-area insets. Nested corner radii concentric
(inner = outer − padding). Minimum 44×44px touch targets. Hairline separators;
subtle shadows for elevation only.

## Navigation and patterns

- Mobile: bottom tab bar for the four top-level destinations (Explore, Saved,
  Bookings, Account); collapsing large-title nav bar on list screens.
- Booking flow: bottom sheet with grabber + detents on mobile; centered modal on
  desktop. Destructive actions use a confirmation sheet with the destructive action
  clearly marked and a safe default.
- Segmented controls for 2–4 mutually exclusive options (day/week, sort).
- Desktop dashboard: sidebar + split view.
- Forms: correct `type`, `inputmode`, `autocomplete` per field; inline validation
  after blur; never clear what the user typed on error.
- Ask notification / WhatsApp consent in context (confirm step), explain the benefit,
  make declining easy.

## Materials (Liquid Glass)

Translucency only on the navigation layer (top bar, bottom tab bar, floating Book bar,
sheet toolbars): `backdrop-filter: blur(20px) saturate(180%)`. Never on content cards,
never glass on glass, never heavily tinted. Provide solid fallbacks for no
`backdrop-filter` and under `prefers-reduced-transparency`. Check contrast over every
background the glass can sit on.

## Motion

Purposeful, interruptible, 200–350ms, spring easing `cubic-bezier(0.2,0.8,0.2,1)`.
Motion answers the user's action. Respect `prefers-reduced-motion`; nothing depends on
motion to be understood.

## Icons

Lucide outline set at a stroke weight matching text weight. Always label icon-only
buttons.

## Accessibility — blocking, not polish

Text contrast 4.5:1 (3:1 large text / UI components), visible focus rings, full
keyboard operation, screen-reader names + states for every control, announce booking
results, respect reduced motion / reduced transparency / increased contrast.
Disabled slots are struck through, not colour-only.

## Writing

Sentence case. Labels say what happens ("Confirm booking"). Errors say what went wrong
and how to fix it, no apology. Empty states give the next action. Keep the same action
name through a whole flow.

## Per-phase design audit (run after phases 2, 3, 4, 6, 8)

Accessibility audit first (blocking), then platform conventions, dark mode, navigation
structure, forms, onboarding/permissions, Liquid Glass usage, content/writing. Report
each finding as What, Why (cite the guideline), Fix. In phase 8 also audit the whole
codebase for translucency misuse and fixed-width/custom-bar patterns that break
adaptive layouts.
