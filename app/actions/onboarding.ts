'use server';

/**
 * Thin server-action wrappers for the onboarding wizard (task 6.1). All rules live in
 * `lib/onboarding.ts`. The business id is NEVER taken from the client: it is derived from
 * the signed-in owner, and each core re-checks ownership anyway.
 */
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { routing } from '@/i18n/routing';
import { findOwnerBusinessId } from '@/lib/owner-auth';
import { formToObject, type StepState } from '@/lib/onboarding-schema';
import {
  saveFirstServiceCore,
  saveHoursCore,
  saveLocationCore,
  startOnboardingCore,
  submitForReviewCore,
  type OnboardingResult,
} from '@/lib/onboarding';
import { revalidateBusinessPublic } from '@/lib/revalidate-public';

type Step = 'basics' | 'location' | 'hours' | 'services';
const NEXT: Record<Step, string> = { basics: 'location', location: 'hours', hours: 'services', services: 'review' };

function localeOf(fd: FormData): string {
  const l = String(fd.get('locale') ?? '');
  return (routing.locales as readonly string[]).includes(l) ? l : routing.defaultLocale;
}

async function run(step: Step, fd: FormData): Promise<StepState> {
  const locale = localeOf(fd);
  const session = await auth();
  const userId = session?.user?.id ?? null;
  const raw = formToObject(fd, step === 'basics' ? ['languages'] : []);
  delete raw.locale;

  let result: OnboardingResult;
  if (step === 'basics') {
    result = await startOnboardingCore(userId, raw);
  } else {
    const businessId = userId ? await findOwnerBusinessId(userId) : null;
    if (!businessId) redirect(`/${locale}/onboarding?step=basics`);
    result =
      step === 'location'
        ? await saveLocationCore(userId, businessId, raw)
        : step === 'hours'
          ? await saveHoursCore(userId, businessId, raw)
          : await saveFirstServiceCore(userId, businessId, raw);
  }
  if (!result.ok) {
    return { code: result.code, errors: result.errors ?? {}, values: raw };
  }
  revalidateBusinessPublic(result.business);
  redirect(`/${locale}/onboarding?step=${NEXT[step]}`);
}

export async function saveBasicsAction(_prev: StepState, fd: FormData) {
  return run('basics', fd);
}
export async function saveLocationAction(_prev: StepState, fd: FormData) {
  return run('location', fd);
}
export async function saveHoursAction(_prev: StepState, fd: FormData) {
  return run('hours', fd);
}
export async function saveServicesAction(_prev: StepState, fd: FormData) {
  return run('services', fd);
}

/** "Submit for review": the checklist is re-validated server-side in the core. */
export async function submitForReviewAction(_prev: StepState, fd: FormData): Promise<StepState> {
  const locale = localeOf(fd);
  const session = await auth();
  const userId = session?.user?.id ?? null;
  const businessId = userId ? await findOwnerBusinessId(userId) : null;
  if (!businessId) redirect(`/${locale}/onboarding?step=basics`);
  const result = await submitForReviewCore(userId, businessId);
  if (!result.ok) {
    return { code: result.code, errors: result.missing ? { missing: result.missing.join(',') } : {}, values: {} };
  }
  revalidateBusinessPublic(result.business);
  redirect(`/${locale}/dashboard`);
}
