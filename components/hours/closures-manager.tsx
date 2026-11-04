'use client';
/**
 * Holidays and closures (task 6.6): upcoming/ongoing ranges with Remove, plus an "Add closure"
 * mini-form. Native date inputs. Validation is the shared schema + range rule (also enforced on
 * the server); a typed range is never cleared on error. Adding is refused by the server when
 * upcoming bookings fall in the range (the dates are listed, no customer details).
 */
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { addClosure, removeClosure } from '@/app/actions/hours';
import { Field, fieldAria, inputClass, primaryBtn, secondaryBtn } from '@/components/calendar/fields';
import { checkClosureRange, closureInputSchema } from '@/lib/hours-schema';
import { staffFieldErrors } from '@/lib/team-schema';

export interface ClosureDto {
  id: string;
  fromDate: string;
  toDate: string;
  reason: string | null;
}

export function ClosuresManager({ closures, todayKey, locale }: { closures: ClosureDto[]; todayKey: string; locale: string }) {
  const t = useTranslations('hours');
  const fmt = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
  const fmtKey = (k: string) => fmt.format(new Date(`${k}T00:00:00Z`));
  const rangeText = (c: { fromDate: string; toDate: string }) => (c.fromDate === c.toDate ? fmtKey(c.fromDate) : t('closures.range', { from: fmtKey(c.fromDate), to: fmtKey(c.toDate) }));

  const [v, setV] = useState({ fromDate: '', toDate: '', reason: '' });
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [submitted, setSubmitted] = useState(false);
  const [serverErrors, setServerErrors] = useState<Record<string, string>>({});
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const set = (k: keyof typeof v, val: string) => {
    setV((p) => ({ ...p, [k]: val }));
    setServerErrors({});
  };
  const parsed = closureInputSchema.safeParse(v);
  const local: Record<string, string> = parsed.success ? (checkClosureRange(parsed.data, todayKey) ?? {}) : staffFieldErrors(parsed.error);
  const errors = { ...local, ...serverErrors };
  const msg = (code?: string) => (code ? (t.has(`validation.${code}`) ? t(`validation.${code}`) : t('validation.invalid')) : undefined);
  const shown = (f: string) => (touched[f] || submitted || serverErrors[f] ? msg(errors[f]) : undefined);
  const blur = (f: string) => setTouched((p) => ({ ...p, [f]: true }));

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitted(true);
    setStatus('');
    setError('');
    const firstBad = Object.keys(local)[0];
    if (firstBad) {
      e.currentTarget.querySelector<HTMLElement>(`#cl-${firstBad}`)?.focus();
      return;
    }
    setBusy(true);
    try {
      const res = await addClosure(v);
      if (res.ok) {
        setStatus(t('closures.added'));
        setV({ fromDate: '', toDate: '', reason: '' }); // cleared only after success
        setTouched({});
        setSubmitted(false);
      } else if (res.code === 'HAS_BOOKINGS') {
        setError(t('closures.hasBookings', { count: res.futureCount ?? 0, dates: (res.conflictDates ?? []).join(', ') }));
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

  async function remove(c: ClosureDto) {
    setBusy(true);
    setStatus('');
    setError('');
    try {
      const res = await removeClosure(c.id);
      if (res.ok) setStatus(t('closures.removed'));
      else setError(t(t.has(`error.${res.code}`) ? `error.${res.code}` : 'error.UNKNOWN'));
    } catch {
      setError(t('error.UNKNOWN'));
    } finally {
      setBusy(false);
    }
  }

  const err = (f: string) => shown(f);
  return (
    <div className="space-y-4">
      {closures.length === 0 ? (
        <p className="text-[color:var(--label-secondary)]">{t('closures.none')}</p>
      ) : (
        <ul className="divide-y divide-[color:var(--separator)] rounded-[var(--radius-card)] bg-[color:var(--surface)]">
          {closures.map((c) => (
            <li key={c.id} className="flex flex-wrap items-center justify-between gap-3 p-3">
              <div>
                <p className="font-medium">{rangeText(c)}</p>
                {c.reason ? <p className="text-[length:var(--text-footnote)] text-[color:var(--label-secondary)]">{c.reason}</p> : null}
              </div>
              <button type="button" disabled={busy} className={secondaryBtn} onClick={() => remove(c)} aria-label={t('closures.removeRange', { range: rangeText(c) })}>
                {t('closures.remove')}
              </button>
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={submit} noValidate className="space-y-3 rounded-[var(--radius-card)] bg-[color:var(--surface)] p-4">
        <h3 className="text-[length:var(--text-headline)] font-semibold">{t('closures.addTitle')}</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field id="cl-fromDate" label={t('closures.from')} error={err('fromDate')}>
            <input type="date" required autoComplete="off" min={todayKey} className={inputClass} value={v.fromDate} onChange={(e) => set('fromDate', e.target.value)} onBlur={() => blur('fromDate')} {...fieldAria('cl-fromDate', undefined, err('fromDate'))} />
          </Field>
          <Field id="cl-toDate" label={t('closures.to')} error={err('toDate')}>
            <input type="date" required autoComplete="off" min={v.fromDate || todayKey} className={inputClass} value={v.toDate} onChange={(e) => set('toDate', e.target.value)} onBlur={() => blur('toDate')} {...fieldAria('cl-toDate', undefined, err('toDate'))} />
          </Field>
        </div>
        <Field id="cl-reason" label={t('closures.reason')} hint={t('closures.reasonHint')} error={err('reason')}>
          <input type="text" maxLength={120} autoComplete="off" className={inputClass} value={v.reason} onChange={(e) => set('reason', e.target.value)} onBlur={() => blur('reason')} {...fieldAria('cl-reason', t('closures.reasonHint'), err('reason'))} />
        </Field>
        {shown('form') ? (
          <p role="alert" className="text-[length:var(--text-footnote)] text-[color:var(--danger)]">
            {shown('form')}
          </p>
        ) : null}
        <button type="submit" disabled={busy} className={primaryBtn}>
          {busy ? t('closures.adding') : t('closures.add')}
        </button>
      </form>
      <div role="status" aria-live="polite" className="text-[length:var(--text-subhead)]">
        {status}
      </div>
      {error ? (
        <p role="alert" className="text-[length:var(--text-subhead)] text-[color:var(--danger)]">
          {error}
        </p>
      ) : null}
    </div>
  );
}
