'use server';
/** Account deletion (req 9, task 7.2). The user comes from the session only, never from input. */
import { revalidateTag } from 'next/cache';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getCurrentUser } from '@/lib/current-user';
import { deleteAccountCore } from '@/lib/gdpr-server';
import { availabilityTag } from '@/lib/next-slot';

const schema = z.object({ confirmEmail: z.string().trim().max(254) });

export type DeleteAccountActionResult =
  | { ok: true }
  | { ok: false; code: 'UNAUTHENTICATED' | 'EMAIL_MISMATCH' | 'OWNS_BUSINESS' | 'UNKNOWN' };

export async function deleteAccountAction(input: unknown): Promise<DeleteAccountActionResult> {
  const supabase = await createClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();

  const appUser = await getCurrentUser();
  if (!appUser) return { ok: false, code: 'UNAUTHENTICATED' };

  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, code: 'EMAIL_MISMATCH' };

  try {
    const res = await deleteAccountCore(appUser.id, parsed.data.confirmEmail, new Date());
    if (!res.ok) return { ok: false, code: res.code === 'NOT_FOUND' ? 'UNAUTHENTICATED' : res.code };
    for (const id of res.businessIds) revalidateTag(availabilityTag(id));

    // Remove the Supabase auth identity so the account cannot sign back in.
    // Requires the service-role key; if unset we still sign the user out below.
    const admin = createAdminClient();
    if (admin && authUser?.id) {
      const { error } = await admin.auth.admin.deleteUser(authUser.id);
      if (error) console.error('supabase deleteUser failed', error.name);
    }

    // Clear the local session cookies.
    await supabase.auth.signOut();
    return { ok: true };
  } catch (e) {
    console.error('deleteAccount failed', e instanceof Error ? e.name : 'unknown');
    return { ok: false, code: 'UNKNOWN' };
  }
}
