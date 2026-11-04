'use client';

/**
 * "Block time" form (task 6.2): one team member or all, optional daily/weekly repeat.
 * Controlled fields (a failed submit never clears input). The server core expands the
 * series and rejects a block that would cover an existing booking.
 */
import { useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { createBlock } from '@/app/actions/calendar';
import { addDaysToKey } from '@/lib/time';
import {
  Field,
  fieldAria,
  failureKey,
  inputClass,
  primaryBtn,
  secondaryBtn,
  type ActionFailure,
} from './fields';

const toMin = (hhmm: string) => {
  const m = /^(\d{2}):(\d{2})$/.exec(hhmm);
  return m ? Number(m[1]) * 60 + Number(m[2]) : NaN;
};

export function BlockForm({
  staff,
  defaults,
  slotIntervalMin,
  onDone,
  onCancel,
}: {
  staff: Array<{ id: string; name: string }>;
  defaults: { staffId: string; dateKey: string; start: string; end: string };
  slotIntervalMin: number;
  onDone: (created: number) => void;
  onCancel: () => void;
}) {
  const t = useTranslations('calendar');
  const formRef = useRef<HTMLFormElement>(null);
  const [v, setV] = useState({
    staffId: defaults.staffId,
    date: defaults.dateKey,
    start: defaults.start,
    end: defaults.end,
    reason: '',
    recurrence: 'none' as 'none' | 'daily' | 'weekly',
    until: addDaysToKey(defaults.dateKey, 28),
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

  const startMin = toMin(v.start);
  const endMin = toMin(v.end);
  const local: Record<string, string> = {};
  if (!v.date) local.date = 'invalidDate';
  if (Number.isNaN(startMin)) local.start = 'invalidTime';
  if (Number.isNaN(endMin)) local.end = 'invalidTime';
  else if (!Number.isNaN(startMin) && endMin <= startMin) local.end = 'endBeforeStart';
  if (v.recurrence !== 'none') {
    if (!v.until) local.until = 'untilRequired';
    else if (v.until < v.date) local.until = 'untilBeforeStart';
  }
  // Server-side field names map onto this form's ids.
  const mapped: Record<string, string> = {};
  const alias: Record<string, string> = {
    dateKey: 'date',
    untilKey: 'until',
    startMin: 'start',
    endMin: 'end',
  };
  for (const [k, c] of Object.entries(serverErrors)) mapped[alias[k] ?? k] = c;
  const errors = { ...local, ...mapped };

  const shown = (f: string) =>
    touched[f] || submitted || mapped[f] ? errors[f] : undefined;
  const msg = (code?: string) =>
    code
      ? t.has(`validation.${code}`)
        ? t(`validation.${code}`)
        : t('error.VALIDATION')
      : undefined;
  const blur = (f: string) => setTouched((p) => ({ ...p, [f]: true }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitted(true);
    setFormError(null);
    const first = ['date', 'start', 'end', 'until'].find((f) => local[f]);
    if (first) {
      formRef.current?.querySelector<HTMLElement>(`#bf-${first}`)?.focus();
      return;
    }
    setBusy(true);
    try {
      const res = await createBlock({
        staffId: v.staffId,
        dateKey: v.date,
        startMin,
        endMin,
        reason: v.reason,
        recurrence: v.recurrence,
        untilKey: v.recurrence === 'none' ? undefined : v.until,
      });
      if (res.ok) {
        onDone(res.created);
        return;
      }
      const f = res as ActionFailure;
      if (f.errors && Object.keys(f.errors).length) {
        const { form, ...fields } = f.errors;
        setServerErrors(fields);
        if (form) setFormError(msg(form) ?? t('error.VALIDATION'));
        else if (!Object.keys(fields).length) setFormError(t('error.VALIDATION'));
      } else {
        const { key, values } = failureKey(f);
        setFormError(t(`error.${key}`, values));
      }
    } catch {
      setFormError(t('error.UNKNOWN'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form ref={formRef} onSubmit={submit} noValidate className="space-y-4">
      {formError ? (
        <p
          role="alert"
          className="rounded-[var(--radius-input)] border border-[color:var(--danger)] p-3 text-[color:var(--danger)]"
        >
          {formError}
        </p>
      ) : null}

      <Field id="bf-staffId" label={t('blockForm.staff')} error={msg(shown('staffId'))}>
        <select
          {...fieldAria('bf-staffId', undefined, msg(shown('staffId')))}
          className={inputClass}
          value={v.staffId}
          onChange={(e) => set('staffId', e.target.value)}
        >
          <option value="all">{t('blockForm.allStaff')}</option>
          {staff.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </Field>

      <Field id="bf-date" label={t('blockForm.date')} error={msg(shown('date'))}>
        <input
          {...fieldAria('bf-date', undefined, msg(shown('date')))}
          type="date"
          className={inputClass}
          value={v.date}
          onChange={(e) => set('date', e.target.value)}
          onBlur={() => blur('date')}
        />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field id="bf-start" label={t('blockForm.start')} error={msg(shown('start'))}>
          <input
            {...fieldAria('bf-start', undefined, msg(shown('start')))}
            type="time"
            step={slotIntervalMin * 60}
            className={inputClass}
            value={v.start}
            onChange={(e) => set('start', e.target.value)}
            onBlur={() => blur('start')}
          />
        </Field>
        <Field id="bf-end" label={t('blockForm.end')} error={msg(shown('end'))}>
          <input
            {...fieldAria('bf-end', undefined, msg(shown('end')))}
            type="time"
            step={slotIntervalMin * 60}
            className={inputClass}
            value={v.end}
            onChange={(e) => set('end', e.target.value)}
            onBlur={() => blur('end')}
          />
        </Field>
      </div>

      <Field id="bf-reason" label={t('blockForm.reason')} error={msg(shown('reason'))}>
        <input
          {...fieldAria('bf-reason', undefined, msg(shown('reason')))}
          type="text"
          autoComplete="off"
          maxLength={120}
          className={inputClass}
          value={v.reason}
          onChange={(e) => set('reason', e.target.value)}
        />
      </Field>

      <Field id="bf-recurrence" label={t('blockForm.repeat')}>
        <select
          id="bf-recurrence"
          className={inputClass}
          value={v.recurrence}
          onChange={(e) =>
            set('recurrence', e.target.value as 'none' | 'daily' | 'weekly')
          }
        >
          <option value="none">{t('blockForm.none')}</option>
          <option value="daily">{t('blockForm.daily')}</option>
          <option value="weekly">{t('blockForm.weekly')}</option>
        </select>
      </Field>

      {v.recurrence !== 'none' ? (
        <Field
          id="bf-until"
          label={t('blockForm.until')}
          hint={t('blockForm.untilHint')}
          error={msg(shown('until'))}
        >
          <input
            {...fieldAria('bf-until', 'hint', msg(shown('until')))}
            type="date"
            className={inputClass}
            value={v.until}
            min={v.date}
            onChange={(e) => set('until', e.target.value)}
            onBlur={() => blur('until')}
          />
        </Field>
      ) : null}

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <button type="button" onClick={onCancel} disabled={busy} className={secondaryBtn}>
          {t('blockForm.cancel')}
        </button>
        <button type="submit" disabled={busy} className={primaryBtn}>
          {busy ? t('blockForm.saving') : t('blockForm.submit')}
        </button>
      </div>
    </form>
  );
}
