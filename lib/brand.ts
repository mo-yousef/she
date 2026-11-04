/**
 * Brand-colour rules (task 6.7, apple-design: "validated at save time for >= 4.5:1 against
 * white text"). Pure; the same function runs on the server (`saveBrandCore`) and live in the
 * picker, so the two can never disagree.
 *
 *  - brandPrimary (--b1): the page puts white text on it (header, primary buttons, selected
 *    states) and uses it as text on the white light surface. Both are the same inequality:
 *    contrast(primary, white) >= 4.5.
 *  - brandAccent (--b2): only ever blended into gradients at ACCENT_WEIGHT (business cards,
 *    OG image). The blended colour must also reach 4.5 against white.
 * Dark mode lightens --b1 into --b1-text (globals.css) and needs no per-business token.
 */
import { contrastRatio, mixColors, parseHex, suggestAccentVariant, suggestAccessibleVariant, WHITE } from './contrast';

export const DEFAULT_BRAND_PRIMARY = '#4a2c6d';
export const DEFAULT_BRAND_ACCENT = '#a98bd6';
export const MIN_BRAND_CONTRAST = 4.5;
/** Share of the accent in every gradient that blends it (matches the 3.6 `35%` end stop). */
export const ACCENT_WEIGHT = 0.35;

export interface BrandFieldCheck {
  /** Normalised `#rrggbb`, or null when the input is not a hex colour. */
  hex: string | null;
  /** Contrast against white (primary) or of the blended gradient colour (accent). */
  ratio: number | null;
  ok: boolean;
  /** Error code under `profile.brand.error.*` when not ok. */
  error?: 'hexInvalid' | 'brandContrastLow' | 'brandAccentContrastLow';
  /** A darker colour that passes, when the input was valid but too light. */
  suggestion?: string;
}

export interface BrandCheck {
  ok: boolean;
  brandPrimary: BrandFieldCheck;
  brandAccent: BrandFieldCheck;
}

export function checkBrand(rawPrimary: string, rawAccent: string): BrandCheck {
  const p = parseHex(rawPrimary);
  const a = parseHex(rawAccent);
  const primary: BrandFieldCheck = { hex: p, ratio: null, ok: false, error: 'hexInvalid' };
  const accent: BrandFieldCheck = { hex: a, ratio: null, ok: false, error: 'hexInvalid' };

  let effectivePrimary = p;
  if (p) {
    const ratio = contrastRatio(p, WHITE);
    primary.ratio = ratio;
    primary.ok = ratio >= MIN_BRAND_CONTRAST;
    primary.error = primary.ok ? undefined : 'brandContrastLow';
    if (!primary.ok) {
      primary.suggestion = suggestAccessibleVariant(p, MIN_BRAND_CONTRAST);
      effectivePrimary = primary.suggestion; // keeps the accent suggestion consistent with it
    }
  }
  if (a && p) {
    const ratio = contrastRatio(mixColors(p, a, ACCENT_WEIGHT), WHITE);
    accent.ratio = ratio;
    accent.ok = ratio >= MIN_BRAND_CONTRAST;
    accent.error = accent.ok ? undefined : 'brandAccentContrastLow';
    if (!accent.ok) accent.suggestion = suggestAccentVariant(effectivePrimary ?? p, a, ACCENT_WEIGHT, MIN_BRAND_CONTRAST);
  }
  // A valid accent next to an invalid primary cannot be judged yet; it is not an error by itself.
  if (a && !p) accent.error = undefined;
  return { ok: primary.ok && accent.ok, brandPrimary: primary, brandAccent: accent };
}
