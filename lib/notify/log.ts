/**
 * NotificationLog DB writes (task 5.4, requirement 6). Never stores recipients,
 * message bodies, or provider error text; the pure mapping lives in `status.ts`.
 * Neither function throws: a logging failure must not affect booking flows or cron.
 */
import { db } from '../db';
import { overwritableBy, resultToRow, type LogStatus } from './status';
import type { SendResult } from './types';

export async function recordNotification(args: {
  bookingId: string;
  template: string;
  result: SendResult;
}): Promise<void> {
  try {
    await db.notificationLog.create({
      data: { bookingId: args.bookingId, template: args.template, ...resultToRow(args.result) },
    });
  } catch (e) {
    console.error('[notify] recordNotification failed', e instanceof Error ? e.name : 'unknown');
  }
}

/**
 * Applies a provider status callback to the row(s) with this providerId. Atomic and
 * monotonic: the UPDATE only matches rows currently at a lower rank. Unknown ids match
 * nothing (callers still answer 200 so the provider stops retrying). Returns rows changed.
 */
export async function applyProviderStatus(providerId: string, to: LogStatus): Promise<number> {
  try {
    const r = await db.notificationLog.updateMany({
      where: { providerId, status: { in: overwritableBy(to) } },
      data: { status: to },
    });
    return r.count;
  } catch (e) {
    console.error('[notify] applyProviderStatus failed', e instanceof Error ? e.name : 'unknown');
    return 0;
  }
}
