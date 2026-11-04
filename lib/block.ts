/**
 * Time-block creation/removal (task 6.2, req 5.1). Server-only.
 *
 * Policy: a block overlapping an existing active booking is REJECTED (count only, no
 * PII) so the owner resolves the booking first — blocks never silently swallow a booking.
 * Recurring series are expanded up-front (lib/block-expansion.ts) and written in ONE
 * transaction, all-or-nothing: either every occurrence for every selected staff member is
 * created, or none are.
 */
import { db } from './db';
import { assertOwnsBusiness, ownerAuthCode } from './owner-auth';
import { hasConflict, lockStaff } from './booking-lock';
import { isExclusionViolation } from './booking-errors';
import { writeAudit } from './audit';
import {
  expandBlockOccurrences,
  MAX_BLOCK_ROWS,
  type Recurrence,
} from './block-expansion';
import { createBlockInputSchema } from './calendar-schema';

export type CreateBlockResult =
  | { ok: true; businessId: string; slug: string; created: number }
  | {
    ok: false;
    code: 'UNAUTHENTICATED' | 'FORBIDDEN' | 'VALIDATION' | 'OVERLAP' | 'UNKNOWN';
    errors?: Record<string, string>;
    /** Dates (not people) where the block would overlap a booking or block: count and up to 10 local dates. */
    conflictCount?: number;
    conflictDates?: string[];
  };

export async function createBlockCore(
  userId: string | null | undefined,
  businessId: string,
  raw: unknown,
): Promise<CreateBlockResult> {
  let owned;
  try {
    owned = await assertOwnsBusiness(userId, businessId);
  } catch (e) {
    return { ok: false, code: ownerAuthCode(e) };
  }

  const parsed = createBlockInputSchema.safeParse(raw);
  if (!parsed.success) {
    const errors: Record<string, string> = {};
    for (const issue of parsed.error.issues)
      errors[String(issue.path[0] ?? 'form')] ??= issue.message;
    return { ok: false, code: 'VALIDATION', errors };
  }
  const input = parsed.data;

  const expanded = expandBlockOccurrences({
    dateKey: input.dateKey,
    startMin: input.startMin,
    endMin: input.endMin,
    recurrence: input.recurrence as Recurrence,
    untilKey: input.untilKey,
  });
  if (!expanded.ok)
    return { ok: false, code: 'VALIDATION', errors: { form: expanded.code } };

  const staffRows =
    input.staffId === 'all'
      ? await db.staffMember.findMany({
        where: { businessId: owned.business.id, active: true },
        select: { id: true },
      })
      : await db.staffMember.findMany({
        where: { id: input.staffId, businessId: owned.business.id },
        select: { id: true },
      });
  if (staffRows.length === 0)
    return { ok: false, code: 'VALIDATION', errors: { staffId: 'notFound' } };

  const totalRows = staffRows.length * expanded.occurrences.length;
  if (totalRows > MAX_BLOCK_ROWS)
    return { ok: false, code: 'VALIDATION', errors: { form: 'tooManyOccurrences' } };

  try {
    const created = await db.$transaction(async (tx) => {
      await lockStaff(
        tx,
        staffRows.map((s) => s.id),
      );
      const conflictDates = new Set<string>();
      for (const staff of staffRows) {
        for (const occ of expanded.occurrences) {
          if (await hasConflict(tx, staff.id, occ.startsAt, occ.endsAt)) conflictDates.add(occ.dateKey);
        }
      }
      if (conflictDates.size > 0) return { conflictDates: [...conflictDates].sort() };

      for (const staff of staffRows) {
        for (const occ of expanded.occurrences) {
          await tx.block.create({
            data: {
              businessId: owned.business.id,
              staffId: staff.id,
              startsAt: occ.startsAt,
              endsAt: occ.endsAt,
              reason: input.reason ?? null,
            },
          });
        }
      }
      await writeAudit(
        {
          actorId: owned.user.id,
          businessId: owned.business.id,
          action: 'block.create',
          meta: {
            staffCount: staffRows.length,
            occurrences: expanded.occurrences.length,
            recurrence: input.recurrence,
          },
        },
        tx,
      );
      return { conflictDates: [] as string[], rows: staffRows.length * expanded.occurrences.length };
    });

    if (created.conflictDates.length > 0) {
      return {
        ok: false,
        code: 'OVERLAP',
        conflictCount: created.conflictDates.length,
        conflictDates: created.conflictDates.slice(0, 10),
      };
    }
    return {
      ok: true,
      businessId: owned.business.id,
      slug: owned.business.slug,
      created: created.rows ?? 0,
    };
  } catch (e) {
    if (isExclusionViolation(e)) return { ok: false, code: 'OVERLAP' };
    throw e;
  }
}

export type DeleteBlockResult =
  | { ok: true; businessId: string; slug: string }
  | { ok: false; code: 'UNAUTHENTICATED' | 'FORBIDDEN' | 'NOT_FOUND' };

export async function deleteBlockCore(
  userId: string | null | undefined,
  businessId: string,
  blockId: string,
): Promise<DeleteBlockResult> {
  let owned;
  try {
    owned = await assertOwnsBusiness(userId, businessId);
  } catch (e) {
    return { ok: false, code: ownerAuthCode(e) };
  }
  const block = await db.block.findUnique({
    where: { id: blockId },
    select: { id: true, businessId: true },
  });
  if (!block || block.businessId !== owned.business.id)
    return { ok: false, code: 'NOT_FOUND' };

  // Delete + audit commit together (req 5.1): never one without the other.
  await db.$transaction(async (tx) => {
    await tx.block.delete({ where: { id: blockId } });
    await writeAudit(
      { actorId: owned.user.id, businessId: owned.business.id, action: 'block.delete', meta: { blockId } },
      tx,
    );
  });
  return { ok: true, businessId: owned.business.id, slug: owned.business.slug };
}
