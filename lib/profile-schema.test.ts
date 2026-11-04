import { describe, expect, it } from 'vitest';
import { parseProfile } from './profile-schema';

const valid = {
  name: 'Lotus Studio',
  category: 'nails',
  city: 'Limassol',
  languages: ['en'],
  tagline: '',
  about: '',
  address: '1 Main Street',
  phone: '',
  whatsapp: '',
  instagram: '',
  website: '',
  lat: '',
  lng: '',
};

describe('parseProfile', () => {
  it('accepts a minimal profile and defaults the translations to empty', () => {
    const r = parseProfile(valid);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.translations).toEqual({ el: {}, ru: {} });
  });
  it('reports field errors keyed by field, including nested translations', () => {
    const r = parseProfile({ ...valid, name: '', city: 'Atlantis', lat: '35', translations: { el: { tagline: 'x'.repeat(121) } } });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors).toMatchObject({ name: 'nameRequired', city: 'cityRequired', lng: 'coordPair', 'translations.el.tagline': 'taglineTooLong' });
    }
  });
  it('survives non-object input', () => {
    expect(parseProfile(null).ok).toBe(false);
  });
});
