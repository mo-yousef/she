'use client';

import { useTransition } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { usePathname, useRouter } from '@/i18n/navigation';
import { routing } from '@/i18n/routing';

const LABELS: Record<string, string> = { en: 'EN', el: 'ΕΛ', ru: 'РУ' };

export function LocaleSwitcher() {
  const t = useTranslations('nav');
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();

  return (
    <label className="inline-flex items-center gap-2 text-[length:var(--text-subhead)]">
      <span className="sr-only">{t('language')}</span>
      <select
        aria-label={t('language')}
        value={locale}
        disabled={isPending}
        onChange={(e) => {
          const next = e.target.value;
          document.cookie = `NEXT_LOCALE=${next};path=/;max-age=31536000;samesite=lax`;
          startTransition(() => {
            router.replace(pathname, { locale: next });
          });
        }}
        className="h-11 rounded-[var(--radius-input)] border border-[color:var(--separator)] bg-[color:var(--surface)] px-3 text-[color:var(--label)]"
      >
        {routing.locales.map((l) => (
          <option key={l} value={l}>
            {LABELS[l]}
          </option>
        ))}
      </select>
    </label>
  );
}
