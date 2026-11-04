'use client';
/**
 * Booking rules (task 6.8). Number fields keep their typed text (never cleared on error); the same
 * schema as the server validates after blur and on submit. Results are announced via aria-live.
 */
import { useId, useState } from 'react';
import { useTranslations } from 'next-intl';
import { saveSettings } from '@/app/actions/settings';
import { Field, fieldAria, inputClass, primaryBtn } from '@/components/calendar/fields';
import { DATE_STRIP_MAX_DAYS, SETTINGS_BOUNDS, SLOT_INTERVALS, parseSettingsForm, type SettingsFieldErrors, type SettingsForm } from '@/lib/settings-schema';

type NumKey = 'bufferMin' | 'minLeadMin' | 'maxAdvanceDays' | 'cancellationWindowHours' | 'maxPerCustomerPerDay';
const NUM_KEYS: NumKey[] = ['bufferMin', 'minLeadMin', 'maxAdvanceDays', 'cancellationWindowHours', 'maxPerCustomerPerDay'];
type Draft = { autoConfirm: boolean; slotIntervalMin: number } & Record<NumKey, string>;

const toDraft = (s: SettingsForm): Draft => ({
  autoConfirm: s.autoConfirm,
  slotIntervalMin: s.slotIntervalMin,
  ...(Object.fromEntries(NUM_KEYS.map((k) => [k, String(s[k])])) as Record<NumKey, string>),
});
const toRaw = (d: Draft) => ({
  autoConfirm: d.autoConfirm,
  slotIntervalMin: d.slotIntervalMin,
  ...Object.fromEntries(NUM_KEYS.map((k) => [k, d[k].trim() === '' ? undefined : Number(d[k])])),
});

