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
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';

/** shadcn Input look applied directly to native <input type="time">. */
const timeInput =
  'rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 aria-invalid:border-destructive disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30';

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
      <Card className="gap-0 p-0">
        {rows.map((r, i) => {
          const field = `day-${r.weekday}`;
          const err = shown(field);
          const dayName = biz(`weekday${WEEKDAY_KEY[r.weekday]}`);
          return (
            <div key={r.weekday}>
              {i > 0 ? <Separator /> : null}
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 p-3">
                <span className="w-28 font-medium">{dayName}</span>
                <label className="inline-flex min-h-11 items-center gap-2">
                  <input type="checkbox" className="h-5 w-5" checked={r.closed} onChange={(e) => patch(r.weekday, { closed: e.target.checked })} />
                  {t('weekly.closed')}
                  <span className="sr-only"> {dayName}</span>
                </label>
                {(['open', 'close'] as const).map((k) => (
                  <label key={k} className="inline-flex items-center gap-2">
                    <span className="text-muted-foreground">{t(k === 'open' ? 'weekly.opens' : 'weekly.closes')}</span>
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
                      className={timeInput}
                      onChange={(e) => patch(r.weekday, { [k]: e.target.value })}
                      onBlur={() => setTouched((p) => ({ ...p, [field]: true }))}
                    />
                  </label>
                ))}
                <Button type="button" variant="outline" size="sm" onClick={() => copyFrom(r.weekday)} aria-label={t('weekly.copyToAllNamed', { day: dayName })}>
                  {t('weekly.copyToAll')}
                </Button>
                {err ? (
                  <p id={`${field}-err`} className="basis-full text-xs text-destructive">
                    {err}
                  </p>
                ) : null}
              </div>
            </div>
          );
        })}
      </Card>
      {shown('form') ? (
        <p role="alert" className="text-xs text-destructive">
          {shown('form')}
        </p>
      ) : null}
      {noOpenDays && listingLive ? (
        <p className="text-xs">
          <span className="font-semibold">{t('warnings.label')} </span>
          {t('warnings.noOpenDays')}
        </p>
      ) : null}
      <p className="text-xs text-muted-foreground">{t('weekly.timezoneNote')}</p>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" size="lg" disabled={busy}>
          {busy ? t('weekly.saving') : t('weekly.save')}
        </Button>
      </div>
      <div role="status" aria-live="polite" className="text-sm">
        {status}
      </div>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </form>
  );
}
