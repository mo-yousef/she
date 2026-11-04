'use client';

import { useTranslations } from 'next-intl';
import { Check, Circle } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import type { ChecklistItem, OnboardingStep } from '@/lib/publish-checklist';

const STEP_HREF: Record<OnboardingStep, string> = {
  basics: '/onboarding?step=basics',
  location: '/onboarding?step=location',
  hours: '/onboarding?step=hours',
  services: '/onboarding?step=services',
  photos: '/dashboard/profile#photos',
};

/** Renders the server-computed checklist; each unmet item links to the step that fixes it. */
export function PublishChecklistView({ items, locale }: { items: ChecklistItem[]; locale: string }) {
  const t = useTranslations('onboarding');
  return (
    <ul className="divide-y divide-[color:var(--separator)] rounded-[var(--radius-card)] bg-[color:var(--surface)]">
      {items.map((item) => (
        <li key={item.key} className="flex items-center gap-3 p-3">
          {item.done ? (
            <Check className="h-5 w-5 flex-none text-[color:var(--success)]" aria-hidden />
          ) : (
            <Circle className="h-5 w-5 flex-none text-[color:var(--label-secondary)]" aria-hidden />
          )}
          <span className={item.done ? 'flex-1' : 'flex-1 font-medium'}>
            {t(item.labelKey)}
            <span className="sr-only">{item.done ? t('checklistDone') : t('checklistNotDone')}</span>
          </span>
          {item.done ? null : (
            <Link
              href={STEP_HREF[item.step]}
              locale={locale}
              aria-label={t('checklistFixNamed', { item: t(item.labelKey) })}
              className="inline-flex min-h-11 items-center text-[color:var(--tint)] underline-offset-2 hover:underline"
            >
              {t('checklistFix')}
            </Link>
          )}
        </li>
      ))}
    </ul>
  );
}
