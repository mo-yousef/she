/**
 * GDPR DB side (req 9, task 7.2): export loader, account deletion core, retention job.
 * Server-only. Pure policy lives in lib/gdpr.ts. Nothing here logs or audits PII (counts/ids only).
 */
import type { Prisma } from '@prisma/client';
import { db } from './db';
import { writeAudit } from './audit';
import { ACTIVE } from './booking';
import {
  ANONYMISED_BOOKING,
  ANONYMISED_REVIEW,
  RETENTION_BATCH,
  retentionCutoffs,
  type ExportRows,
} from './gdpr';

/** Bookings that belong to a user: linked to the account, or made as a guest with its VERIFIED email. */
function userBookingWhere(userId: string, verifiedEmail: string | null): Prisma.BookingWhereInput {
  return {
    OR: [
      { customerId: userId },
      ...(verifiedEmail ? [{ guestEmail: { equals: verifiedEmail, mode: 'insensitive' as const } }] : []),
    ],
  };
}

export async function loadExportRows(userId: string): Promise<ExportRows | null> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { name: true, email: true, emailVerified: true, phone: true, locale: true, role: true, createdAt: true },
  });
  if (!user) return null;
  const bookings = await db.booking.findMany({
    where: userBookingWhere(userId, user.emailVerified ? user.email : null),
    orderBy: { startsAt: 'asc' },
    select: {
      reference: true,
      status: true,
      startsAt: true,
      endsAt: true,
      priceCents: true,
      note: true,
      guestName: true,
      guestEmail: true,
      guestPhone: true,
      consentTermsAt: true,
      consentMessagesAt: true,
      consentVersion: true,
      business: { select: { name: true, slug: true } },
      service: { select: { name: true } },
      staff: { select: { name: true } },
      review: { select: { rating: true, body: true, authorName: true, createdAt: true, ownerReply: true } },
    },
  });
  const favourites = await db.favourite.findMany({
    where: { userId },
    orderBy: { createdAt: 'asc' },
    select: { business: { select: { name: true, slug: true } } },
  });
  return { user, bookings, favourites };
}

export type DeleteAccountResult =
  | { ok: true; bookings: number; reviews: number; businessIds: string[] }
  | { ok: false; code: 'NOT_FOUND' | 'EMAIL_MISMATCH' | 'OWNS_BUSINESS' };

/**
 * Erases an account. Owners are refused (their businesses and customers' bookings depend on
 * them): they must contact support. Future active bookings are cancelled first so the slot frees
 * and the business is not left with an unreachable customer. Bookings and reviews are anonymised,
 * not deleted, so business accounting and rating aggregates stay valid (review body is blanked).
 */
export async function deleteAccountCore(userId: string, confirmEmail: string, now: Date): Promise<DeleteAccountResult> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { email: true, emailVerified: true, _count: { select: { businesses: true } } },
  });
  if (!user) return { ok: false, code: 'NOT_FOUND' };
  if (!user.email || user.email.toLowerCase() !== confirmEmail.trim().toLowerCase()) {
    return { ok: false, code: 'EMAIL_MISMATCH' };
  }
  if (user._count.businesses > 0) return { ok: false, code: 'OWNS_BUSINESS' };

  return db.$transaction(async (tx) => {
    const where = userBookingWhere(userId, user.emailVerified ? user.email : null);
    const rows = await tx.booking.findMany({
      where,
      select: { id: true, businessId: true, status: true, startsAt: true },
    });
    const ids = rows.map((r) => r.id);
    const futureActive = rows.filter(
      (r) => (ACTIVE as readonly string[]).includes(r.status) && r.startsAt > now,
    );
    if (futureActive.length > 0) {
      await tx.booking.updateMany({
        where: { id: { in: futureActive.map((r) => r.id) } },
        data: { status: 'CANCELLED_BY_CUSTOMER', cancelledAt: now },
      });
    }
    await tx.booking.updateMany({ where: { id: { in: ids } }, data: ANONYMISED_BOOKING });
    const reviews = await tx.review.updateMany({ where: { bookingId: { in: ids } }, data: ANONYMISED_REVIEW });
    await tx.phoneVerification.deleteMany({ where: { bookingId: { in: ids } } });
    await tx.favourite.deleteMany({ where: { userId } });
    await tx.session.deleteMany({ where: { userId } });
    await tx.account.deleteMany({ where: { userId } });
    await tx.verificationToken.deleteMany({ where: { identifier: user.email! } });
    await tx.user.delete({ where: { id: userId } });
    await writeAudit(
      { actorId: null, businessId: null, action: 'user.delete', meta: { bookings: ids.length, reviews: reviews.count } },
      tx,
    );
    return {
      ok: true as const,
      bookings: ids.length,
      reviews: reviews.count,
      businessIds: [...new Set(futureActive.map((r) => r.businessId))],
    };
  });
}

export interface RetentionCounts {
  phoneVerifications: number;
  notificationLogs: number;
  bookingsAnonymised: number;
  verificationTokens: number;
  sessions: number;
}

/** Daily retention pass. Each table is capped at RETENTION_BATCH rows per run. */
export async function runRetention(now: Date): Promise<RetentionCounts> {
  const c = retentionCutoffs(now);
  const take = RETENTION_BATCH;

  const pv = await db.phoneVerification.findMany({
    where: { createdAt: { lt: c.phoneVerificationBefore } },
    select: { id: true },
    take,
  });
  const phoneVerifications = (await db.phoneVerification.deleteMany({ where: { id: { in: pv.map((r) => r.id) } } })).count;

  const nl = await db.notificationLog.findMany({
    where: { sentAt: { lt: c.notificationLogBefore } },
    select: { id: true },
    take,
  });
  const notificationLogs = (await db.notificationLog.deleteMany({ where: { id: { in: nl.map((r) => r.id) } } })).count;

  // Only rows that still hold PII, so a finished row is never picked twice.
  const bk = await db.booking.findMany({
    where: {
      endsAt: { lt: c.bookingEndedBefore },
      OR: [
        { guestEmail: { not: null } },
        { guestPhone: { not: null } },
        { note: { not: null } },
        { customerId: { not: null } },
        { guestName: { not: null }, NOT: { guestName: ANONYMISED_BOOKING.guestName } },
      ],
    },
    select: { id: true },
    take,
  });
  const bookingsAnonymised = (
    await db.booking.updateMany({ where: { id: { in: bk.map((r) => r.id) } }, data: ANONYMISED_BOOKING })
  ).count;

  const vt = await db.verificationToken.findMany({ where: { expires: { lt: now } }, select: { token: true }, take });
  const verificationTokens = (await db.verificationToken.deleteMany({ where: { token: { in: vt.map((r) => r.token) } } })).count;

  const ss = await db.session.findMany({ where: { expires: { lt: now } }, select: { id: true }, take });
  const sessions = (await db.session.deleteMany({ where: { id: { in: ss.map((r) => r.id) } } })).count;

  return { phoneVerifications, notificationLogs, bookingsAnonymised, verificationTokens, sessions };
}
