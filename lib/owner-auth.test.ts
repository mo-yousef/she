import { describe, expect, it } from 'vitest';
import { ownsBusiness } from './owner-auth';

describe('ownsBusiness', () => {
  const biz = { ownerId: 'u1' };
  it('allows the owning OWNER and ADMIN', () => {
    expect(ownsBusiness({ id: 'u1', role: 'OWNER' }, biz)).toBe(true);
    expect(ownsBusiness({ id: 'u1', role: 'ADMIN' }, biz)).toBe(true);
  });
  it('refuses another user, even with the OWNER role', () => {
    expect(ownsBusiness({ id: 'u2', role: 'OWNER' }, biz)).toBe(false);
    expect(ownsBusiness({ id: 'u2', role: 'ADMIN' }, biz)).toBe(false);
  });
  it('refuses the owner id when the role is not OWNER/ADMIN', () => {
    expect(ownsBusiness({ id: 'u1', role: 'CUSTOMER' }, biz)).toBe(false);
    expect(ownsBusiness({ id: 'u1', role: 'STAFF' }, biz)).toBe(false);
  });
});
