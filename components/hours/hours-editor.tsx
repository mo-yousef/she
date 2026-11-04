'use client';
/**
 * Weekly hours editor (task 6.6). One window per weekday (no split shifts), Closed checkbox,
 * native time inputs, "Copy to all days" per row. Validation is the shared `checkBusinessHours`
 * (same rules as the server): shown after blur or submit, typed values are never cleared on
 * error. Results go to an aria-live region.
 */
import { useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { saveBusinessHours } from '@/app/actions/hours';
import { WEEKDAY_ORDER, copyToAllDays, formatTimeOfDay, parseTimeOfDay, type DayHours } from '@/lib/hours';
import { checkBusinessHours } from '@/lib/hours-schema';
import { inputClass, primaryBtn, secondaryBtn } from '@/components/calendar/fields';

const WEEKDAY_KEY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
interface Row {
  weekday: number;
  closed: boolean;
  open: string;
  close: string;
}
const toRow = (d: DayHours): Row => ({
  weekday: d.weekday,
  closed: d.closed,
  // <input type="time"> cannot show 24:00; 23:59 is the closest value it can hold.
  open: formatTimeOfDay(Math.min(d.opensMin, 1439)),
  close: formatTimeOfDay(Math.min(d.closesMin, 1439)),
});
/** An unparseable time becomes NaN so the shared validation flags it as `range`. */
const toDay = (r: Row): DayHours => ({
  weekday: r.weekday,
  closed: r.closed,
  opensMin: r.closed ? 0 : (parseTimeOfDay(r.open) ?? Number.NaN),
  closesMin: r.closed ? 0 : (parseTimeOfDay(r.close) ?? Number.NaN),
});

export function HoursEditor({ days, stepSeconds, listingLive }: { days: DayHours[]; stepSeconds: number; listingLive: boolean }) {
  const t = useTranslations('hours');
  const biz = useTranslations('business');
  const [rows, setRows] = useState<Row[]>(() => WEEKDAY_ORDER.map((w) => toRow(days.find((d) => d.weekday === w)!)));
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [submitted, setSubmitted] = useState(false);
  const [serverErrors, setServerErrors] = useState<Record<string, string>>({});
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  const patch = (weekday: number, p: Partial<Row>) => {
    setRows((r) => r.map((x) => (x.weekday === weekday ? { ...x, ...p } : x)));
    setServerErrors({});
  };
  const copyFrom = (weekday: number) => {
    setRows((r) => copyToAllDays(r.map(toDay), weekday).map(toRow));
    setServerErrors({});
    setStatus(t('weekly.copied', { day: biz(`weekday${WEEKDAY_KEY[weekday]}`) }));
  };
  const checked = checkBusinessHours({ days: rows.map(toDay) });
  const local: Record<string, string> = checked.ok ? {} : checked.errors;
  const errors = { ...local, ...serverErrors };
  const msg = (code?: string) => (code ? (t.has(`validation.${code}`) ? t(`validation.${code}`) : t('validation.invalid')) : undefined);
  const shown = (f: string) => (touched[f] || submitted || serverErrors[f] ? msg(errors[f]) : undefined);
  const noOpenDays = checked.ok && checked.noOpenDays;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitted(true);
    setStatus('');
    setError('');
    const firstBad = Object.keys(local)[0];
    if (firstBad) {
      formRef.current?.querySelector<HTMLElement>(`[data-field="${firstBad}"]`)?.focus();
      return;
    }
    setBusy(true);
    try {
      const res = await saveBusinessHours({ days: rows.map(toDay) });
      if (res.ok) {
        const parts = [t('weekly.saved')];
        if (res.adjustedStaff > 0) parts.push(t('status.adjusted', { count: res.adjustedStaff }));
        if (res.outsideBookings > 0) parts.push(t('status.outside', { count: res.outsideBookings }));
        if (res.warnings.includes('NO_OPEN_DAYS')) parts.push(t('warnings.noOpenDays'));
        setStatus(parts.join(' '));
      } else if ('errors' in res && res.errors && Object.keys(res.errors).length) {
        setServerErrors(res.errors);
        setError(t('error.VALIDATION'));
      } else {
        setError(t(t.has(`error.${res.code}`) ? `error.${res.code}` : 'error.UNKNOWN'));
      }
    } catch {
      setError(t('error.UNKNOWN'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form ref={formRef} onSubmit={submit} noValidate className="space-y-4">
      <ul className="divide-y divide-[color:var(--separator)] rounded-[var(--radius-card)] bg-[color:var(--surface)]">
        {rows.map((r) => {
          const field = `day-${r.weekday}`;
          const err = shown(field);
          const dayName = biz(`weekday${WEEKDAY_KEY[r.weekday]}`);
          return (
            <li key={r.weekday} className="grid grid-cols-2 items-end gap-x-3 gap-y-2 p-3 sm:flex sm:flex-wrap sm:items-center sm:gap-x-4">
              <span className="font-medium sm:w-28">{dayName}</span>
              <label className="inline-flex min-h-11 items-center gap-2">
                <input type="checkbox" className="h-5 w-5" checked={r.closed} onChange={(e) => patch(r.weekday, { closed: e.target.checked })} />
                {t('weekly.closed')}
                <span className="sr-only"> {dayName}</span>
              </label>
              {(['open', 'close'] as const).map((k) => (
                <label key={k} className="inline-flex flex-col items-start gap-1 sm:flex-row sm:items-center sm:gap-2">
                  <span className="text-[color:var(--label-secondary)]">{t(k === 'open' ? 'weekly.opens' : 'weekly.closes')}</span>
                  <span className="sr-only">{dayName}</span>
                  <input
                    type="time"
                    data-field={k === 'open' ? field : undefined}
                    step={stepSeconds}
                    required={!r.closed}
                    disabled={r.closed}
                    value={r[k]}
                    aria-invalid={err ? true : undefined}
                    aria-describedby={err ? `${field}-err` : undefined}
                    className={`${inputClass} !w-full sm:!w-auto`}
                    onChange={(e) => patch(r.weekday, { [k]: e.target.value })}
                    onBlur={() => setTouched((p) => ({ ...p, [field]: true }))}
                  />
                </label>
              ))}
              <button type="button" className={`${secondaryBtn} col-span-2 !px-3 text-[length:var(--text-subhead)] sm:col-span-1`} onClick={() => copyFrom(r.weekday)} aria-label={t('weekly.copyToAllNamed', { day: dayName })}>
                {t('weekly.copyToAll')}
              </button>
              {err ? (
                <p id={`${field}-err`} className="basis-full text-[length:var(--text-footnote)] text-[color:var(--danger)]">
                  {err}
                </p>
              ) : null}
            </li>
          );
        })}
      </ul>
      {shown('form') ? (
        <p role="alert" className="text-[length:var(--text-footnote)] text-[color:var(--danger)]">
          {shown('form')}
        </p>
      ) : null}
      {noOpenDays && listingLive ? (
        <p className="text-[length:var(--text-footnote)] text-[color:var(--label)]">
          <span className="font-semibold">{t('warnings.label')} </span>
          {t('warnings.noOpenDays')}
        </p>
      ) : null}
      <p className="text-[length:var(--text-footnote)] text-[color:var(--label-secondary)]">{t('weekly.timezoneNote')}</p>
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={busy} className={primaryBtn}>
          {busy ? t('weekly.saving') : t('weekly.save')}
        </button>
      </div>
      <div role="status" aria-live="polite" className="text-[length:var(--text-subhead)]">
        {status}
      </div>
      {error ? (
        <p role="alert" className="text-[length:var(--text-subhead)] text-[color:var(--danger)]">
          {error}
        </p>
      ) : null}
    </form>
  );
}
