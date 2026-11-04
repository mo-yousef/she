'use client';

import { useEffect, useRef, type ReactNode } from 'react';

/** Page heading that takes focus on mount so screen readers announce the result. */
export function FocusHeading({ children, className }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    ref.current?.focus();
  }, []);
  return (
    <h1 ref={ref} tabIndex={-1} className={`${className ?? ''} outline-none`}>
      {children}
    </h1>
  );
}