export function BookingRulesForm({ initial }: { initial: SettingsForm }) {
  const t = useTranslations('settings.rules');
  const uid = useId();
  const [v, setV] = useState<Draft>(() => toDraft(initial));
  const [touched, setTouched] = useState<Partial<Record<keyof Draft, boolean>>>({});
  const [serverErrors, setServerErrors] = useState<SettingsFieldErrors>({});
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const checked = parseSettingsForm(toRaw(v));
  const errors: SettingsFieldErrors = { ...(checked.ok ? {} : checked.errors), ...serverErrors };
  const errText = (k: keyof Draft) => {
    const code = errors[k];
    if (!code || !touched[k]) return undefined;
    const b = k in SETTINGS_BOUNDS ? SETTINGS_BOUNDS[k as NumKey] : { min: 0, max: 0, step: 1 };
    return t(`validation.${code}`, { min: b.min, max: b.max, step: b.step });
  };
  const set = <K extends keyof Draft>(k: K, val: Draft[K]) => {
    setV((p) => ({ ...p, [k]: val }));
    setServerErrors((p) => ({ ...p, [k]: undefined }));
    setStatus('');
  };
  const blur = (k: keyof Draft) => setTouched((p) => ({ ...p, [k]: true }));

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus('');
    setError('');
    setTouched(Object.fromEntries(Object.keys(v).map((k) => [k, true])));
    if (!checked.ok) {
      setError(t('error.fix'));
      return;
    }
    setBusy(true);
    try {
      const res = await saveSettings(checked.data);
      if (res.ok) setStatus(res.fields.length ? t('saved') : t('unchanged'));
      else if (res.code === 'VALIDATION' && res.errors) {
        setServerErrors(res.errors);
        setError(t('error.fix'));
      } else setError(t(t.has(`error.${res.code}`) ? `error.${res.code}` : 'error.UNKNOWN'));
    } catch {
      setError(t('error.UNKNOWN'));
    } finally {
      setBusy(false);
    }
  }

  const minutes = Number(v.minLeadMin);
  const leadPreview = Number.isFinite(minutes) && v.minLeadMin.trim() !== '' ? t('minLeadPreview', { hours: Math.floor(minutes / 60), minutes: minutes % 60 }) : undefined;

  const num = (k: NumKey, hint?: string, opts: { suffix?: string } = {}) => {
    const id = `${uid}-${k}`;
    const err = errText(k);
    const b = SETTINGS_BOUNDS[k];
    const hintText = [t(`${k}.hint`, { min: b.min, max: b.max }), hint].filter(Boolean).join(' ');
    return (
      <Field id={id} label={t(`${k}.label`)} hint={hintText} error={err}>
        <div className="flex items-center gap-2">
          <input
            {...fieldAria(id, hintText, err)}
            type="number"
            inputMode="numeric"
            autoComplete="off"
            min={b.min}
            max={b.max}
            step={b.step}
            className={`${inputClass} max-w-40`}
            value={v[k]}
            onChange={(e) => set(k, e.target.value)}
            onBlur={() => blur(k)}
          />
          {opts.suffix ? <span className="text-[color:var(--label-secondary)]">{opts.suffix}</span> : null}
        </div>
      </Field>
    );
  };

  const radioCard = 'flex min-h-11 cursor-pointer items-start gap-3 rounded-[var(--radius-input)] border border-[color:var(--control-border)] p-3 has-[:checked]:border-2 has-[:checked]:border-[color:var(--tint)] has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2';

  return (
    <form onSubmit={submit} noValidate className="space-y-6 rounded-[var(--radius-card)] bg-[color:var(--surface)] p-4">
      <fieldset className="space-y-2">
        <legend className="text-[length:var(--text-subhead)] font-medium">{t('autoConfirm.label')}</legend>
        {([true, false] as const).map((val) => (
          <label key={String(val)} className={radioCard}>
            <input type="radio" name={`${uid}-auto`} className="mt-1 h-5 w-5" checked={v.autoConfirm === val} onChange={() => set('autoConfirm', val)} />
            <span>
              <span className="block font-medium">{t(val ? 'autoConfirm.instant' : 'autoConfirm.manual')}</span>
              <span className="block text-[length:var(--text-footnote)] text-[color:var(--label-secondary)]">{t(val ? 'autoConfirm.instantHint' : 'autoConfirm.manualHint')}</span>
            </span>
          </label>
        ))}
      </fieldset>

      <fieldset className="space-y-2">
        <legend className="text-[length:var(--text-subhead)] font-medium">{t('slotIntervalMin.label')}</legend>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-describedby={`${uid}-slot-hint`}>
          {SLOT_INTERVALS.map((n) => (
            <label key={n} className={`${radioCard} items-center`}>
              <input type="radio" name={`${uid}-slot`} className="h-5 w-5" checked={v.slotIntervalMin === n} onChange={() => set('slotIntervalMin', n)} />
              <span className="font-medium">{t('slotIntervalMin.option', { minutes: n })}</span>
            </label>
          ))}
        </div>
        <p id={`${uid}-slot-hint`} className="text-[length:var(--text-footnote)] text-[color:var(--label-secondary)]">
          {t('slotIntervalMin.hint')}
        </p>
      </fieldset>

      <div className="grid gap-6 sm:grid-cols-2">
        {num('bufferMin', undefined, { suffix: t('units.minutes') })}
        {num('minLeadMin', leadPreview, { suffix: t('units.minutes') })}
        {num('maxAdvanceDays', t('maxAdvanceDays.stripNote', { days: DATE_STRIP_MAX_DAYS }), { suffix: t('units.days') })}
        {num('cancellationWindowHours', undefined, { suffix: t('units.hours') })}
        {num('maxPerCustomerPerDay')}
      </div>

      <p className="text-[length:var(--text-footnote)] text-[color:var(--label-secondary)]">{t('existingNote')}</p>

      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={busy} className={primaryBtn}>
          {busy ? t('saving') : t('save')}
        </button>
        <p role={error ? 'alert' : 'status'} aria-live="polite" className={`font-medium ${error ? 'text-[color:var(--danger)]' : 'text-[color:var(--success)]'}`}>
          {error || status}
        </p>
      </div>
    </form>
  );
}
