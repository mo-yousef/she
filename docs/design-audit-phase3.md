# Design audit — Phase 3 (business profile page)

Scope: `app/[locale]/b/[slug]/page.tsx` (branded header, sticky sidebar, mobile bottom bar,
reviews), `components/gallery.tsx`, `components/business-map*.tsx`, `lib/seo.ts` and
`opengraph-image.tsx`. Method: code read plus computed contrast ratios (WCAG relative
luminance) for the six seeded brand colours and four stress colours (default purple,
hot pink `#e91e63`, gold `#d4af37`, pastel pink `#f4a6c0`). **Not run:** browser, axe,
screen reader, 200% text zoom. Everything marked "Fixed" is verified by type-check, message
sync and unit tests only, not visually.

Format: **What / Why (guideline) / Fix**. Status: Fixed, or Logged (in `docs/shortcuts.md`).

## 1. Accessibility (blocking)

### 1.1 Header gradient mixed a light accent behind white text — Fixed
- **What:** Header background was `b1 → 65% b1 + 35% b2`. White-on-gradient-end contrast
  measured: glow 3.77:1, bliss 4.49:1 (below 4.5). Tagline, city and open/closed text are
  15px, so they need 4.5:1.
- **Why:** Accessibility, text contrast 4.5:1 (3:1 large text).
- **Fix:** Gradient now only darkens `b1` (`78% b1 + black`), so contrast is never below
  white-on-`b1` anywhere in the header (seeds 5.9–11.2:1). `--b2` is no longer used in the
  header (still used by the OG image).

### 1.2 Brand colour used as text/graphic on the dark surface — Fixed
- **What:** "Today" hours row, "Show all reviews", "Open in Maps", team initials, address
  icon, distribution-bar fill and focus rings used raw `--b1`. On `#1c1c1e` the seeded colours
  measure 1.5–2.9:1 (fail 4.5:1 text and 3:1 non-text).
- **Why:** Accessibility, contrast 4.5:1 / 3:1 for UI; dark mode must stay legible.
- **Fix:** New `--b1-text` token on `.brand-scope` (`globals.css`). Light theme: equals `--b1`.
  Dark theme (both `prefers-color-scheme` and `data-theme='dark'`): `b1` mixed 50% with white,
  which gives ≥ 6:1 on `#1c1c1e` for all seeds (4.3:1 even for pure black). Text, icons,
  bar fill and focus rings use it. Filled buttons keep `--b1` + `--b1-contrast`, and the white
  header button keeps `--b1` text on white.

### 1.3 Nothing enforces ≥ 4.5:1 for owner-chosen brand colours — Logged (KNOWN GAP, phase 6)
- **What:** `Business.brandPrimary/brandAccent` are free hex strings (defaults only). The page
  hard-codes white text on `--b1` (`--b1-contrast: #fff`, never computed) and uses `--b1`
  directly as text in the light theme. A light colour fails everywhere: gold `#d4af37` is
  2.1:1 (white on it) and pastel `#f4a6c0` is 1.9:1. Hot pink `#e91e63` is 4.35:1, which also
  fails. Seeded colours all pass.
- **Why:** apple-design: "validated at save time for >= 4.5:1 contrast against white text".
- **Fix:** Not built here, by instruction. Phase 6.7 (brand colours picker) must reject or
  adjust colours below 4.5:1 against white, and must also guarantee `--b1` as light-theme text
  on `#fff`. Until then, any non-seed business can ship an unreadable page. OG image has the same
  exposure (see 6.2).

### 1.4 Focus rings on brand-tinted elements — Fixed / Pass
- Header (`.brand-on-dark`) uses a white ring on the brand fill (≥ 4.5:1 by 1.1). Page body uses
  `--b1-text` (now ≥ 3:1 in both themes, see 1.2). Gallery lightbox controls: brand ring plus a 4px
  white halo on the black scrim, pass. Map container gets an explicit ring (Leaflet focuses it for
  keyboard pan/zoom).

### 1.5 Gallery lightbox keyboard operation — Fixed
- **What:** Native `<dialog>` + `showModal()` gives focus trap, inert background, Escape, and focus
  return to the thumbnail. Arrow keys step through photos. But the dialog content mounts after
  `showModal()`, so initial focus landed on the dialog element, not a control.
- **Why:** Keyboard operation; screen-reader users should land on a labelled control.
- **Fix:** `autoFocus` on the close button. Buttons are 44px, labelled, counter is a polite
  status. Swipe is an extra, not the only path. Escape and scrim click close.

### 1.6 Touch targets — Fixed / Pass
- Book buttons, contact buttons, links, gallery thumbs, lightbox controls, favourite: ≥ 44px.
- **Fixed:** Leaflet zoom buttons were 30px; now 44px (`.map-tiles .leaflet-bar a`).
- Logged: the OSM attribution link stays small (legal requirement; inline text link).

