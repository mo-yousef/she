'use client';

import { useEffect, useId, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';

/**
 * Non-destructive modal sheet for the calendar forms and the event details (task 6.2).
 * Native <dialog>: focus trap, Escape to close and the dialog role come for free. Bottom
 * sheet with a grabber on mobile, centred modal from `sm`. Deliberately NOT closed by a
 * backdrop click, so a stray tap never throws away typed input. No animation.
 */
export function FormSheet({
  open,
  title,
  closeLabel,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  closeLabel: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  // Unique per sheet (task 6.11): no fixed id that two mounted sheets could share.
  const titleId = `${useId()}-title`;

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
      onClose={onClose}
      className="m-0 mt-auto max-h-[92dvh] w-full max-w-none overflow-y-auto rounded-t-[var(--radius-sheet)] border-0 bg-[color:var(--surface)] p-0 text-[color:var(--label)] shadow-xl backdrop:bg-black/40 sm:m-auto sm:max-w-lg sm:rounded-[var(--radius-sheet)]"
    >
      {open ? (
        <div className="p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
          <div
            aria-hidden
            className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-[color:var(--separator)] sm:hidden"
          />
          <div className="mb-4 flex items-start justify-between gap-3">
            <h2
              id={titleId}
              className="text-[length:var(--text-title3)] font-semibold"
            >
              {title}
            </h2>
            <button
              type="button"
              onClick={onClose}
              aria-label={closeLabel}
              className="-mr-2 -mt-2 inline-flex h-11 w-11 flex-none items-center justify-center rounded-full text-[color:var(--label-secondary)] hover:bg-[color:var(--separator)]"
            >
              <X className="h-5 w-5" aria-hidden />
            </button>
          </div>
          {children}
        </div>
      ) : null}
    </dialog>
  );
}
