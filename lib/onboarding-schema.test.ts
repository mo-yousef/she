import { describe, expect, it } from 'vitest';
import { basicsSchema, fieldErrors, firstServiceSchema, formToObject, locationSchema, parseHoursForm } from './onboarding-schema';

describe('locationSchema', () => {
  const base = { address: '1 Main St', phone: '', whatsapp: '', instagram: '', website: '', lat: '', lng: '' };
  it('normalises phone, instagram and website', () => {
    const r = locationSchema.parse({ ...base, phone: '99 123456', whatsapp: '0035799123456', instagram: '@studio.cy', website: 'www.example.com' });
    expect(r).toMatchObject({ phone: '+35799123456', whatsapp: '+35799123456', instagram: 'studio.cy', website: 'https://www.example.com' });
  });
  it('rejects bad values with key suffixes', () => {
    const r = locationSchema.safeParse({ ...base, phone: 'abc', instagram: 'a b', website: 'javascript:alert(1)' });
    expect(!r.success && fieldErrors(r.error)).toMatchObject({ phone: 'phoneInvalid', instagram: 'instagramInvalid', website: 'websiteInvalid' });
  });
  it('requires lat and lng together, inside the Cyprus box', () => {
    expect(locationSchema.safeParse({ ...base, lat: '34.9' }).success).toBe(false);
    expect(locationSchema.safeParse({ ...base, lat: '34,9', lng: '33.6' }).success).toBe(true);
    expect(locationSchema.safeParse({ ...base, lat: '51', lng: '33.6' }).success).toBe(false);
  });
});

describe('basics and service schemas', () => {
  it('requires at least one language and a known category/city', () => {
    const r = basicsSchema.safeParse({ name: 'Studio', category: 'x', city: 'Mars', languages: [] });
    expect(!r.success && fieldErrors(r.error)).toMatchObject({ category: 'categoryRequired', city: 'cityRequired', languages: 'languagesRequired' });
  });
  it('turns a decimal price into integer cents', () => {
    const r = firstServiceSchema.parse({ serviceName: 'Mani', serviceCategory: 'nails', durationMin: '45', price: '25,5', staffName: 'Ann' });
    expect(r).toMatchObject({ price: 2550, durationMin: 45 });
  });
});

describe('parseHoursForm', () => {
  const week = (over: Record<string, string> = {}) => {
    const o: Record<string, string> = {};
    for (let d = 0; d <= 6; d++) Object.assign(o, { [`open-${d}`]: '09:00', [`close-${d}`]: '17:30' });
    return { ...o, ...over };
  };
  it('parses a valid week and honours the closed checkbox', () => {
    const r = parseHoursForm(week({ 'closed-0': 'on' }));
    expect(r.ok && r.days.find((d) => d.weekday === 0)?.closed).toBe(true);
    expect(r.ok && r.days.find((d) => d.weekday === 1)).toMatchObject({ opensMin: 540, closesMin: 1050 });
  });
  it('reports unparsable and inverted times per weekday', () => {
    expect(parseHoursForm(week({ 'open-2': '' }))).toEqual({ ok: false, errors: [{ weekday: 2, code: 'range' }] });
    expect(parseHoursForm(week({ 'close-3': '08:00' }))).toEqual({ ok: false, errors: [{ weekday: 3, code: 'closeBeforeOpen' }] });
  });
});

describe('formToObject', () => {
  it('collects repeated keys only for multi fields and drops React internals', () => {
    const fd = new FormData();
    fd.append('languages', 'en');
    fd.append('languages', 'el');
    fd.append('name', 'x');
    fd.append('$ACTION_ID_abc', '1');
    expect(formToObject(fd, ['languages'])).toEqual({ languages: ['en', 'el'], name: 'x' });
    expect(formToObject(new FormData(), ['languages'])).toEqual({ languages: [] });
  });
});
