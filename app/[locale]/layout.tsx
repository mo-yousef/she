import type { ReactNode } from 'react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Inter } from 'next/font/google';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages, setRequestLocale } from 'next-intl/server';
import { routing } from '@/i18n/routing';
import { siteUrl } from '@/lib/seo';
import { SiteHeader } from '@/components/site-header';
import { ThemeScript } from '@/components/theme-script';
import '../globals.css';

const inter = Inter({
  subsets: ['latin', 'greek', 'cyrillic'],
  variable: '--font-inter',
  display: 'swap',
});

export const metadata: Metadata = {
  // Makes canonical/OG URLs absolute.
  metadataBase: new URL(siteUrl()),
  title: {
    default: 'she.cy — Book beauty appointments in Cyprus',
    template: '%s · she.cy',
  },
  description:
    'Discover and book beauty studios across Cyprus — nails, lashes, hair, makeup and skin.',
};

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!routing.locales.includes(locale as (typeof routing.locales)[number])) {
    notFound();
  }
  setRequestLocale(locale);
  const messages = await getMessages();

  return (
    <html lang={locale} className={inter.variable} suppressHydrationWarning>
      <head>
        <ThemeScript />
      </head>
      <body className="min-h-dvh">
        <NextIntlClientProvider messages={messages}>
          <SiteHeader locale={locale} />
          <main id="main">{children}</main>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
