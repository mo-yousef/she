import type { ReactNode } from 'react';

// The locale layout (app/[locale]/layout.tsx) sets <html lang> and renders the
// real chrome. This root exists only to satisfy Next's app-router requirement.
export default function RootLayout({ children }: { children: ReactNode }) {
  return children;
}
