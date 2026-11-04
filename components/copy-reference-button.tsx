'use client';

import { useState } from 'react';
import { Copy, Check } from 'lucide-react';

/**
 * Copies the booking reference via the Clipboard API with accessible status
 * feedback (requirement 3.2). No new dependency: navigator.clipboard only.
 */
export function CopyReferenceButton({
  reference,
  label,
  copiedLabel,
}: {
  reference: string;
  label: string;
  copiedLabel: string;
}) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(reference);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // shortcut: no fallback textarea-select copy path (Ponytail — rare browser gap).
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={handleCopy}
        className="inline-flex min-h-11 items-center gap-1.5 rounded-[var(--radius-button)] border border-[color:var(--control-border)] px-3 text-[length:var(--text-footnote)] font-medium"
      >
        {copied ? (
          <Check className="h-4 w-4 text-[color:var(--success)]" aria-hidden />
        ) : (
          <Copy className="h-4 w-4" aria-hidden />
        )}
        {label}
      </button>
      {/* Outside the button: a button's children are presentational, so a live region inside may not be announced. */}
      <span role="status" aria-live="polite" className="sr-only">
        {copied ? copiedLabel : ''}
      </span>
    </>
  );
}