### 1.7 Sticky sidebar cut off on short viewports — Fixed
- **What:** `lg:sticky` on a sidebar (book card + hours + contact + map ≈ 740px) taller than a
  laptop viewport or a 200% zoom. The lower part sticks below the fold and cannot be reached
  until the page ends.
- **Why:** Accessibility (reflow, zoom 200%), "layout survives 200%".
- **Fix:** `.profile-sticky` is sticky only at `min-width:1024px` and `min-height:56rem`; otherwise
  the sidebar scrolls normally. `html` also gets `scroll-padding` so focused elements are not hidden
  under the sticky top bar (5rem) or the mobile bottom bar (6rem, below `lg`).

### 1.8 Reduced motion / transparency / contrast — Pass
- Motion: global reduced-motion rule, thumbnail and button scale are `motion-reduce` guarded,
  Leaflet `zoomAnimation` off when reduced, no other animation.
- Transparency: `.glass` has a solid fallback for no `backdrop-filter` and under
  `prefers-reduced-transparency`.
- Contrast: `prefers-contrast: more` makes secondary labels full-strength and borders solid. Not
  checked: the header's `ring-white/40` logo ring and `opacity-90` tagline (decorative; text stays
  ≥ 4.5:1 with white at 90%).

### 1.9 Meaning never colour-only — Pass
- Verified badge: icon + "Verified visit" text + border. Open/closed: dot + "Open now"/"Closed"
  text. Distribution bars: "5★" label, numeric count, and `aria-label` with percent. Rating:
  number beside the star. Today's hours: bold plus colour.
- **Fixed:** the bar `aria-label` read "1 stars", and ru used the abbreviation "зв.", which screen
  readers spell badly. Now ICU plurals in en/el/ru.

### 1.10 Names and structure — Fixed
- **What:** (a) Every service had an identical "Book" link. (b) Sidebar "Opening hours" was an
  `h3` after the reviews `h2`, so it nested under Reviews. (c) "N min" was hard-coded English.
- **Why:** Accessibility (screen-reader names); translations en/el/ru.
- **Fix:** (a) `aria-label="Book {service}"` (starts with visible text, so label-in-name holds).
  (b) now `h2`. (c) new `durationMin` key in en/el/ru.
- Not fixed (logged): contact card has no heading.

## 2. Platform conventions

- Pass: system font stack, Apple text scale tokens, nested radii, hairline separators, 44px targets.
- Pass: external links open in a new tab with `rel="noopener noreferrer"`. `tel:` and `wa.me` links
  are native.
- **Fixed:** text links ("Show all reviews", "Open in Maps") were colour-only until hover; now
  underlined at rest (WCAG 1.4.1, use of colour).

## 3. Dark mode

- Brand header stays a saturated fill with white text in both themes. This is intended: the business
  colour is the signature element. Contrast is guaranteed by 1.1 for seed colours. Brand text/rings
  use `--b1-text` (1.2). Review cards and the owner-reply inset use theme tokens and pass.
- Map: tile inversion is a CSS approximation (already logged). Marker uses `--b1` with a white 3px
  stroke, so it reads on both tile themes.
- Logged: a very light brand colour fills the header in dark mode as a bright block (see 1.3).

## 4. Navigation

- Mobile: single column, the info cards (hours, contact, map) sit after the reviews, so hours and
  address are far down the page. The fixed bar keeps Book reachable. Acceptable; logged as a
  possible "Hours & location" jump link.
- Desktop: sticky sidebar now degrades safely (1.7). Sidebar `top-6rem` clears the 4rem header.
- Logged: the site header "Skip to content" link is hard-coded English and `#main` is not verified
  on this page (platform chrome from phase 1/2).

## 5. Liquid Glass

- Pass: `.glass` appears only on the mobile bottom bar (and the site header, nav layer). Cards,
  gallery scrim (`backdrop:bg-black/90`, solid) and map are opaque. No glass on glass.
- Logged, unverified: contrast of bar text over arbitrary content scrolling beneath the blur.

## 6. SEO / OG image

- 6.1 Pass: `lib/seo.ts` is pure, JSON-LD is escaped for `<`, hreflang includes x-default.
- 6.2 Logged: `opengraph-image.tsx` draws white text over `c1 → c2`. With a light brand colour
  the text is unreadable. Same root cause as 1.3, so the phase 6 validator covers it. Also its
  `alt` is English-only and the 404 `generateMetadata` title is the English string "Not found".

## 7. Forms

None on this page.

## 8. Writing

- Sentence case throughout. Labels say what happens ("Book now", "Show all reviews", "Open in
  Maps"). Empty reviews state explains when reviews appear. Photo empty state is
  informational. No action to offer to a visitor.
- Fixed: translated duration and plural star labels (1.9, 1.10).
- Note: the per-service button reads "Book" while the header/sidebar read "Book now". Short form is
  deliberate in a dense list. Ru uses "Записаться" for both.

## Not verified

No browser, axe, VoiceOver/NVDA, or 200% zoom run. `color-mix`, `:has()` and the `min-height` media
query were not exercised visually. Contrast numbers are computed, not measured on rendered pixels.
