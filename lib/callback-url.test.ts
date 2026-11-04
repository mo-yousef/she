import { describe, expect, it } from 'vitest';
import { localeOfPath, safeCallbackPath } from './callback-url';

describe('safeCallbackPath', () => {
  const fb = '/en/dashboard';
  it('keeps same-origin relative paths with query and hash', () => {
    expect(safeCallbackPath('/el/dashboard?x=1#a', fb)).toBe('/el/dashboard?x=1#a');
  });
  it.each([
    'https://evil.example/x',
    '//evil.example',
    '/\\evil.example',
    'javascript:alert(1)',
    'dashboard',
    '/ok\n//evil.example',
    '/\t/evil.example',
    '',
  ])('rejects %j', (bad) => {
    expect(safeCallbackPath(bad, fb)).toBe(fb);
  });
  it('rejects non-strings and very long values', () => {
    expect(safeCallbackPath(undefined, fb)).toBe(fb);
    expect(safeCallbackPath(['/a'], fb)).toBe(fb);
    expect(safeCallbackPath(`/${'a'.repeat(600)}`, fb)).toBe(fb);
  });
});

describe('localeOfPath', () => {
  it('reads the locale prefix', () => {
    expect(localeOfPath('/ru/dashboard')).toBe('ru');
    expect(localeOfPath('/xx/dashboard')).toBeNull();
  });
});
