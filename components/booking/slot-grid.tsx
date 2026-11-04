'use client';
import { Check } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { BUSINESS_TZ } from '@/lib/time';
import { onRovingKeyDown, tabStopIndex } from './roving';

export interface SlotItem {
  startsAt: string; // ISO UTC instant
  available: boolean;
}

/**
 * Time-slot grid for the chosen date (requirement 3.1). Controlled: `value` is
 * the selected slot's ISO start. Unavailable slots stay visible but are
 * aria-disabled and struck through (not colour-only) and never call onChange;
 * the server re-validates on confirm (task 4.3). When nothing is left the grid
 * is replaced by an empty state.
 */
export function SlotGrid({
  slots,
  value,
  onChange,
}: {
  slots: SlotItem[];
  value: string | null;
  onChange: (startsAtIso: string) => void;
}) {
  const t = useTranslations('booking');
  const locale = useLocale();
  const time = new Intl.DateTimeFormat(locale, {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: BUSINESS_TZ,
  });
  const long = new Intl.DateTimeFormat(locale, {
    dateStyle: 'full',
    timeStyle: 'short',
    timeZone: BUSINESS_TZ,
  });

  if (!slots.some((s) => s.available)) {
    return (
      <div
        role="status"
        className="rounded-[var(--radius-card)] bg-[color:var(--surface)] p-6 text-center"
      >
        <p className="text-[length:var(--text-headline)] font-semibold">
          {t('noTimesLeftTitle')}
        </p>
        <p className="mt-1 text-[length:var(--text-subhead)] text-[color:var(--label-secondary)]">
          {t('noTimesLeftBody')}
        </p>
      </div>
    );
  }

  const stop = tabStopIndex(
    slots.map((s) => s.available),
    slots.findIndex((s) => s.startsAt === value),
  );

  return (
    <div
      role="radiogroup"
      aria-label={t('timeLabel')}
      onKeyDown={onRovingKeyDown}
      className="grid grid-cols-[repeat(auto-fill,minmax(5.5rem,1fr))] gap-2"
    >
      {slots.map((slot, i) => {
        const date = new Date(slot.startsAt);
        const selected = slot.startsAt === value;
        return (
          <button
            key={slot.startsAt}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-disabled={!slot.available}
            aria-label={
              slot.available
                ? long.format(date)
                : t('slotUnavailable', { time: long.format(date) })
            }
            tabIndex={i === stop ? 0 : -1}
            onClick={() => slot.available && onChange(slot.startsAt)}
            className={[
              'relative flex min-h-11 items-center justify-center gap-1 rounded-[var(--radius-button)] border-2 px-3 text-[length:var(--text-callout)] tabular-nums transition-colors motion-reduce:transition-none',
              selected
                ? 'border-[color:var(--b1)] bg-[color:var(--b1)] font-semibold text-[color:var(--b1-contrast)]'
                : slot.available
                  ? 'border-[color:var(--control-border)] bg-[color:var(--surface)] text-[color:var(--label)]'
                  : 'border-[color:var(--separator)] bg-transparent text-[color:var(--label-secondary)]',
              // Unavailable: struck through + secondary text colour (>= 4.5:1). Never
              // opacity, which would silently lower the text contrast.
              slot.available ? 'cursor-pointer' : 'cursor-not-allowed line-through',
            ].join(' ')}
          >
            {selected ? <Check className="h-4 w-4" aria-hidden strokeWidth={3} /> : null}
            {time.format(date)}
          </button>
        );
      })}
    </div>
  );
}
