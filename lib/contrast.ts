/**
 * Small WCAG 2.x colour helpers (task 6.7). Pure, no dependencies. Used by the brand-colour
 * validator on the server and live in the picker.
 */
export const WHITE = '#ffffff';
export const BLACK = '#000000';

/** `#rgb` / `#rrggbb` (with or without `#`, any case) -> lowercase `#rrggbb`, else null. */
export function parseHex(input: string): string | null {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(input.trim());
  if (!m) return null;
  const h = m[1]!.toLowerCase();
  const full = h.length === 3 ? [...h].map((c) => c + c).join('') : h;
  return `#${full}`;
}

type Rgb = [number, number, number];

function rgb(hex: string): Rgb {
  const p = parseHex(hex);
  if (!p) throw new Error('invalid hex colour');
  return [1, 3, 5].map((i) => parseInt(p.slice(i, i + 2), 16)) as Rgb;
}

const toHex = (c: Rgb) => `#${c.map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')).join('')}`;

/** WCAG relative luminance, 0 (black) to 1 (white). */
export function relativeLuminance(hex: string): number {
  const lin = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  const [r, g, b] = rgb(hex);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/** WCAG contrast ratio, 1 to 21, symmetric. */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** Two-decimal display value that never rounds UP across a threshold (4.499 shows 4.49). */
export const displayRatio = (ratio: number) => Math.floor(ratio * 100) / 100;

/**
 * Same as CSS `color-mix(in srgb, a (1-w), b w)`: per-channel linear interpolation in sRGB.
 * `weightOfB` is 0..1.
 */
export function mixColors(a: string, b: string, weightOfB: number): string {
  const ca = rgb(a);
  const cb = rgb(b);
  return toHex(ca.map((v, i) => v * (1 - weightOfB) + cb[i]! * weightOfB) as Rgb);
}

/** Whichever of white / black reads better on `bg`. */
export function readableTextOn(bg: string): string {
  return contrastRatio(bg, WHITE) >= contrastRatio(bg, BLACK) ? WHITE : BLACK;
}

function toHsl(hex: string): [number, number, number] {
  const [r8, g8, b8] = rgb(hex);
  const [r, g, b] = [r8 / 255, g8 / 255, b8 / 255] as Rgb;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return [0, 0, l];
  const s = d / (1 - Math.abs(2 * l - 1));
  let h: number;
  if (max === r) h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return [(h * 60 + 360) % 360, s, l];
}

function fromHsl(h: number, s: number, l: number): string {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return toHex([(r + m) * 255, (g + m) * 255, (b + m) * 255]);
}

/** Darken in 1% HSL-lightness steps (hue and saturation kept) until `ok` holds. Black always passes any sane `ok`. */
function darkenUntil(hex: string, ok: (candidate: string) => boolean): string {
  const start = parseHex(hex);
  if (!start) throw new Error('invalid hex colour');
  if (ok(start)) return start;
  const [h, s, l] = toHsl(start);
  for (let step = 1; step <= 100; step++) {
    const candidate = fromHsl(h, s, Math.max(0, l - step / 100));
    if (ok(candidate)) return candidate;
  }
  return BLACK;
}

/** Closest darker variant of `hex` with contrast against white >= `min` (default 4.5). */
export function suggestAccessibleVariant(hex: string, min = 4.5): string {
  return darkenUntil(hex, (c) => contrastRatio(c, WHITE) >= min);
}

/** Darker accent such that `mixColors(primary, accent, weight)` reaches `min` against white. */
export function suggestAccentVariant(primary: string, accent: string, weight: number, min = 4.5): string {
  return darkenUntil(accent, (c) => contrastRatio(mixColors(primary, c, weight), WHITE) >= min);
}
