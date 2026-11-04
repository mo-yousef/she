import { describe, expect, it } from 'vitest';
import {
  contrastRatio,
  displayRatio,
  mixColors,
  parseHex,
  readableTextOn,
  suggestAccentVariant,
  suggestAccessibleVariant,
} from './contrast';

function hue(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255) as [number, number, number];
  const max = Math.max(r, g, b);
  const d = max - Math.min(r, g, b);
  if (d === 0) return 0;
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return (h * 60 + 360) % 360;
}

describe('parseHex', () => {
  it('normalises #rgb, #rrggbb, case and missing #', () => {
    expect(parseHex('#ABC')).toBe('#aabbcc');
    expect(parseHex(' #4A2C6D ')).toBe('#4a2c6d');
    expect(parseHex('4a2c6d')).toBe('#4a2c6d');
  });
  it('rejects anything else', () => {
    for (const bad of ['', '#12', '#12345', '#1234567', '#ggg', 'red', 'rgb(0,0,0)', '#ff00ff;}']) expect(parseHex(bad)).toBeNull();
  });
});

describe('contrastRatio', () => {
  it('black on white is 21:1 and symmetric', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 5);
    expect(contrastRatio('#ffffff', '#000000')).toBeCloseTo(21, 5);
    expect(contrastRatio('#fff', '#fff')).toBeCloseTo(1, 5);
  });
  it('matches the audit reference values', () => {
    expect(contrastRatio('#777777', '#ffffff')).toBeCloseTo(4.48, 2);
    expect(contrastRatio('#d4af37', '#ffffff')).toBeCloseTo(2.1, 1);
    expect(contrastRatio('#f4a6c0', '#ffffff')).toBeCloseTo(1.9, 1);
    expect(contrastRatio('#e91e63', '#ffffff')).toBeCloseTo(4.35, 1);
  });
});

describe('displayRatio', () => {
  it('never rounds up across the 4.5 threshold', () => {
    expect(displayRatio(4.4999)).toBe(4.49);
    expect(displayRatio(4.5)).toBe(4.5);
  });
});

describe('mixColors', () => {
  it('matches color-mix(in srgb) per channel', () => {
    expect(mixColors('#000000', '#ffffff', 0.5)).toBe('#808080');
    expect(mixColors('#ff0000', '#0000ff', 0)).toBe('#ff0000');
    expect(mixColors('#ff0000', '#0000ff', 1)).toBe('#0000ff');
    // 65% #4a2c6d + 35% #a98bd6 (the old gradient end stop)
    expect(mixColors('#4a2c6d', '#a98bd6', 0.35)).toBe('#6b4d92');
  });
});

describe('readableTextOn', () => {
  it('picks white on dark and black on light', () => {
    expect(readableTextOn('#4a2c6d')).toBe('#ffffff');
    expect(readableTextOn('#f4a6c0')).toBe('#000000');
  });
});

describe('suggestAccessibleVariant', () => {
  const failing = ['#d4af37', '#f4a6c0', '#e91e63', '#777777', '#ffff00', '#a98bd6', '#00e5ff', '#ffffff', '#ff8800'];
  it('always reaches 4.5:1 against white and keeps the hue', () => {
    for (const hex of failing) {
      const s = suggestAccessibleVariant(hex);
      expect(contrastRatio(s, '#ffffff')).toBeGreaterThanOrEqual(4.5);
      if (hex !== '#ffffff' && hex !== '#777777') expect(Math.abs(hue(s) - hue(hex))).toBeLessThan(12);
    }
  });
  it('returns a passing colour unchanged', () => {
    expect(suggestAccessibleVariant('#4a2c6d')).toBe('#4a2c6d');
  });
  it('handles near-black and a custom minimum', () => {
    expect(suggestAccessibleVariant('#000000')).toBe('#000000');
    expect(contrastRatio(suggestAccessibleVariant('#ff8800', 7), '#ffffff')).toBeGreaterThanOrEqual(7);
  });
});

describe('suggestAccentVariant', () => {
  it('darkens the accent until the 35% blend passes', () => {
    const primary = '#4a2c6d';
    const accent = '#ffff00';
    expect(contrastRatio(mixColors(primary, accent, 0.35), '#ffffff')).toBeLessThan(4.5);
    const s = suggestAccentVariant(primary, accent, 0.35);
    expect(contrastRatio(mixColors(primary, s, 0.35), '#ffffff')).toBeGreaterThanOrEqual(4.5);
  });
});
