'use client';

import { useEffect, useId, useRef, type ReactNode } from 'react';

/**
 * Destructive-action confirmation (apple-design): a native modal <dialog> gives
 * focus trapping, Escape-to-close and a screen-reader dialog role for free. It is
 * a bottom sheet with a grabber on mobile and a centred modal from `sm` up. The
 * safe choice ("keep") is first in the DOM, takes initial focus, and is the
 * default; the destructive action is last and clearly marked. No motion at all,
 * so nothing to disable for prefers-reduced-motion.
 */
export function ConfirmSheet({
  open,
  title,
  children,
  confirmLabel,
  keepLabel,
  busy,
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  children: ReactNode;
  confirmLabel: string;
  keepLabel: string;
  busy: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  // Unique per sheet: several sheets can be mounted on one page (calendar, reviews), and a
  // shared id made aria-labelledby resolve to the FIRST sheet's title (found in 6.10).
  const uid = useId();
  const titleId = `${uid}-title`;
  const bodyId = `${uid}-body`;

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      aria-describedby={bodyId}
      // Escape / backdrop-less close both land here; keep parent state in sync.
      onClose={onClose}
      onCancel={(e) => {
        if (busy) e.preventDefault();
      }}
      className="m-0 mt-auto w-full max-w-none rounded-t-[var(--radius-card)] border-0 bg-[color:var(--surface)] p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] text-[color:var(--label)] shadow-xl backdrop:bg-black/40 sm:m-auto sm:max-w-md sm:rounded-[var(--radius-card)]"
    >
      <div
        aria-hidden
        className="mx-auto mb-4 h-1.5 w-10 rounded-full bg-[color:var(--separator)] sm:hidden"
      />
      <h2
        id={titleId}
        className="text-[length:var(--text-title3)] font-semibold"
      >
        {title}
      </h2>
      <div
        id={bodyId}
        className="mt-2 text-[length:var(--text-subhead)] text-[color:var(--label-secondary)]"
      >
        {children}
      </div>
      <div className="mt-5 flex flex-col gap-2">
        <button
          type="button"
          autoFocus
          disabled={busy}
          onClick={onClose}
          className="inline-flex min-h-11 w-full items-center justify-center rounded-[var(--radius-button)] bg-[color:var(--b1)] px-5 text-[length:var(--text-headline)] font-semibold text-[color:var(--b1-contrast)] disabled:opacity-50"
        >
          {keepLabel}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={onConfirm}
          className="inline-flex min-h-11 w-full items-center justify-center rounded-[var(--radius-button)] border-2 border-[color:var(--danger)] px-5 text-[length:var(--text-headline)] font-semibold text-[color:var(--danger)] disabled:opacity-50"
        >
          {confirmLabel}
        </button>
      </div>
    </dialog>
  );
}
