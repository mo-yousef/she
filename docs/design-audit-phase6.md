# Design audit — Phase 6 (owner dashboard)
Scope: `app/[locale]/dashboard/*`, `components/{calendar,bookings,services,team,profile,settings,reviews}`,
`publish-checklist-view`, `globals.css` tint tokens.
Method: code read, computed contrast from tokens, tsc, eslint, Vitest, message sync, build, Playwright e2e.
**Not run:** axe, screen reader, 200% zoom. Fixes are verified by types and e2e, not visually.
Format: **What / Why (guideline) / Fix**. Status: Fixed or Logged (`docs/shortcuts.md`).

## Fixed
### 1. Checklist "Fix this" links were identical
- **What:** Several unmet items rendered the same link text.
- **Why:** Screen-reader names for every control; labels say what happens.
- **Fix:** `aria-label` "Fix this: {item}" (`onboarding.checklistFixNamed`, en/el/ru).

### 2. Greek/Russian fieldsets repeated "Tagline", "About", "Name"
- **What:** Translation fields had identical names across languages.
- **Why:** Unique accessible names.
- **Fix:** `aria-label` includes the language, e.g. "Tagline (Ελληνικά)", in profile and service forms.

### 3. Bookings table and card list both in DOM
- **What:** Both render; confirmed the hidden one is `hidden` / `lg:hidden` (`display: none`), so it is out of the accessibility tree.
- **Why:** No duplicate content for assistive tech.
- **Fix:** None needed.

### 4. `calendar.error.CHANGED` said "Reload the calendar" in bookings
- **What:** Wrong wording outside the calendar.
- **Why:** Errors say how to fix it, accurately.
- **Fix:** Neutral "Reload the page and try again" (en/el/ru).

### 5. `FormSheet` fixed title id
- **What:** `form-sheet-title` could collide if two sheets mounted.
- **Fix:** `useId`-based id.

### 6. Dark-mode primary buttons: white on `#a98bd6` ≈ 2.9:1
- **Why:** Text contrast 4.5:1.
- **Fix:** Dark `--tint-contrast` is `#1c1c1e` (≈ 6:1 on the tint), in the media query and `data-theme='dark'`.

## Logged
- Soft 404 on public business page; `--b1-text` dark-mode review (phase 8).
