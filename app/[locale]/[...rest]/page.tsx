import { notFound } from 'next/navigation';

// Unmatched paths under a locale render the translated app/[locale]/not-found.tsx
// (without this, Next falls back to its untranslated default 404).
export default function CatchAll() {
  notFound();
}
