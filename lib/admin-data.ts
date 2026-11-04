/** Read side of the admin area (task 7.1). Simple counts and paged lists; callers must have passed `requireAdmin`. */
import type { Prisma } from '@prisma/client';
import { db } from './db';
import { ADMIN_PAGE_SIZE, type BusinessFilter, type ReviewFilter } from './admin-params';
const DAY = 86_400_000;
export async function loadAdminMetrics(now: Date = new Date()) {
  const d7 = new Date(now.getTime() - 7 * DAY);
  const d30 = new Date(now.getTime() - 30 * DAY);
  const [byStatus, bookings7, bookings30, users30, openReports] = await Promise.all([
    db.business.groupBy({ by: ['status'], _count: { _all: true } }),
    db.booking.count({ where: { createdAt: { gte: d7 } } }),
    db.booking.count({ where: { createdAt: { gte: d30 } } }),
    db.user.count({ where: { createdAt: { gte: d30 } } }),
    db.review.count({ where: { status: 'FLAGGED' } }),
  ]);
  const status = { DRAFT: 0, PENDING: 0, PUBLISHED: 0, SUSPENDED: 0 };
  for (const r of byStatus) status[r.status] = r._count._all;
  return { status, pendingApprovals: status.PENDING, bookings7, bookings30, users30, openReports };
}
const skip = (page: number) => (page - 1) * ADMIN_PAGE_SIZE;
export async function loadAdminBusinesses(p: { status: BusinessFilter; q: string; page: number }) {
  const where: Prisma.BusinessWhereInput = {
    ...(p.status === 'all' ? {} : { status: p.status }),
    ...(p.q ? { OR: [{ name: { contains: p.q, mode: 'insensitive' } }, { slug: { contains: p.q, mode: 'insensitive' } }] } : {}),
  };
  const [total, rows] = await Promise.all([
    db.business.count({ where }),
    db.business.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      skip: skip(p.page),
      take: ADMIN_PAGE_SIZE,
      select: { id: true, slug: true, name: true, city: true, status: true, createdAt: true },
    }),
  ]);
  return { total, rows };
}
export async function loadAdminReviews(p: { filter: ReviewFilter; page: number }) {
  const where: Prisma.ReviewWhereInput =
    p.filter === 'flagged' ? { status: 'FLAGGED' } : p.filter === 'hidden' ? { status: 'HIDDEN' } : {};
  const [total, rows] = await Promise.all([
    db.review.count({ where }),
    db.review.findMany({
      where,
      // FLAGGED first in the "all" view, then newest.
      orderBy: [{ status: 'desc' }, { createdAt: 'desc' }, { id: 'asc' }],
      skip: skip(p.page),
      take: ADMIN_PAGE_SIZE,
      select: { id: true, rating: true, body: true, status: true, createdAt: true, authorName: true, business: { select: { name: true, slug: true } } },
    }),
  ]);
  // Latest report reason per flagged review: only in the `review.flag` audit meta.
  const flagged = rows.filter((r) => r.status === 'FLAGGED').map((r) => r.id);
  const reasons = new Map<string, string>();
  if (flagged.length) {
    const logs = await db.auditLog.findMany({
      where: { action: 'review.flag', OR: flagged.map((id) => ({ meta: { path: ['reviewId'], equals: id } })) },
      orderBy: { createdAt: 'desc' },
      select: { meta: true },
    });
    for (const l of logs) {
      const m = l.meta as { reviewId?: string; reason?: string } | null;
      if (m?.reviewId && m.reason && !reasons.has(m.reviewId)) reasons.set(m.reviewId, m.reason);
    }
  }
  return { total, rows: rows.map((r) => ({ ...r, reason: reasons.get(r.id) ?? null })) };
}
export async function loadAdminUsers(p: { q: string; page: number }) {
  const where: Prisma.UserWhereInput = p.q ? { email: { contains: p.q, mode: 'insensitive' } } : {};
  const [total, rows] = await Promise.all([
    db.user.count({ where }),
    db.user.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      skip: skip(p.page),
      take: ADMIN_PAGE_SIZE,
      select: { id: true, email: true, role: true, createdAt: true },
    }),
  ]);
  return { total, rows };
}
