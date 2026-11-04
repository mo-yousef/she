/**
 * Publish checklist (req 5.1, task 6.1). Pure: the server computes it from counts and
 * re-runs it inside the publish core, so the client can never publish an incomplete listing.
 */

export const CHECKLIST_KEYS = ['name', 'category', 'city', 'address', 'service', 'staff', 'hours', 'photo'] as const;
export type ChecklistKey = (typeof CHECKLIST_KEYS)[number];

/** Where the owner fixes an unmet item. `photos` is fixed in the profile editor (`/dashboard/profile#photos`), not a wizard step. */
export type OnboardingStep = 'basics' | 'location' | 'hours' | 'services' | 'photos';
export const ONBOARDING_STEPS: readonly OnboardingStep[] = ['basics', 'location', 'hours', 'services', 'photos'];

const FIX_STEP: Record<ChecklistKey, OnboardingStep> = {
  name: 'basics',
  category: 'basics',
  city: 'basics',
  address: 'location',
  service: 'services',
  staff: 'services',
  hours: 'hours',
  photo: 'photos',
};

export interface ChecklistInput {
  name: string | null | undefined;
  category: string | null | undefined;
  city: string | null | undefined;
  address: string | null | undefined;
  /** Active services. */
  serviceCount: number;
  /** Active staff who perform at least one active service (otherwise nobody is bookable). */
  staffCount: number;
  /** Weekdays that are open (not closed, close after open). */
  openDayCount: number;
  photoCount: number;
}

export interface ChecklistItem {
  key: ChecklistKey;
  done: boolean;
  /** i18n key under `onboarding.checklist.*`. */
  labelKey: `checklist.${ChecklistKey}`;
  step: OnboardingStep;
}

const filled = (v: string | null | undefined) => !!v && v.trim().length > 0;

export function publishChecklist(b: ChecklistInput): { items: ChecklistItem[]; canPublish: boolean } {
  const done: Record<ChecklistKey, boolean> = {
    name: filled(b.name),
    category: filled(b.category),
    city: filled(b.city),
    address: filled(b.address),
    service: b.serviceCount >= 1,
    staff: b.staffCount >= 1,
    hours: b.openDayCount >= 1,
    photo: b.photoCount >= 1,
  };
  const items = CHECKLIST_KEYS.map((key) => ({
    key,
    done: done[key],
    labelKey: `checklist.${key}` as const,
    step: FIX_STEP[key],
  }));
  return { items, canPublish: items.every((i) => i.done) };
}
