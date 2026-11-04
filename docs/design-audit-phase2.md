# Phase 2 design audit

Scope: home, search, sort control, search filters, results grid, business card,
favourite button, favourites page, loading.tsx files, skeleton and empty states.
Method: code review against the apple-design rule. No browser or axe run (see the end).

## Fixed (blocking accessibility)

1. **Secondary text contrast**
   - What: `--label-secondary` in light mode (rgba 60,60,67 at 0.6) is about 3.3:1 on white. It styles card meta, ratings, counts, hints and unselected sort labels.
   - Why: Accessibility, text contrast 4.5:1.
   - Fix: alpha raised to 0.75 (about 5:1 or better on surface and grouped background). Dark mode was already above 4.5:1.

2. **Input and select borders**
   - What: controls used `--separator` (0.18 alpha), about 1.4:1 against the surface.
   - Why: Accessibility, UI components 3:1.
   - Fix: new `--control-border` token (light 0.6 alpha, dark 0.45 alpha), used on search, city, select and checkbox controls.

3. **Card focus ring clipped**
   - What: the card link fills an `overflow-hidden` article, so its 2px offset outline was cut off.
   - Why: Accessibility, visible focus rings.
   - Fix: inset outline offset on the card link, with a matching radius.

4. **Favourite button**
   - What: (a) the focus ring could vanish over a brand-coloured cover. (b) `disabled` while pending dropped keyboard focus. (c) the failure message was screen-reader-only, so sighted users got no feedback.
   - Why: Accessibility (focus visible, keyboard operation, errors say what went wrong). Liquid Glass, translucency on the navigation layer only.
   - Fix: surface halo on focus. `aria-disabled` plus a guard in the handler. Visible `role="status"` error under the button. Removed `backdrop-blur` and the 80% opacity background, so the button is solid.

5. **Sort segmented control**
   - What: `disabled` while the transition was pending dropped focus.
   - Why: Accessibility, keyboard operation.
   - Fix: `aria-disabled` plus a guard.

6. **Global focus style and theme tokens**
   - What: (a) the global `:focus-visible` forced `border-radius: 4px`, which squared the ring on round and pill controls. (b) `data-theme` overrides did not set `--success` or `--danger`, so a manual light theme under an OS dark preference used dark-mode colours.
   - Why: Accessibility (focus visible, contrast). Dark mode.
   - Fix: removed the forced radius. Added success and danger to both overrides.

7. **Increased contrast**
   - What: no `prefers-contrast: more` support.
   - Why: Accessibility, increased contrast.
   - Fix: media block that makes secondary text, separators and control borders full-strength.

## Passed

- Touch targets: all controls are at least 44px (`min-h-11`, `h-11 w-11`, `h-12`).
- Reduced motion is handled globally. Hover lifts and scales are covered by that rule.
- Meaning is never colour-only. Open and closed has a dot plus text. Rating has a number. Selected sort uses `aria-pressed`.
- Forms use `type="search"`, `inputMode` and `autoComplete`. Typed text is kept on submit.
- Skeletons use `role="status"` with an `sr-only` label. The placeholders are `aria-hidden`.
- Empty states give a next action (clear filters, browse, list your business, sign in). Copy is sentence case in en, el and ru.
- Glass is not used on content. The favourite button was the only offender.

## Left for later (non-blocking, logged in docs/shortcuts.md)

- Search page jumps from h1 to h3 (card titles) with no h2.
- Search text field state does not resync when the URL `q` changes via back or forward.
- Result count and filter-change results are not a live region. Inserted live regions announce unreliably.
- The home search fields have placeholder-only visible labels, and city is free text (resolved typo-tolerantly server-side) instead of a select.
- Favourite sign-in redirect and the favourites empty state link to `/account`, which is a known gap and already logged.
- Mobile bottom tab bar and collapsing large title (nav layer) are not part of the Phase 2 surfaces.
- Business page loading.tsx not audited (Phase 3).

## Not verified

No browser, axe or Lighthouse run. Contrast ratios are computed by hand from the token values. Focus rings, the favourite error placement and the dark theme are unverified visually.
