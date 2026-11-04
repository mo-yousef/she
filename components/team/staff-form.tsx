'use client';
/**
 * Add / edit team member form (task 6.5). Controlled fields, so a failed submit never clears
 * what was typed. Local validation reuses the SAME pure functions as the server core and shows
 * after blur / submit; server field errors are shown as returned. Native date/time inputs only.
 * The days-off section is its own <form> (siblings, never nested) and saves independently.
 * `photoUrl` is display-only here: the uploader arrives with task 6.7.
 */
import { useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Trash2 } from 'lucide-react';
import { addDayOff, createStaff, removeDayOff, updateStaff } from '@/app/actions/team';
import { WEEKDAY_ORDER, formatTimeOfDay, parseTimeOfDay, type DayHours } from '@/lib/hours';
import type { TeamMemberDto, TeamWarning } from '@/lib/team';
import { DEFAULT_ROLE, checkStaffHours, copyToAllDays, staffFieldErrors, staffInputSchema } from '@/lib/team-schema';
import { Field, fieldAria, inputClass, primaryBtn, secondaryBtn } from '@/components/calendar/fields';

export interface SavedInfo {
  mode: 'created' | 'updated';
  warnings: TeamWarning[];
}

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
  open: formatTimeOfDay(Math.min(d.opensMin, 1439)),
  close: formatTimeOfDay(Math.min(d.closesMin, 1439)),
});

/** Time-of-day text -> minutes; an unparseable value becomes NaN so validation flags it. */
const toDay = (r: Row): DayHours => ({
  weekday: r.weekday,
  closed: r.closed,
  opensMin: r.closed ? 0 : (parseTimeOfDay(r.open) ?? Number.NaN),
  closesMin: r.closed ? 0 : (parseTimeOfDay(r.close) ?? Number.NaN),
});

