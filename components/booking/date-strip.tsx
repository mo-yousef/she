'use client';
import { Check } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { onRovingKeyDown, tabStopIndex } from './roving';

export interface StripDay {
  dateKey: string; // local 'YYYY-MM-DD' in Europe/Nicosia
  hasAvailability: boolean;
}

// A calendar date has no time zone: format the key at UTC noon in UTC so the
// weekday/day number can never shift with the viewer's zone.
function keyToDate(dateKey: string): Date {
  const [y, m, d] = dateKey.split('-').map(Number);
  return new Date(Date.UTC(y!, m! - 1, d!, 12));
}

/**
 * Horizontal, scroll-snapping date strip (requirement 3.1). Controlled: the
 * parent owns `value` (a dateKey) so the stepper can persist it in the URL.
 * Days without availability are aria-disabled, muted AND struck through, with
 * a "No times" label, so the state is not conveyed by colour alone.
 */
export function DateStrip({
  days,
  value,
  onChange,
}: {
  days: StripDay[];
  value: string | null;
  onChange: (dateKey: string) => void;
}) {
  const t = useTranslations('booking');
  const locale = useLocale();
  const weekday = new Intl.DateTimeFormat(locale, { weekday: 'short', timeZone: 'UTC' });
  const month = new Intl.DateTimeFormat(locale, { month: 'short', timeZone: 'UTC' });
  const full = new Intl.DateTimeFormat(locale, { dateStyle: 'full', timeZone: 'UTC' });
  const stop = tabStopIndex(
    days.map((d) => d.hasAvailability),
    days.findIndex((d) => d.dateKey === value),
  );

  return (
    <div
      role="radiogroup"
      aria-label={t('dateLabel')}
      onKeyDown={onRovingKeyDown}
      className="-mx-4 flex snap-x snap-mandatory gap-2 overflow-x-auto scroll-smooth px-4 pb-2 motion-reduce:scroll-auto"
    >
      {days.map((day, i) => {
        const date = keyToDate(day.dateKey);
        const selected = day.dateKey === value;
        const enabled = day.hasAvailability;
        return (
          <button
            key={day.dateKey}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-disabled={!enabled}
            aria-label={
              enabled ? full.format(date) : t('dayNoTimes', { date: full.format(date) })
            }
            tabIndex={i === stop ? 0 : -1}
            onClick={() => enabled && onChange(day.dateKey)}
            className={[
              'relative flex min-h-[4.5rem] min-w-14 shrink-0 snap-start flex-col items-center justify-center gap-0.5 rounded-[var(--radius-button)] border-2 px-2 py-2 transition-colors motion-reduce:transition-none',
              selected
                ? 'border-[color:var(--b1)] bg-[color:var(--b1)] font-semibold text-[color:var(--b1-contrast)]'
                : enabled
                  ? 'border-[color:var(--control-border)] bg-[color:var(--surface)] text-[color:var(--label)]'
                  : 'border-[color:var(--separator)] bg-transparent text-[color:var(--label-secondary)]',
              // Unavailable: struck-through number + "No times" + secondary text colour
              // (>= 4.5:1). Never opacity, which would lower the text contrast.
              enabled ? 'cursor-pointer' : 'cursor-not-allowed',
            ].join(' ')}
          >
            <span className="text-[length:var(--text-caption)] uppercase">
              {weekday.format(date)}
            </span>
            <span
              className={`text-[length:var(--text-title3)] leading-none ${enabled ? '' : 'line-through'}`}
            >
              {date.getUTCDate()}
            </span>
            <span className="text-[length:var(--text-caption)]">
              {enabled ? month.format(date) : t('noTimesShort')}
            </span>
            {selected ? (
              <Check
                className="absolute end-1 top-1 h-3 w-3"
                aria-hidden
                strokeWidth={3}
              />
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
