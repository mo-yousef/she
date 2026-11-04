'use client';

/**
 * Add / edit service form (task 6.4). Controlled fields, so a failed submit never clears
 * what was typed. Local validation reuses the SAME zod schema as the server core and shows
 * after blur / submit; server field errors are shown as returned. Native inputs only.
 */
import { useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { createService, updateService } from '@/app/actions/services';
import { CATEGORIES } from '@/lib/catalogue';
import { centsToInputValue } from '@/lib/money';
import type { ServiceDto } from '@/lib/services';
import { SERVICE_LOCALES, serviceFieldErrors, serviceInputSchema } from '@/lib/services-schema';
import { Field, fieldAria, inputClass, primaryBtn, secondaryBtn } from '@/components/calendar/fields';

export interface SavedInfo {
  mode: 'created' | 'updated';
  noVisible: boolean;
}

export function ServiceForm({
  service,
  staff,
  warnLastVisible,
  onDone,
  onCancel,
}: {
  service: ServiceDto | null;
  staff: Array<{ id: string; name: string }>;
  /** Editing the only visible service of a PENDING/PUBLISHED listing. */
  warnLastVisible: boolean;
  onDone: (info: SavedInfo) => void;
  onCancel: () => void;
}) {
  const t = useTranslations('services');
  const cat = useTranslations('categories');
  const formRef = useRef<HTMLFormElement>(null);
  const [v, setV] = useState({
    name: service?.name ?? '',
    category: service?.category ?? CATEGORIES[0],
    description: service?.description ?? '',
    durationMin: String(service?.durationMin ?? 60),
    bufferMin: String(service?.bufferMin ?? 0),
    price: service ? centsToInputValue(service.priceCents) : '',
    active: service?.active ?? true,
    staffIds: service?.staffIds ?? ([] as string[]),
    translations: service?.translations ?? { el: { name: '', description: '' }, ru: { name: '', description: '' } },
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
  const setTr = (l: 'el' | 'ru', k: 'name' | 'description', val: string) => {
    setV((p) => ({ ...p, translations: { ...p.translations, [l]: { ...p.translations[l], [k]: val } } }));
    setServerErrors({});
  };
  const blur = (f: string) => setTouched((p) => ({ ...p, [f]: true }));

  const payload = { ...v };
  const parsed = serviceInputSchema.safeParse(payload);
  const local = parsed.success ? {} : serviceFieldErrors(parsed.error);
  if (v.active && v.staffIds.length === 0) local.staffIds ??= 'staffRequired';
  const errors: Record<string, string> = { ...local, ...serverErrors };
  const msg = (code?: string) => (code ? (t.has(`validation.${code}`) ? t(`validation.${code}`) : t('validation.invalid')) : undefined);
  const shown = (f: string) => (touched[f] || submitted || serverErrors[f] ? msg(errors[f]) : undefined);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitted(true);
    setFormError(null);
    const firstBad = Object.keys(local)[0];
    if (firstBad) {
      const id = firstBad === 'staffIds' ? 'sf-staff' : `sf-${firstBad.replace(/^translations\.(\w+)\.(\w+)$/, 'tr-$1-$2')}`;
      formRef.current?.querySelector<HTMLElement>(`#${id}`)?.focus();
      return;
    }
    setBusy(true);
    try {
      const res = service ? await updateService(service.id, payload) : await createService(payload);
      if (res.ok) {
        onDone({ mode: service ? 'updated' : 'created', noVisible: res.warnings.includes('NO_VISIBLE_SERVICE') });
        return;
      }
      if ('errors' in res && res.errors && Object.keys(res.errors).length) {
        setServerErrors(res.errors);
        setFormError(t('error.VALIDATION'));
      } else {
        setFormError(t(t.has(`error.${res.code}`) ? `error.${res.code}` : 'error.UNKNOWN'));
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
        <p role="alert" className="rounded-[var(--radius-input)] border border-[color:var(--danger)] p-3 text-[color:var(--danger)]">
          {formError}
        </p>
      ) : null}

      <Field id="sf-name" label={t('form.name')} error={shown('name')}>
        <input {...fieldAria('sf-name', undefined, shown('name'))} type="text" autoComplete="off" maxLength={80} required className={inputClass} value={v.name} onChange={(e) => set('name', e.target.value)} onBlur={() => blur('name')} />
      </Field>

      <Field id="sf-category" label={t('form.category')} error={shown('category')}>
        <select {...fieldAria('sf-category', undefined, shown('category'))} className={inputClass} value={v.category} onChange={(e) => set('category', e.target.value)}>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {cat(c)}
            </option>
          ))}
        </select>
      </Field>

      <Field id="sf-description" label={t('form.description')} error={shown('description')}>
        <textarea {...fieldAria('sf-description', undefined, shown('description'))} rows={3} maxLength={500} autoComplete="off" className={inputClass} value={v.description} onChange={(e) => set('description', e.target.value)} onBlur={() => blur('description')} />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field id="sf-durationMin" label={t('form.duration')} hint={t('form.durationHint')} error={shown('durationMin')}>
          <input {...fieldAria('sf-durationMin', t('form.durationHint'), shown('durationMin'))} type="number" inputMode="numeric" min={5} max={480} step={5} autoComplete="off" className={inputClass} value={v.durationMin} onChange={(e) => set('durationMin', e.target.value)} onBlur={() => blur('durationMin')} />
        </Field>
        <Field id="sf-bufferMin" label={t('form.buffer')} hint={t('form.bufferHint')} error={shown('bufferMin')}>
          <input {...fieldAria('sf-bufferMin', t('form.bufferHint'), shown('bufferMin'))} type="number" inputMode="numeric" min={0} max={120} step={5} autoComplete="off" className={inputClass} value={v.bufferMin} onChange={(e) => set('bufferMin', e.target.value)} onBlur={() => blur('bufferMin')} />
        </Field>
      </div>

      <Field id="sf-price" label={t('form.price')} hint={t('form.priceHint')} error={shown('price')}>
        <input {...fieldAria('sf-price', t('form.priceHint'), shown('price'))} type="text" inputMode="decimal" autoComplete="off" maxLength={8} className={inputClass} value={v.price} onChange={(e) => set('price', e.target.value)} onBlur={() => blur('price')} />
      </Field>

      <div className="space-y-1">
        <label className="flex min-h-11 items-center gap-3 text-[length:var(--text-body)] font-medium">
          <input type="checkbox" className="h-5 w-5" checked={v.active} onChange={(e) => set('active', e.target.checked)} aria-describedby="sf-active-hint" />
          {t('form.visible')}
        </label>
        <p id="sf-active-hint" className="text-[length:var(--text-footnote)] text-[color:var(--label-secondary)]">
          {t('form.visibleHint')}
        </p>
        {warnLastVisible && !v.active ? (
          <p role="status" className="text-[length:var(--text-footnote)] font-medium text-[color:var(--label)]">
            {t('warnings.lastVisible')}
          </p>
        ) : null}
      </div>

      <fieldset className="space-y-1" aria-describedby={shown('staffIds') ? 'sf-staff-err' : undefined}>
        <legend className="text-[length:var(--text-subhead)] font-medium">{t('form.staff')}</legend>
        {staff.length === 0 ? (
          <p className="text-[length:var(--text-subhead)] text-[color:var(--label-secondary)]">{t('form.noStaff')}</p>
        ) : (
          <ul id="sf-staff" tabIndex={-1} className="space-y-0.5">
            {staff.map((s) => (
              <li key={s.id}>
                <label className="flex min-h-11 items-center gap-3">
                  <input
                    type="checkbox"
                    className="h-5 w-5"
                    checked={v.staffIds.includes(s.id)}
                    onChange={(e) => set('staffIds', e.target.checked ? [...v.staffIds, s.id] : v.staffIds.filter((id) => id !== s.id))}
                    onBlur={() => blur('staffIds')}
                  />
                  {s.name}
                </label>
              </li>
            ))}
          </ul>
        )}
        {shown('staffIds') ? (
          <p id="sf-staff-err" className="text-[length:var(--text-footnote)] text-[color:var(--danger)]">
            {shown('staffIds')}
          </p>
        ) : null}
      </fieldset>

      <details className="rounded-[var(--radius-input)] border border-[color:var(--control-border)] p-3">
        <summary className="min-h-11 cursor-pointer py-2 font-medium">{t('form.translations')}</summary>
        <p className="mb-3 text-[length:var(--text-footnote)] text-[color:var(--label-secondary)]">{t('form.translationsHint')}</p>
        <div className="space-y-5">
          {SERVICE_LOCALES.map((l) => (
            <fieldset key={l} className="min-w-0 space-y-3">
              <legend className="mb-3 text-[length:var(--text-subhead)] font-semibold">{t(`form.lang.${l}`)}</legend>
              <Field id={`sf-tr-${l}-name`} label={t('form.name')} error={shown(`translations.${l}.name`)}>
                <input {...fieldAria(`sf-tr-${l}-name`, undefined, shown(`translations.${l}.name`))} type="text" autoComplete="off" lang={l} aria-label={`${t('form.name')} (${t(`form.lang.${l}`)})`} maxLength={80} className={inputClass} value={v.translations[l].name} onChange={(e) => setTr(l, 'name', e.target.value)} onBlur={() => blur(`translations.${l}.name`)} />
              </Field>
              <Field id={`sf-tr-${l}-description`} label={t('form.description')} error={shown(`translations.${l}.description`)}>
                <textarea {...fieldAria(`sf-tr-${l}-description`, undefined, shown(`translations.${l}.description`))} rows={2} lang={l} aria-label={`${t('form.description')} (${t(`form.lang.${l}`)})`} maxLength={500} autoComplete="off" className={inputClass} value={v.translations[l].description} onChange={(e) => setTr(l, 'description', e.target.value)} onBlur={() => blur(`translations.${l}.description`)} />
              </Field>
            </fieldset>
          ))}
        </div>
      </details>

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <button type="button" onClick={onCancel} disabled={busy} className={secondaryBtn}>
          {t('form.cancel')}
        </button>
        <button type="submit" disabled={busy} className={primaryBtn}>
          {busy ? t('form.saving') : service ? t('form.save') : t('form.add')}
        </button>
      </div>
    </form>
  );
}
