'use server';

/**
 * Thin server-action wrappers for the dashboard calendar (task 6.2). All rules live in the
 * lib cores; these only resolve the session, derive the business from the owner (never from
 * client input), call the core, and revalidate. Cores already re-check ownership.
 */
import { auth } from '@/lib/auth';
import { findOwnerBusinessId } from '@/lib/owner-auth';
import { createManualBookingCore, type ManualBookingResult } from '@/lib/manual-booking';
import {
  createBlockCore,
  deleteBlockCore,
  type CreateBlockResult,
  type DeleteBlockResult,
} from '@/lib/block';
import {
  changeBookingStatusCore,
  type ChangeStatusResult,
} from '@/lib/booking-status-change';
import { queueBookingNotice } from '@/lib/notify/booking-notices';
import { revalidateAfterOwnerEdit } from '@/lib/owner-effects';

async function ownerBusinessId(): Promise<{
  userId: string | null;
  businessId: string | null;
}> {
  const session = await auth();
  const userId = session?.user?.id ?? null;
  const businessId = userId ? await findOwnerBusinessId(userId) : null;
  return { userId, businessId };
}

function revalidateCalendar(slug: string, businessId: string) {
  // Booking-level change: the public page renders no per-booking data, only the cached
  // next-slot tag is affected. The bookings table (6.3) shows the same rows as the calendar.
  revalidateAfterOwnerEdit({ business: { id: businessId, slug }, surfaces: ['availability', 'calendar', 'bookings'] });
}

export async function createManualBooking(raw: unknown): Promise<ManualBookingResult> {
  const { userId, businessId } = await ownerBusinessId();
  if (!businessId) return { ok: false, code: userId ? 'FORBIDDEN' : 'UNAUTHENTICATED' };
  const result = await createManualBookingCore(userId, businessId, raw);
  if (result.ok) {
    revalidateCalendar(result.slug, result.businessId);
    if (result.created && result.hasContact) {
      // Owner made this booking themselves: no "new booking" notice back to them.
      queueBookingNotice('created', result.bookingId, { skipBusiness: true });
    }
  }
  return result;
}

export async function createBlock(raw: unknown): Promise<CreateBlockResult> {
  const { userId, businessId } = await ownerBusinessId();
  if (!businessId) return { ok: false, code: userId ? 'FORBIDDEN' : 'UNAUTHENTICATED' };
  const result = await createBlockCore(userId, businessId, raw);
  if (result.ok) revalidateCalendar(result.slug, result.businessId);
  return result;
}

export async function deleteBlock(blockId: string): Promise<DeleteBlockResult> {
  const { userId, businessId } = await ownerBusinessId();
  if (!businessId) return { ok: false, code: userId ? 'FORBIDDEN' : 'UNAUTHENTICATED' };
  const result = await deleteBlockCore(userId, businessId, blockId);
  if (result.ok) revalidateCalendar(result.slug, result.businessId);
  return result;
}

export async function changeBookingStatus(
  bookingId: string,
  to: string,
): Promise<ChangeStatusResult> {
  const { userId, businessId } = await ownerBusinessId();
  if (!businessId) return { ok: false, code: userId ? 'FORBIDDEN' : 'UNAUTHENTICATED' };
  const result = await changeBookingStatusCore(userId, businessId, bookingId, to);
  if (result.ok) {
    revalidateCalendar(result.slug, result.businessId);
    if (result.notifyCancelled)
      queueBookingNotice('cancelled', bookingId, { skipBusiness: true });
  }
  return result;
}
