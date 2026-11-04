import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { routing } from '@/i18n/routing';
import { isLegalPage, LEGAL_PAGES, type LegalSection } from '@/lib/legal';
import { languageAlternates, localizedUrl } from '@/lib/seo';

export const dynamicParams = false;

export function generateStaticParams() {
  return routing.locales.flatMap((locale) => LEGAL_PAGES.map((page) => ({ locale, page })));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; page: string }>;
}): Promise<Metadata> {
  const { locale, page } = await params;
  if (!isLegalPage(page)) return {};
  const t = await getTranslations({ locale, namespace: 'legal.pages' });
  const path = `/legal/${page}`;
  return {
    title: t(`${page}.title`),
    alternates: { canonical: localizedUrl(locale, path), languages: languageAlternates(path) },
  };
}

export default async function LegalPage({
  params,
}: {
  params: Promise<{ locale: string; page: string }>;
}) {
  const { locale, page } = await params;
  if (!isLegalPage(page)) notFound();
  setRequestLocale(locale);
  const t = await getTranslations('legal');
  const sections = t.raw(`pages.${page}.sections`) as LegalSection[];
  const date = new Intl.DateTimeFormat(locale, { dateStyle: 'long', timeZone: 'UTC' }).format(
    new Date(`${t(`pages.${page}.updated`)}T00:00:00Z`),
  );

  return (
    <article className="mx-auto max-w-[75ch] px-4 pb-24 pt-10">
      <h1 className="text-[length:var(--text-large-title)] font-bold tracking-tight">
        {t(`pages.${page}.title`)}
      </h1>
      <p className="mt-2 text-[length:var(--text-footnote)] text-[color:var(--label-secondary)]">
        {t('lastUpdated', { date })}
      </p>
      <p className="mt-6">{t(`pages.${page}.intro`)}</p>
      {sections.map((s) => (
        <section key={s.heading} className="mt-8">
          <h2 className="text-[length:var(--text-title2)] font-semibold">{s.heading}</h2>
          {s.paragraphs.map((p) => (
            <p key={p} className="mt-3">
              {p}
            </p>
          ))}
        </section>
      ))}
    </article>
  );
}