const formatKey = (key: string, locale: string) =>
  new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${key}T00:00:00Z`));

export function StaffForm({
  member,
  services,
  businessHours,
  todayKey,
  onDone,
  onCancel,
}: {
  member: TeamMemberDto | null;
  services: Array<{ id: string; name: string; active: boolean }>;
  businessHours: DayHours[];
  todayKey: string;
  onDone: (info: SavedInfo) => void;
  onCancel: () => void;
}) {
  const t = useTranslations('team');
  const biz = useTranslations('business');
  const formRef = useRef<HTMLFormElement>(null);
  const initialRows = (): Row[] => {
    const src = member?.customHours ?? businessHours;
    return WEEKDAY_ORDER.map((w) => {
      const d = src.find((x) => x.weekday === w) ?? { weekday: w, closed: true, opensMin: 540, closesMin: 1080 };
      return toRow(d);
    });
  };
  const [v, setV] = useState({
    name: member?.name ?? '',
    role: member?.role ?? DEFAULT_ROLE,
    active: member?.active ?? true,
    serviceIds: member?.serviceIds ?? ([] as string[]),
    custom: member ? member.customHours !== null : false,
    rows: initialRows(),
  });
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [submitted, setSubmitted] = useState(false);
  const [serverErrors, setServerErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const set = <K extends keyof typeof v>(k: K, val: (typeof v)[K]) => {
    setV((p) => ({ ...p, [k]: val }));
    setServerErrors({});
  };
  const patchRow = (weekday: number, p: Partial<Row>) => set('rows', v.rows.map((r) => (r.weekday === weekday ? { ...r, ...p } : r)));
  const copyFirst = () => {
    const first = v.rows[0]!;
    set('rows', copyToAllDays(v.rows.map(toDay), first.weekday).map(toRow));
  };
  const blur = (f: string) => setTouched((p) => ({ ...p, [f]: true }));

  const payload = { name: v.name, role: v.role, active: v.active, serviceIds: v.serviceIds, hours: v.custom ? v.rows.map(toDay) : null };
  const parsed = staffInputSchema.safeParse(payload);
  const local: Record<string, string> = parsed.success ? {} : staffFieldErrors(parsed.error);
  if (!local.hours && v.custom) {
    const h = checkStaffHours(payload.hours, businessHours);
    if (!h.ok) Object.assign(local, h.errors);
  }
  const errors: Record<string, string> = { ...local, ...serverErrors };
  const msg = (code?: string) => (code ? (t.has(`validation.${code}`) ? t(`validation.${code}`) : t('validation.invalid')) : undefined);
  const shown = (f: string) => (touched[f] || submitted || serverErrors[f] ? msg(errors[f]) : undefined);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitted(true);
    setFormError(null);
    const firstBad = Object.keys(local)[0];
    if (firstBad) {
      const id = firstBad.startsWith('hours') ? 'tf-hours-switch' : `tf-${firstBad}`;
      formRef.current?.querySelector<HTMLElement>(`#${id}`)?.focus();
      return;
    }
    setBusy(true);
    try {
      const res = member ? await updateStaff(member.id, payload) : await createStaff(payload);
      if (res.ok) {
        onDone({ mode: member ? 'updated' : 'created', warnings: res.warnings });
        return;
      }
      if ('errors' in res && res.errors && Object.keys(res.errors).length) {
        setServerErrors(res.errors);
        setFormError(t('error.VALIDATION'));
      } else if (res.code === 'HAS_FUTURE_BOOKINGS') {
        setFormError(t('error.deactivateHasBookings', { count: 'futureCount' in res ? (res.futureCount ?? 0) : 0 }));
      } else {
        setFormError(t(t.has(`error.${res.code}`) ? `error.${res.code}` : 'error.UNKNOWN'));
      }
    } catch {
      setFormError(t('error.UNKNOWN'));
    } finally {
      setBusy(false);
    }
  }

  const dayErrors = Object.keys(errors).filter((k) => k.startsWith('hours.'));

  return (
    <div className="space-y-6">
      <form ref={formRef} onSubmit={submit} noValidate className="space-y-4">
        {formError ? (
          <p role="alert" className="rounded-[var(--radius-input)] border border-[color:var(--danger)] p-3 text-[color:var(--danger)]">
            {formError}
          </p>
        ) : null}
        <Field id="tf-name" label={t('form.name')} error={shown('name')}>
          <input {...fieldAria('tf-name', undefined, shown('name'))} type="text" autoComplete="off" maxLength={60} required className={inputClass} value={v.name} onChange={(e) => set('name', e.target.value)} onBlur={() => blur('name')} />
        </Field>
        <Field id="tf-role" label={t('form.role')} hint={t('form.roleHint')} error={shown('role')}>
          <input {...fieldAria('tf-role', t('form.roleHint'), shown('role'))} type="text" autoComplete="off" maxLength={60} className={inputClass} value={v.role} onChange={(e) => set('role', e.target.value)} onBlur={() => blur('role')} />
        </Field>
        {member?.photoUrl ? (
          // Display only: the uploader is task 6.7.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={member.photoUrl} alt="" width={64} height={64} className="h-16 w-16 rounded-full object-cover" />
        ) : null}
        <div className="space-y-1">
          <label className="flex min-h-11 items-center gap-3 text-[length:var(--text-body)] font-medium">
            <input type="checkbox" className="h-5 w-5" checked={v.active} onChange={(e) => set('active', e.target.checked)} aria-describedby="tf-active-hint" />
            {t('form.active')}
          </label>
          <p id="tf-active-hint" className="text-[length:var(--text-footnote)] text-[color:var(--label-secondary)]">
            {t('form.activeHint')}
          </p>
        </div>
        <fieldset className="space-y-1" aria-describedby={shown('serviceIds') ? 'tf-serviceIds-err' : undefined}>
          <legend className="text-[length:var(--text-subhead)] font-medium">{t('form.services')}</legend>
          {services.length === 0 ? (
            <p className="text-[length:var(--text-subhead)] text-[color:var(--label-secondary)]">{t('form.noServices')}</p>
          ) : (
            <ul id="tf-serviceIds" tabIndex={-1} className="space-y-0.5">
              {services.map((s) => (
                <li key={s.id}>
                  <label className="flex min-h-11 items-center gap-3">
                    <input
                      type="checkbox"
                      className="h-5 w-5"
                      checked={v.serviceIds.includes(s.id)}
                      onChange={(e) => set('serviceIds', e.target.checked ? [...v.serviceIds, s.id] : v.serviceIds.filter((id) => id !== s.id))}
                    />
                    {s.name}
                    {s.active ? null : <span className="text-[length:var(--text-footnote)] text-[color:var(--label-secondary)]">({t('form.hiddenService')})</span>}
                  </label>
                </li>
              ))}
            </ul>
          )}
          {shown('serviceIds') ? (
            <p id="tf-serviceIds-err" className="text-[length:var(--text-footnote)] text-[color:var(--danger)]">
              {shown('serviceIds')}
            </p>
          ) : null}
        </fieldset>
        <fieldset className="space-y-2" aria-describedby={shown('hours') ? 'tf-hours-err' : undefined}>
          <legend className="text-[length:var(--text-subhead)] font-medium">{t('form.hours')}</legend>
          <label className="flex min-h-11 items-center gap-3 font-medium">
            <input id="tf-hours-switch" type="checkbox" role="switch" className="h-5 w-5" checked={!v.custom} onChange={(e) => set('custom', !e.target.checked)} />
            {t('form.useBusinessHours')}
          </label>
          <p className="text-[length:var(--text-footnote)] text-[color:var(--label-secondary)]">{t('form.hoursHint')}</p>
          {v.custom ? (
            <>
              <ul className="divide-y divide-[color:var(--separator)] rounded-[var(--radius-card)] border border-[color:var(--separator)]">
                {v.rows.map((r) => {
                  const err = shown(`hours.${r.weekday}`);
                  const day = biz(`weekday${WEEKDAY_KEY[r.weekday]}`);
                  return (
                    <li key={r.weekday} className="flex flex-wrap items-center gap-x-3 gap-y-2 p-3">
                      <span className="w-24 font-medium">{day}</span>
                      <label className="inline-flex min-h-11 items-center gap-2">
                        <input type="checkbox" className="h-5 w-5" checked={r.closed} onChange={(e) => patchRow(r.weekday, { closed: e.target.checked })} />
                        {t('form.closed')}
                      </label>
                      <label className="inline-flex items-center gap-2">
                        <span className="text-[color:var(--label-secondary)]">{t('form.opens')}</span>
                        <input type="time" step={900} disabled={r.closed} aria-invalid={err ? true : undefined} aria-describedby={err ? `tf-day-${r.weekday}-err` : undefined} className={`${inputClass} !w-auto`} value={r.open} onChange={(e) => patchRow(r.weekday, { open: e.target.value })} onBlur={() => blur(`hours.${r.weekday}`)} />
                      </label>
                      <label className="inline-flex items-center gap-2">
                        <span className="text-[color:var(--label-secondary)]">{t('form.closes')}</span>
                        <input type="time" step={900} disabled={r.closed} aria-invalid={err ? true : undefined} aria-describedby={err ? `tf-day-${r.weekday}-err` : undefined} className={`${inputClass} !w-auto`} value={r.close} onChange={(e) => patchRow(r.weekday, { close: e.target.value })} onBlur={() => blur(`hours.${r.weekday}`)} />
                      </label>
                      {err ? (
                        <p id={`tf-day-${r.weekday}-err`} className="basis-full text-[length:var(--text-footnote)] text-[color:var(--danger)]">
                          {err}
                        </p>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
              <button type="button" className={secondaryBtn} onClick={copyFirst}>
                {t('form.copyToAll', { day: biz(`weekday${WEEKDAY_KEY[v.rows[0]!.weekday]}`) })}
              </button>
              {shown('hours') && dayErrors.length === 0 ? (
                <p id="tf-hours-err" className="text-[length:var(--text-footnote)] text-[color:var(--danger)]">
                  {shown('hours')}
                </p>
              ) : null}
              {shown('hours') && dayErrors.length > 0 ? (
                <p id="tf-hours-err" className="text-[length:var(--text-footnote)] text-[color:var(--danger)]">
                  {t('validation.hoursProblems')}
                </p>
              ) : null}
            </>
          ) : null}
        </fieldset>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" onClick={onCancel} disabled={busy} className={secondaryBtn}>
            {t('form.cancel')}
          </button>
          <button type="submit" disabled={busy} className={primaryBtn}>
            {busy ? t('form.saving') : member ? t('form.save') : t('form.add')}
          </button>
        </div>
      </form>
      {member ? <DaysOffSection member={member} todayKey={todayKey} /> : <p className="text-[length:var(--text-footnote)] text-[color:var(--label-secondary)]">{t('daysOff.afterSave')}</p>}
    </div>
  );
}

/** Upcoming/ongoing days off with Remove, plus a one-range-per-submit "Add days off" form. */
function DaysOffSection({ member, todayKey }: { member: TeamMemberDto; todayKey: string }) {
  const t = useTranslations('team.daysOff');
  const tv = useTranslations('team');
  const locale = useLocale();
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [reason, setReason] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [status, setStatus] = useState('');
  const [problem, setProblem] = useState('');
  const [busy, setBusy] = useState(false);
  const msg = (code?: string) => (code ? (tv.has(`validation.${code}`) ? tv(`validation.${code}`) : tv('validation.invalid')) : undefined);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setStatus('');
    setProblem('');
    const local: Record<string, string> = {};
    if (!from) local.fromDate = 'invalidDate';
    if (!to) local.toDate = 'invalidDate';
    else if (from && to < from) local.toDate = 'toBeforeFrom';
    else if (to < todayKey) local.toDate = 'inPast';
    setErrors(local);
    if (Object.keys(local).length) return;
    setBusy(true);
    try {
      const res = await addDayOff(member.id, { fromDate: from, toDate: to, reason });
      if (res.ok) {
        setStatus(t('added'));
        setFrom('');
        setTo('');
        setReason('');
      } else if (res.code === 'HAS_BOOKINGS') {
        setProblem(t('hasBookings', { count: res.futureCount ?? 0, dates: (res.conflictDates ?? []).join(', ') }));
      } else if ('errors' in res && res.errors && Object.keys(res.errors).length) {
        setErrors(res.errors);
      } else {
        setProblem(tv(tv.has(`error.${res.code}`) ? `error.${res.code}` : 'error.UNKNOWN'));
      }
    } catch {
      setProblem(tv('error.UNKNOWN'));
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    setBusy(true);
    setStatus('');
    setProblem('');
    try {
      const res = await removeDayOff(id);
      if (res.ok) setStatus(t('removed'));
      else setProblem(tv(tv.has(`error.${res.code}`) ? `error.${res.code}` : 'error.UNKNOWN'));
    } catch {
      setProblem(tv('error.UNKNOWN'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-labelledby="tf-dayoff-title" className="space-y-3 border-t border-[color:var(--separator)] pt-4">
      <h3 id="tf-dayoff-title" className="text-[length:var(--text-headline)] font-semibold">
        {t('title')}
      </h3>
      <p role="status" aria-live="polite" className="font-medium">
        {status}
      </p>
      {problem ? (
        <p role="alert" className="rounded-[var(--radius-input)] border border-[color:var(--danger)] p-3 text-[color:var(--danger)]">
          {problem}
        </p>
      ) : null}
      {member.daysOff.length === 0 ? (
        <p className="text-[color:var(--label-secondary)]">{t('none')}</p>
      ) : (
        <ul className="divide-y divide-[color:var(--separator)] rounded-[var(--radius-card)] border border-[color:var(--separator)]">
          {member.daysOff.map((d) => {
            const range = d.fromDate === d.toDate ? formatKey(d.fromDate, locale) : t('range', { from: formatKey(d.fromDate, locale), to: formatKey(d.toDate, locale) });
            return (
              <li key={d.id} className="flex items-center justify-between gap-3 p-3">
                <div className="min-w-0">
                  <p className="font-medium">{range}</p>
                  {d.reason ? <p className="break-words text-[length:var(--text-footnote)] text-[color:var(--label-secondary)]">{d.reason}</p> : null}
                </div>
                <button type="button" disabled={busy} onClick={() => remove(d.id)} aria-label={t('removeRange', { range })} className="inline-flex min-h-11 items-center gap-1.5 rounded-[var(--radius-button)] border border-[color:var(--control-border)] px-3 font-medium disabled:opacity-40">
                  <Trash2 className="h-4 w-4" aria-hidden />
                  {t('remove')}
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <form onSubmit={add} noValidate className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Field id="do-from" label={t('from')} error={msg(errors.fromDate)}>
            <input {...fieldAria('do-from', undefined, msg(errors.fromDate))} type="date" min={todayKey} className={inputClass} value={from} onChange={(e) => setFrom(e.target.value)} />
          </Field>
          <Field id="do-to" label={t('to')} error={msg(errors.toDate)}>
            <input {...fieldAria('do-to', undefined, msg(errors.toDate))} type="date" min={from || todayKey} className={inputClass} value={to} onChange={(e) => setTo(e.target.value)} />
          </Field>
        </div>
        <Field id="do-reason" label={t('reason')} hint={t('reasonHint')} error={msg(errors.reason)}>
          <input {...fieldAria('do-reason', t('reasonHint'), msg(errors.reason))} type="text" autoComplete="off" maxLength={120} className={inputClass} value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
        {errors.form ? <p className="text-[length:var(--text-footnote)] text-[color:var(--danger)]">{msg(errors.form)}</p> : null}
        <button type="submit" disabled={busy} className={secondaryBtn}>
          {t('add')}
        </button>
      </form>
    </section>
  );
}
