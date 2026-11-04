import { describe, expect, it } from 'vitest';
import { localizedBusinessText } from './localized-business';

const base = { tagline: 'Calm nails', about: 'About us' };
const rows = [
  { locale: 'el', tagline: 'Ήρεμα νύχια', about: null },
  { locale: 'ru', tagline: '  ', about: 'О нас' },
];

describe('localizedBusinessText', () => {
  it('uses the translation when present', () => {
    expect(localizedBusinessText(base, rows, 'el').tagline).toBe('Ήρεμα νύχια');
  });
  it('falls back per field when a translated field is empty or blank', () => {
    expect(localizedBusinessText(base, rows, 'el').about).toBe('About us');
    expect(localizedBusinessText(base, rows, 'ru')).toEqual({ tagline: 'Calm nails', about: 'О нас' });
  });
  it('falls back to the base for en, a missing locale or no list', () => {
    expect(localizedBusinessText(base, rows, 'en')).toEqual(base);
    expect(localizedBusinessText(base, undefined, 'el')).toEqual(base);
  });
  it('keeps null when neither base nor translation has text', () => {
    expect(localizedBusinessText({ tagline: null, about: null }, rows, 'ru')).toEqual({ tagline: null, about: 'О нас' });
  });
});
