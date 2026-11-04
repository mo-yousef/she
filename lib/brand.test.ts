import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DEFAULT_BRAND_ACCENT, DEFAULT_BRAND_PRIMARY, checkBrand } from './brand';
import { contrastRatio, mixColors } from './contrast';

describe('checkBrand', () => {
  it('accepts good colours and normalises them', () => {
    const c = checkBrand('#4A2C6D', '#A98BD6');
    expect(c.ok).toBe(true);
    expect(c.brandPrimary.hex).toBe('#4a2c6d');
  });
  it('rejects a light primary with ratio and a passing suggestion', () => {
    const c = checkBrand('#d4af37', '#4a2c6d');
    expect(c.ok).toBe(false);
    expect(c.brandPrimary.error).toBe('brandContrastLow');
    expect(c.brandPrimary.ratio).toBeLessThan(4.5);
    expect(contrastRatio(c.brandPrimary.suggestion!, '#ffffff')).toBeGreaterThanOrEqual(4.5);
  });
  it('rejects an accent whose 35% blend is too light, with a passing suggestion', () => {
    const c = checkBrand('#6b4c97', '#ffff00');
    expect(c.brandPrimary.ok).toBe(true);
    expect(c.brandAccent.error).toBe('brandAccentContrastLow');
    expect(contrastRatio(mixColors('#6b4c97', c.brandAccent.suggestion!, 0.35), '#ffffff')).toBeGreaterThanOrEqual(4.5);
  });
  it('a light accent is fine when the primary is dark enough to carry the blend', () => {
    expect(checkBrand('#2a1a3d', '#ffffff').ok).toBe(true);
  });
  it('flags malformed hex', () => {
    const c = checkBrand('nope', '#12');
    expect(c.brandPrimary.error).toBe('hexInvalid');
    expect(c.brandAccent.error).toBe('hexInvalid');
  });
});

describe('seeded and default colours', () => {
  it('platform defaults pass', () => {
    expect(checkBrand(DEFAULT_BRAND_PRIMARY, DEFAULT_BRAND_ACCENT).ok).toBe(true);
  });
  it('every business colour pair in prisma/seed.ts passes', () => {
    const src = readFileSync(new URL('../prisma/seed.ts', import.meta.url), 'utf8');
    const pairs = [...src.matchAll(/brandPrimary: '(#[0-9a-f]{6})',\s*brandAccent: '(#[0-9a-f]{6})'/gi)].map((m) => [m[1]!, m[2]!] as const);
    expect(pairs.length).toBeGreaterThanOrEqual(6);
    for (const [p, a] of pairs) {
      const c = checkBrand(p, a);
      expect({ p, a, ok: c.ok }).toEqual({ p, a, ok: true });
    }
  });
});
