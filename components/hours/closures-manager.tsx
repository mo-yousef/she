'use client';
/**
 * Holidays and closures (task 6.6): upcoming/ongoing ranges with Remove, plus an "Add closure"
 * mini-form. Native date inputs. Validation is the shared schema + range rule (also enforced on
 * the server); a typed range is never cleared on error. Adding is refused by the server when
 * upcoming bookings fall in the range (the dates are listed, no customer details).
 */
import { useState, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { addClosure, removeClosure } from '@/app/actions/hours';
import { fieldAria } from '@/components/calendar/fields';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { checkClosureRange, closureInputSchema } from '@/lib/hours-schema';
import { staffFieldErrors } from '@/lib/team-schema';

export interface ClosureDto {
  id: string;
  fromDate: string;
  toDate: string;
  reason: string | null;
}

/** Label + control + hint + inline error. The control must use `fieldAria(id)` for aria wiring. */
function Field({
  id,
  label,
  hint,
  error,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {hint ? (
        <p id={`${id}-hint`} className="text-xs text-muted-foreground">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={`${id}-err`} className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
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
        <p className="text-muted-foreground">{t('closures.none')}</p>
      ) : (
        <Card className="gap-0 p-0">
          {closures.map((c, i) => (
            <div key={c.id}>
              {i > 0 ? <Separator /> : null}
              <div className="flex flex-wrap items-center justify-between gap-3 p-3">
                <div>
                  <p className="font-medium">{rangeText(c)}</p>
                  {c.reason ? <p className="text-xs text-muted-foreground">{c.reason}</p> : null}
                </div>
                <Button type="button" variant="outline" size="lg" disabled={busy} onClick={() => remove(c)} aria-label={t('closures.removeRange', { range: rangeText(c) })}>
                  {t('closures.remove')}
                </Button>
              </div>
            </div>
          ))}
        </Card>
      )}
      <form onSubmit={submit} noValidate className="space-y-3 rounded-xl border bg-card p-4 text-card-foreground shadow-sm">
        <h3 className="text-base font-semibold">{t('closures.addTitle')}</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field id="cl-fromDate" label={t('closures.from')} error={err('fromDate')}>
            <Input type="date" required autoComplete="off" min={todayKey} className="min-h-11" value={v.fromDate} onChange={(e) => set('fromDate', e.target.value)} onBlur={() => blur('fromDate')} {...fieldAria('cl-fromDate', undefined, err('fromDate'))} />
          </Field>
          <Field id="cl-toDate" label={t('closures.to')} error={err('toDate')}>
            <Input type="date" required autoComplete="off" min={v.fromDate || todayKey} className="min-h-11" value={v.toDate} onChange={(e) => set('toDate', e.target.value)} onBlur={() => blur('toDate')} {...fieldAria('cl-toDate', undefined, err('toDate'))} />
          </Field>
        </div>
        <Field id="cl-reason" label={t('closures.reason')} hint={t('closures.reasonHint')} error={err('reason')}>
          <Input type="text" maxLength={120} autoComplete="off" className="min-h-11" value={v.reason} onChange={(e) => set('reason', e.target.value)} onBlur={() => blur('reason')} {...fieldAria('cl-reason', t('closures.reasonHint'), err('reason'))} />
        </Field>
        {shown('form') ? (
          <p role="alert" className="text-xs text-destructive">
            {shown('form')}
          </p>
        ) : null}
        <Button type="submit" size="lg" disabled={busy}>
          {busy ? t('closures.adding') : t('closures.add')}
        </Button>
      </form>
      <div role="status" aria-live="polite" className="text-sm">
        {status}
      </div>
      {
        error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null
      }
    </div >
  );
}
