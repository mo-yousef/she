import { describe, expect, it } from 'vitest';
import { localizedService } from './localized-service';

const base = { name: 'Manicure', description: 'Classic' };
const rows = [
  { locale: 'el', name: 'Μανικιούρ', description: null },
  { locale: 'ru', name: '  ', description: 'Классика' },
];

describe('localizedService', () => {
  it('uses the translation when present', () => {
    expect(localizedService(base, rows, 'el').name).toBe('Μανικιούρ');
  });
  it('falls back per field when a translated field is empty', () => {
    expect(localizedService(base, rows, 'el').description).toBe('Classic');
    expect(localizedService(base, rows, 'ru')).toEqual({ name: 'Manicure', description: 'Классика' });
  });
  it('falls back to the base for en or a missing locale/list', () => {
    expect(localizedService(base, rows, 'en')).toEqual(base);
    expect(localizedService(base, undefined, 'el')).toEqual(base);
  });
});
