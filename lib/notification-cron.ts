/**
 * Scheduled customer notices (task 5.3, requirement 6): 24h and 2h reminders and the
 * post-appointment review request. Server-only. The route handler is a thin auth
 * wrapper around `runNotificationCron`.
 *
 * Idempotency: each kind has a nullable timestamp column on Booking. A booking is
 * CLAIMED with an atomic `updateMany ... WHERE col IS NULL` before anything is sent, so
 * overlapping or retried runs can never both send it. If the send hard-fails with
 * nothing delivered, the claim is released and the next run retries (the time window
 * bounds how long that can go on).
 *
 * Returns counts only: no ids, no PII.
 */
import { captureError } from '@/lib/monitoring';
import { db } from './db';
import type { Notifier } from './notify/types';
import { isDue, queryWindow, type NotificationKind } from './reminder-windows';

/** Sends one notice; 'retry' means nothing was delivered and the claim should be released. */
export type SendFn = (kind: NotificationKind, bookingId: string) => Promise<'done' | 'retry'>;

/**
 * Default sender, loaded lazily so the claim logic can run (and be tested) without the
 * template/React Email import chain.
 */
async function defaultSend(notifier: Notifier | undefined): Promise<SendFn> {
  const { sendBookingReminder } = await import('./notify/booking-notices');
  return (kind, id) => sendBookingReminder(kind, id, { notifier });
}

export interface CronCounts {
  reminder24h: number;
  reminder2h: number;
  reviewRequest: number;
  /** Claims released for retry because nothing could be delivered. */
  failed: number;
}

const DEFAULT_BATCH = 200;
const CONCURRENCY = 10;

const CLAIM = {
  'reminder-24h': { column: 'reminder24SentAt', status: 'CONFIRMED', count: 'reminder24h' },
  'reminder-2h': { column: 'reminder2SentAt', status: 'CONFIRMED', count: 'reminder2h' },
  'review-request': { column: 'reviewRequestedAt', status: 'COMPLETED', count: 'reviewRequest' },
} as const satisfies Record<NotificationKind, { column: string; status: string; count: keyof CronCounts }>;

const KINDS: NotificationKind[] = ['reminder-24h', 'reminder-2h', 'review-request'];

async function processKind(kind: NotificationKind, now: Date, batch: number, send: SendFn, counts: CronCounts) {
  const { column, status, count } = CLAIM[kind];
  const win = queryWindow(kind, now);
  const candidates = await db.booking.findMany({
    where: { status, [column]: null, [win.field]: { gt: win.gt, lte: win.lte } },
    orderBy: { [win.field]: 'asc' },
    take: batch,
    select: { id: true, status: true, createdAt: true, startsAt: true, endsAt: true },
  });
  const due = candidates.filter((b) => isDue[kind](b, now));

  const handle = async (id: string) => {
    try {
      const claimed = await db.booking.updateMany({ where: { id, status, [column]: null }, data: { [column]: now } });
      if (claimed.count !== 1) return; // another run got it, or it was cancelled meanwhile
      const outcome = await send(kind, id);
      if (outcome === 'done') {
        counts[count] += 1;
      } else {
        await db.booking.updateMany({ where: { id, [column]: now }, data: { [column]: null } });
        counts.failed += 1;
      }
    } catch (e) {
      // Name only: Prisma messages can echo values. The claim stays, so a crash here
      // loses at most this one notice rather than risking a duplicate.
      console.error(`[cron] ${kind} item failed`, e instanceof Error ? e.name : 'unknown');
      captureError(e, { area: 'cron', action: kind });
      counts.failed += 1;
    }
  };

  for (let i = 0; i < due.length; i += CONCURRENCY) {
    await Promise.all(due.slice(i, i + CONCURRENCY).map((b) => handle(b.id)));
  }
}

export async function runNotificationCron(
  opts: { now?: Date; notifier?: Notifier; send?: SendFn; batch?: number } = {},
): Promise<CronCounts> {
  const now = opts.now ?? new Date();
  const batch = opts.batch ?? DEFAULT_BATCH;
  const counts: CronCounts = { reminder24h: 0, reminder2h: 0, reviewRequest: 0, failed: 0 };
  const send = opts.send ?? (await defaultSend(opts.notifier));
  for (const kind of KINDS) {
    try {
      await processKind(kind, now, batch, send, counts);
    } catch (e) {
      console.error(`[cron] ${kind} query failed`, e instanceof Error ? e.name : 'unknown');
      counts.failed += 1;
    }
  }
  return counts;
}
