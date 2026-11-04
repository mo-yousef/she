'use client';

import type { ReactNode } from 'react';
import { motion, useReducedMotion } from 'motion/react';

/** Spring-ish ease from the design rules: cubic-bezier(0.2, 0.8, 0.2, 1). */
export const EASE = [0.2, 0.8, 0.2, 1] as const;

/**
 * Fades and lifts content in once when it scrolls into view. With reduced motion the content
 * is simply shown. `delay` (seconds) staggers siblings.
 */
export function Reveal({
  children,
  delay = 0,
  className,
  as = 'div',
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
  as?: 'div' | 'section' | 'li' | 'article';
}) {
  const reduce = useReducedMotion();
  const Tag = motion[as];
  if (reduce) {
    const Static = as;
    return <Static className={className}>{children}</Static>;
  }
  return (
    <Tag
      className={className}
      initial={{ opacity: 0, y: 18 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '0px 0px -8% 0px' }}
      transition={{ duration: 0.45, delay, ease: EASE }}
    >
      {children}
    </Tag>
  );
}

/** Press feedback for tappable surfaces (cards, tiles): subtle scale on tap, lift on hover. */
export function Pressable({ children, className }: { children: ReactNode; className?: string }) {
  const reduce = useReducedMotion();
  if (reduce) return <div className={className}>{children}</div>;
  return (
    <motion.div
      className={className}
      whileHover={{ y: -3 }}
      whileTap={{ scale: 0.97 }}
      transition={{ duration: 0.2, ease: EASE }}
    >
      {children}
    </motion.div>
  );
}
