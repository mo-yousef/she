/**
 * Pure NotificationLog mapping (task 5.4, requirement 6): SendResult -> row fields,
 * provider webhook status -> our status, and the monotonic rank order. No DB, no SDK.
 *
 * Status model (our own strings; provider text is never stored):
 *   at send time: 'SENT' on success, else the failure code (these rows have no
 *   providerId, so no webhook can ever touch them).
 *   from webhooks: QUEUED < SENT < DELIVERED < READ < FAILED|UNDELIVERED|BOUNCED < COMPLAINED.
 *
 * A callback only moves a row to a strictly higher rank, so a late 'sent' can never
 * regress 'delivered'. Decision: a failure-type callback (failed/undelivered/bounced)
 * outranks DELIVERED/READ, because providers report them as the final truth (e.g. an
 * email 'delivered' followed by an asynchronous bounce). Once a row is at a failure
 * rank, a late 'delivered' or 'read' does not clear it. COMPLAINED is the top rank
 * since a spam complaint can only follow delivery and must stay visible.
 */
import type { NotificationChannel, NotifyErrorCode, SendResult } from './types';

export type LogStatus =
  | 'SENT'
  | NotifyErrorCode
  | 'QUEUED'
  | 'DELIVERED'
  | 'READ'
  | 'FAILED'
  | 'UNDELIVERED'
  | 'BOUNCED'
  | 'COMPLAINED';

const RANK: Record<LogStatus, number> = {
  INVALID_RECIPIENT: 0,
  RATE_LIMITED: 0,
  PROVIDER_ERROR: 0,
  NOT_CONFIGURED: 0,
  QUEUED: 1,
  SENT: 2,
  DELIVERED: 3,
  READ: 4,
  FAILED: 5,
  UNDELIVERED: 5,
  BOUNCED: 5,
  COMPLAINED: 6,
};

export const statusRank = (s: LogStatus): number => RANK[s];

/** Statuses a row may currently hold for a callback to `to` to be allowed to overwrite it. */
export function overwritableBy(to: LogStatus): LogStatus[] {
  return (Object.keys(RANK) as LogStatus[]).filter((s) => RANK[s] < RANK[to]);
}

/** Row fields for a send attempt. Recipient, body and provider error text never appear here. */
export function resultToRow(result: SendResult): {
  channel: NotificationChannel;
  status: LogStatus;
  providerId: string | null;
} {
  return result.ok
    ? { channel: result.channel, status: 'SENT', providerId: result.providerId }
    : { channel: result.channel, status: result.code, providerId: null };
}

/**
 * The log has no audience column. Reschedule/cancel use the same template kind for
 * customer and business, so the business row is suffixed ':business'. (The creation
 * notice already has its own kind, 'booking-new-business'.)
 */
export function audienceTemplate(template: string, audience: 'customer' | 'business'): string {
  return audience === 'business' && !template.endsWith('-business') ? `${template}:business` : template;
}

/** Twilio MessageStatus -> ours. null = nothing worth recording (e.g. 'sending'). */
export function twilioStatus(s: string): LogStatus | null {
  switch (s) {
    case 'accepted':
    case 'scheduled':
    case 'queued':
      return 'QUEUED';
    case 'sent':
      return 'SENT';
    case 'delivered':
      return 'DELIVERED';
    case 'read':
      return 'READ';
    case 'undelivered':
      return 'UNDELIVERED';
    case 'failed':
      return 'FAILED';
    default:
      return null;
  }
}

/** Resend event type -> ours. delivery_delayed / opened / clicked are ignored. */
export function resendStatus(type: string): LogStatus | null {
  switch (type) {
    case 'email.sent':
      return 'SENT';
    case 'email.delivered':
      return 'DELIVERED';
    case 'email.bounced':
      return 'BOUNCED';
    case 'email.complained':
      return 'COMPLAINED';
    case 'email.failed':
      return 'FAILED';
    default:
      return null;
  }
}
