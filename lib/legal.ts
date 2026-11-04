/** Legal pages (task 7.3): the slugs served at /[locale]/legal/[page]. Text lives in messages `legal.pages.*`. */
export const LEGAL_PAGES = ['terms', 'privacy', 'cancellation'] as const;
export type LegalPage = (typeof LEGAL_PAGES)[number];

export function isLegalPage(v: string): v is LegalPage {
  return (LEGAL_PAGES as readonly string[]).includes(v);
}

export interface LegalSection {
  heading: string;
  paragraphs: string[];
}
