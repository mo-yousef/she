/**
 * Admin authorisation (task 7.1, req 5). Server-only, DB-backed: the role is re-read from the
 * database on every call, never taken from the session. A missing user and a non-admin
 * answer differently only for signed-out vs signed-in, so ids cannot be probed.
 * The session-bound page helper lives in `admin-session.ts`.
 */
import { db } from './db';
export type AdminAuthCode = 'UNAUTHENTICATED' | 'FORBIDDEN';
export class AdminAuthError extends Error {
  constructor(readonly code: AdminAuthCode) {
    super(code);
    this.name = 'AdminAuthError';
  }
}
/** Throws `AdminAuthError` unless `userId` is an ADMIN in the database. */
export async function assertAdmin(userId: string | null | undefined): Promise<{ id: string }> {
  if (!userId) throw new AdminAuthError('UNAUTHENTICATED');
  const user = await db.user.findUnique({ where: { id: userId }, select: { id: true, role: true } });
  if (!user) throw new AdminAuthError('UNAUTHENTICATED');
  if (user.role !== 'ADMIN') throw new AdminAuthError('FORBIDDEN');
  return { id: user.id };
}
export function adminAuthCode(e: unknown): AdminAuthCode {
  if (e instanceof AdminAuthError) return e.code;
  throw e;
}
