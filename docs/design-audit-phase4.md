# Design audit — Phase 4 (booking flow)

Scope: `book/page.tsx` + `components/booking/*`, confirmation page (`booked/[reference]`,
`focus-heading`, `copy-reference-button`, `booking-summary`), manage page
(`manage/[reference]`, `components/manage/*`).
Method: code read, computed contrast for the tokens in `globals.css`, tsc, eslint, Vitest (108),
message sync, Playwright e2e (5 pass on `she_cy_test`).
**Not run:** axe (`@axe-core/playwright` is not a dependency), screen reader, 200% zoom,
visual check in a browser. Fixes are verified by types/tests only, not visually.
Format: **What / Why (guideline) / Fix**. Status: Fixed or Logged (`docs/shortcuts.md`).

## 1. Accessibility (blocking)

### 1.1 Unavailable slots/days used `opacity-60` on text — Fixed
- **What:** Struck-through slots and days were dimmed with opacity, which lowers text contrast
  by an amount nobody measured (flagged in 4.1).
- **Why:** Text contrast 4.5:1; meaning never colour-only.
- **Fix:** Opacity removed. Unavailable items use `--label-secondary` on the page background,
  a `line-through`, and the "No times" label / `aria-label`. Contrast: light ≈ 5.2:1, dark ≈ 6.0:1
  (computed from the token values). Enabled items now use `--control-border` (3:1) instead of
  the faint separator, which also separates them from disabled ones.

### 1.2 Selected service/team cards were marked by border colour only — Fixed
- **What:** `aria-pressed` cards changed only their border to `--b1`; in dark mode brand colours
  can be < 3:1 on `#1c1c1e`.
- **Why:** Never colour alone; non-text contrast 3:1.
- **Fix:** Selected card gets a check icon and a `--b1-text` border (dark-safe token).

### 1.3 Turnstile failure was a silent dead end — Fixed
- **What:** If the script was blocked/offline or the widget errored, Confirm stayed disabled with
  no message and no way to retry. A failed script tag also could not be reloaded.
- **Why:** Errors say what went wrong and how to fix it; operable without guessing.
- **Fix:** Widget has a labelled "Security check" group, a loading status, and on failure an
  alert with a "Retry security check" button (failed script tag removed so retry reloads it).
  New keys in en/el/ru.

### 1.4 "Reference copied" live region sat inside the button — Fixed
- **What:** Button children are presentational in ARIA, so the status may not be announced.
- **Why:** Announce results to assistive tech.
- **Fix:** Status span moved next to the button; redundant `aria-label` removed.

### 1.5 Items checked, no change needed
- Focus rings: global `:focus-visible` (brand `--b1-text` in `.brand-scope`), 2px offset, so
  selected (filled) radios keep a visible ring against the page. The dialog inherits `.brand-scope`.
- Keyboard: date strip and slot grid are `radiogroup`s with roving tabindex; arrows/Home/End
  move focus (RTL-aware), Enter/Space select (native buttons); disabled items are skipped.
- Stepper: heading takes focus on step change, `role=progressbar` with value text,
  polite live announcement, field errors via `aria-describedby`, first invalid field focused on submit.
- Targets: all controls `min-h-11`; the 24px checkbox sits inside a 44px-high full-width label.
- Confirm sheet: native modal `<dialog>` (focus trap, Escape), initial focus on "Keep booking"
  (first in DOM, `autoFocus`), destructive action is labelled text with a danger border, not colour-only.
  Added `aria-describedby` for the body text.
- Error copy for SLOT_TAKEN / RATE_LIMITED / VERIFICATION_FAILED says what happened and what to do.
- Reduced motion: transitions use `motion-reduce:transition-none` plus the global override.
  Reduced transparency/contrast: no glass in Phase 4 surfaces; `prefers-contrast` handled by tokens.
- Status icons always come with text (confirmed/pending/cancelled).

## 2. Platform conventions — bottom sheet: keep deferring (decision)
- **What:** The rule asks for the booking flow as a bottom sheet (mobile) / modal (desktop).
- **Decision:** Not implemented. The flow is a deep-linkable page whose state lives in the URL
  (`router.push` per step for back/forward, `replace` for in-step choices) and is server-rendered
  with fresh availability. Putting it in a `<dialog>` means an intercepting/parallel route or
  manual history handling to keep refresh, back/forward and shared links working, plus
  focus/scroll-lock interplay with the on-screen keyboard. That is not cheap or low risk, and a
  hack would break the URL guarantees. Kept as a shortcut (already in `shortcuts.md`, task 4.2).
- **Page layout check:** centred `max-w-2xl` column, `pb-16`, the primary action is in normal
  flow after the fields (never fixed, so the keyboard cannot cover it), and `scroll-padding`
  keeps focused fields clear of bars. No `viewport-fit=cover`, so safe-area insets are zero;
  revisit if edge-to-edge is enabled.

## 3. Dark mode, forms, navigation
- Dark tokens apply to all surfaces; brand text uses `--b1-text`. Fine.
- Forms: `type`/`inputmode`/`autocomplete` set per field (name, tel, email, note off), validation
  on blur, errors clear only when valid, typed text is never cleared, errors have text not just colour.
- **Details live in client state only.** A refresh on Details/Review loses them and the URL is
  clamped back to the furthest valid step. Accepted: PII must not be in the URL or storage; the
  service/staff/time selection survives. Logged.
- Back: "Back" pushes the previous step (history grows), so the browser Back after using it
  walks forward through steps once more. Acceptable; logged. Leaving the flow: first step links to
  the business page; the site header is present on every step.

## 4. Liquid Glass
- No translucency on cards, forms or the sheet (solid `--surface`, `bg-black/40` backdrop only).
  Phase 4 pages do not use `.glass`. OK.

## 5. Writing and i18n
- Primary action is "Continue" on steps and "Confirm booking" at the end; no Book/Reserve variants.
  Reschedule uses "Confirm new time" (distinct action, intentional).
- **Empty states now give a next action — Fixed:** no team member ("Go back and choose another
  service"), no services, no times at all (a new `noTimesAtAll`; before it reused the
  per-date text "Pick another date", which was wrong when there are no dates), reschedule with no
  times now shows call/WhatsApp links like the other manage states.
- **English-only page titles — Fixed:** `booked` and `manage` `generateMetadata` hard-coded
  English; now use the existing `pageTitle` keys.
- Dates, times and prices use `Intl` with the page locale; ICS and WhatsApp text come from the
  `booked` messages. No hard-coded aria-labels found.
- Remaining English-only: `Not found` title in `book/page.tsx` metadata (logged).

## Open (logged in shortcuts.md)
- Default (no-brand) dark theme: `--b1-contrast` is white on the light dark-tint `#a98bd6` (~2.9:1).
  Phase 4 pages always inject a brand colour, so not reachable here; phase 6 brand validator must cover it.
- Unmeasured with a real tool: axe, screen reader, 200% zoom.
