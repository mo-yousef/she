'use server';
/** Account deletion (req 9, task 7.2). The user comes from the session only, never from input. */
import { cookies } from 'next/headers';
import { revalidateTag } from 'next/cache';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { deleteAccountCore } from '@/lib/gdpr-server';
import { availabilityTag } from '@/lib/next-slot';

const schema = z.object({ confirmEmail: z.string().trim().max(254) });

export type DeleteAccountActionResult =
  | { ok: true }
  | { ok: false; code: 'UNAUTHENTICATED' | 'EMAIL_MISMATCH' | 'OWNS_BUSINESS' | 'UNKNOWN' };

export async function deleteAccountAction(input: unknown): Promise<DeleteAccountActionResult> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, code: 'UNAUTHENTICATED' };
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, code: 'EMAIL_MISMATCH' };
  try {
    const res = await deleteAccountCore(session.user.id, parsed.data.confirmEmail, new Date());
    if (!res.ok) return { ok: false, code: res.code === 'NOT_FOUND' ? 'UNAUTHENTICATED' : res.code };
    for (const id of res.businessIds) revalidateTag(availabilityTag(id));
    // Session rows are gone; drop the now-dangling cookies too (plain and __Secure- variants).
    const jar = await cookies();
    jar.delete('authjs.session-token');
    jar.delete('__Secure-authjs.session-token');
    return { ok: true };
  } catch (e) {
    console.error('deleteAccount failed', e instanceof Error ? e.name : 'unknown');
    return { ok: false, code: 'UNKNOWN' };
  }
}
