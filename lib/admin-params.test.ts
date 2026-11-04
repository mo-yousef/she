import { describe, expect, it } from 'vitest';
import { businessActionsFor, parseAdminBusinessParams, parseAdminReviewParams, parseAdminUserParams, reviewActionsFor } from './admin-params';
describe('admin transitions', () => {
  it('offers only legal business actions per status', () => {
    expect(businessActionsFor('PENDING')).toEqual(['approve', 'reject', 'suspend']);
    expect(businessActionsFor('PUBLISHED')).toEqual(['suspend']);
    expect(businessActionsFor('SUSPENDED')).toEqual(['unsuspend']);
    expect(businessActionsFor('DRAFT')).toEqual([]);
  });
  it('offers only legal review actions per status', () => {
    expect(reviewActionsFor('FLAGGED')).toEqual(['keep', 'hide']);
    expect(reviewActionsFor('VISIBLE')).toEqual(['hide']);
    expect(reviewActionsFor('HIDDEN')).toEqual(['restore']);
  });
});
describe('admin params', () => {
  it('defaults and drops invalid values', () => {
    expect(parseAdminBusinessParams({})).toEqual({ status: 'PENDING', q: '', page: 1 });
    expect(parseAdminBusinessParams({ status: 'bogus', page: '-3' })).toMatchObject({ status: 'PENDING', page: 1 });
    expect(parseAdminBusinessParams({ status: 'all', q: '  Salon ', page: '4' })).toEqual({ status: 'all', q: 'Salon', page: 4 });
    expect(parseAdminReviewParams({})).toEqual({ filter: 'flagged', page: 1 });
    expect(parseAdminReviewParams({ filter: 'hidden' }).filter).toBe('hidden');
    expect(parseAdminUserParams({ q: 'x'.repeat(200) }).q).toHaveLength(80);
  });
});
