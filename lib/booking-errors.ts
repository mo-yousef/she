/**
 * Classification of database write errors raised while creating a booking.
 * Pure (no Prisma import) so it is unit-testable. Prisma surfaces a Postgres
 * exclusion violation (SQLSTATE 23P01) as an "unknown request" error, so we look
 * at every place the code can show up instead of relying on one shape.
 */

type ErrLike = { code?: unknown; message?: unknown; meta?: unknown };

function parts(e: unknown): { code: string; metaCode: string; message: string; target: string } {
  const x = (e && typeof e === 'object' ? e : {}) as ErrLike;
  const meta = (x.meta && typeof x.meta === 'object' ? x.meta : {}) as Record<string, unknown>;
  const t = meta.target;
  return {
    code: typeof x.code === 'string' ? x.code : '',
    metaCode: typeof meta.code === 'string' ? meta.code : '',
    message: typeof x.message === 'string' ? x.message : '',
    target: Array.isArray(t) ? t.join(',') : typeof t === 'string' ? t : '',
  };
}

/** True when the double-booking exclusion constraint (booking_no_overlap) fired. */
export function isExclusionViolation(e: unknown): boolean {
  const p = parts(e);
  return (
    p.code === '23P01' ||
    p.metaCode === '23P01' ||
    p.message.includes('23P01') ||
    p.message.includes('booking_no_overlap') ||
    p.message.includes('exclusion constraint')
  );
}

/** True for a foreign-key violation (Prisma P2003 / SQLSTATE 23503), e.g. the service was deleted mid-booking. */
export function isForeignKeyViolation(e: unknown): boolean {
  const p = parts(e);
  return p.code === 'P2003' || p.code === '23503' || p.metaCode === '23503' || p.message.includes('23503');
}

/** Which unique column a Prisma P2002 hit: the retry key, the reference, or something else. */
export function uniqueViolationOn(e: unknown): 'idempotencyKey' | 'reference' | 'other' | null {
  const p = parts(e);
  if (p.code !== 'P2002') return null;
  const where = `${p.target} ${p.message}`;
  if (where.includes('idempotencyKey')) return 'idempotencyKey';
  if (where.includes('reference')) return 'reference';
  return 'other';
}
