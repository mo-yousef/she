/**
 * Audit log writer (req 5.1; 6.9 reviews coverage across 6.x). Ids and field names ONLY:
 * never names, emails, phones or free text. Pass `client` to write inside a transaction.
 */
import type { Prisma } from '@prisma/client';
import { db } from './db';

export type AuditMeta = Record<string, string | number | boolean | null | string[]>;

export interface AuditEntry {
  actorId: string | null;
  businessId: string | null;
  /** Dotted verb, e.g. "business.create", "business.basics", "business.publish". */
  action: string;
  meta?: AuditMeta;
}

export async function writeAudit(entry: AuditEntry, client: Prisma.TransactionClient | typeof db = db): Promise<void> {
  await client.auditLog.create({
    data: {
      actorId: entry.actorId,
      businessId: entry.businessId,
      action: entry.action,
      meta: entry.meta ?? undefined,
    },
  });
}
