'use client';
/**
 * Profile details form (task 6.7). Controlled fields (a failed save never clears typed values),
 * inline validation after blur using the same shared schema as the server, server field errors
 * merged on top. Field messages reuse `onboarding.validation.*`; labels reuse `onboarding.basics.*`
 * / `onboarding.location.*`, `categories` and `cities`.
 */
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { saveProfile } from '@/app/actions/profile';
import { Field, fieldAria, inputClass, primaryBtn } from '@/components/calendar/fields';
import { CATEGORIES, CITIES } from '@/lib/catalogue';
import { LANGUAGES } from '@/lib/onboarding-schema';
import { parseProfile } from '@/lib/profile-schema';

export interface ProfileValues {
  name: string;
  category: string;
  city: string;
  languages: string[];
  tagline: string;
  about: string;
  address: string;
  phone: string;
  whatsapp: string;
  instagram: string;
  website: string;
  lat: string;
  lng: string;
  translations: { el: { tagline: string; about: string }; ru: { tagline: string; about: string } };
}

const TR_LOCALES = ['el', 'ru'] as const;

export function ProfileForm({ initial }: { initial: ProfileValues }) {
  const t = useTranslations('profile');
  const ob = useTranslations('onboarding');
  const cat = useTranslations('categories');
  const cities = useTranslations('cities');
  const [v, setV] = useState<ProfileValues>(initial);
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [submitted, setSubmitted] = useState(false);
  const [serverErrors, setServerErrors] = useState<Record<string, string>>({});
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const parsed = parseProfile(v);
  const local = parsed.ok ? {} : parsed.errors;
  const errors = { ...local, ...serverErrors };
  const msg = (code?: string) => (code ? (ob.has(`validation.${code}`) ? ob(`validation.${code}`) : ob('validation.invalid')) : undefined);
  const err = (f: string) => (touched[f] || submitted || serverErrors[f] ? msg(errors[f]) : undefined);
  const blur = (f: string) => setTouched((p) => ({ ...p, [f]: true }));
  const set = <K extends keyof ProfileValues>(k: K, val: ProfileValues[K]) => {
    setV((p) => ({ ...p, [k]: val }));
    setServerErrors({});
  };
  const setTr = (l: (typeof TR_LOCALES)[number], k: 'tagline' | 'about', val: string) => {
    setV((p) => ({ ...p, translations: { ...p.translations, [l]: { ...p.translations[l], [k]: val } } }));
    setServerErrors({});
  };

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitted(true);
    setStatus('');
    setError('');
    const firstBad = Object.keys(local)[0];
    if (firstBad) {
      e.currentTarget.querySelector<HTMLElement>(`#pf-${firstBad.replace(/\./g, '-')}`)?.focus();
      return;
    }
    setBusy(true);
    try {
      const res = await saveProfile(v);
      if (res.ok) setStatus(t('details.saved'));
      else if ('errors' in res && res.errors && Object.keys(res.errors).length) {
        setServerErrors(res.errors);
        setError(t('error.VALIDATION'));
      } else setError(t(t.has(`error.${res.code}`) ? `error.${res.code}` : 'error.UNKNOWN'));
    } catch {
      setError(t('error.UNKNOWN'));
    } finally {
      setBusy(false);
    }
  }

  const text = (
    f: Exclude<keyof ProfileValues, 'languages' | 'translations'>,
    label: string,
    attrs: { type?: string; inputMode?: 'text' | 'tel' | 'url' | 'decimal'; autoComplete?: string; maxLength?: number; hint?: string; required?: boolean } = {},
  ) => (
    <Field id={`pf-${f}`} label={label} hint={attrs.hint} error={err(f)}>
      <input
        type={attrs.type ?? 'text'}
        inputMode={attrs.inputMode}
        autoComplete={attrs.autoComplete ?? 'off'}
        maxLength={attrs.maxLength}
        required={attrs.required}
        className={inputClass}
        value={v[f]}
        onChange={(e) => set(f, e.target.value)}
        onBlur={() => blur(f)}
        {...fieldAria(`pf-${f}`, attrs.hint, err(f))}
      />
    </Field>
  );

  return (
    <form onSubmit={submit} noValidate className="space-y-4 rounded-[var(--radius-card)] bg-[color:var(--surface)] p-4">
      <div className="grid gap-4 sm:grid-cols-2">
        {text('name', ob('basics.name'), { autoComplete: 'organization', maxLength: 80, required: true })}
        <Field id="pf-category" label={ob('basics.category')} error={err('category')}>
          <select className={inputClass} value={v.category} onChange={(e) => set('category', e.target.value)} onBlur={() => blur('category')} {...fieldAria('pf-category', undefined, err('category'))}>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>{cat(c)}</option>
            ))}
          </select>
        </Field>
        <Field id="pf-city" label={ob('basics.city')} error={err('city')}>
          <select className={inputClass} value={v.city} onChange={(e) => set('city', e.target.value)} onBlur={() => blur('city')} {...fieldAria('pf-city', undefined, err('city'))}>
            {CITIES.map((c) => (
              <option key={c} value={c}>{cities(c)}</option>
            ))}
          </select>
        </Field>
        {text('address', ob('location.address'), { autoComplete: 'street-address', maxLength: 200, required: true })}
      </div>

      <fieldset aria-describedby="pf-languages-hint" className="space-y-1">
        <legend className="text-[length:var(--text-subhead)] font-medium">{ob('basics.languages')}</legend>
        <p id="pf-languages-hint" className="text-[length:var(--text-footnote)] text-[color:var(--label-secondary)]">{ob('basics.languagesHint')}</p>
        <div className="flex flex-wrap gap-2">
          {LANGUAGES.map((l) => (
            <label key={l} className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-[var(--radius-button)] border border-[color:var(--control-border)] px-3">
              <input
                type="checkbox"
                id={l === LANGUAGES[0] ? 'pf-languages' : undefined}
                className="h-5 w-5 accent-[color:var(--tint)]"
                checked={v.languages.includes(l)}
                onChange={(e) => set('languages', e.target.checked ? [...v.languages, l] : v.languages.filter((x) => x !== l))}
                onBlur={() => blur('languages')}
              />
              {t(`languageNames.${l}`)}
            </label>
          ))}
        </div>
        {err('languages') ? <p className="text-[length:var(--text-footnote)] text-[color:var(--danger)]">{err('languages')}</p> : null}
      </fieldset>

      {text('tagline', ob('basics.tagline'), { maxLength: 120, hint: ob('basics.taglineHint') })}
      <Field id="pf-about" label={ob('basics.about')} error={err('about')}>
        <textarea rows={5} maxLength={2000} className={inputClass} value={v.about} onChange={(e) => set('about', e.target.value)} onBlur={() => blur('about')} {...fieldAria('pf-about', undefined, err('about'))} />
      </Field>

      <h3 className="pt-2 text-[length:var(--text-headline)] font-semibold">{t('details.contact')}</h3>
      <div className="grid gap-4 sm:grid-cols-2">
        {text('phone', ob('location.phone'), { type: 'tel', inputMode: 'tel', autoComplete: 'tel', hint: ob('location.phoneHint') })}
        {text('whatsapp', ob('location.whatsapp'), { type: 'tel', inputMode: 'tel', autoComplete: 'off' })}
        {text('instagram', ob('location.instagram'), { maxLength: 60, hint: ob('location.instagramHint') })}
        {text('website', ob('location.website'), { type: 'url', inputMode: 'url', autoComplete: 'url', maxLength: 200 })}
        {text('lat', ob('location.lat'), { inputMode: 'decimal', maxLength: 12 })}
        {text('lng', ob('location.lng'), { inputMode: 'decimal', maxLength: 12, hint: ob('location.coordsHint') })}
      </div>

      <h3 className="pt-2 text-[length:var(--text-headline)] font-semibold">{t('details.translations')}</h3>
      <p className="text-[length:var(--text-footnote)] text-[color:var(--label-secondary)]">{t('details.translationsHint')}</p>
      {TR_LOCALES.map((l) => (
        <fieldset key={l} className="space-y-3 rounded-[var(--radius-input)] border border-[color:var(--separator)] p-3">
          <legend className="px-1 text-[length:var(--text-subhead)] font-semibold">{t(`languageNames.${l}`)}</legend>
          <Field id={`pf-translations-${l}-tagline`} label={ob('basics.tagline')} error={err(`translations.${l}.tagline`)}>
            <input type="text" lang={l} aria-label={`${ob('basics.tagline')} (${t(`languageNames.${l}`)})`} maxLength={120} autoComplete="off" className={inputClass} value={v.translations[l].tagline} onChange={(e) => setTr(l, 'tagline', e.target.value)} onBlur={() => blur(`translations.${l}.tagline`)} {...fieldAria(`pf-translations-${l}-tagline`, undefined, err(`translations.${l}.tagline`))} />
          </Field>
          <Field id={`pf-translations-${l}-about`} label={ob('basics.about')} error={err(`translations.${l}.about`)}>
            <textarea rows={4} lang={l} aria-label={`${ob('basics.about')} (${t(`languageNames.${l}`)})`} maxLength={2000} className={inputClass} value={v.translations[l].about} onChange={(e) => setTr(l, 'about', e.target.value)} onBlur={() => blur(`translations.${l}.about`)} {...fieldAria(`pf-translations-${l}-about`, undefined, err(`translations.${l}.about`))} />
          </Field>
        </fieldset>
      ))}

      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={busy} className={primaryBtn}>
          {busy ? t('details.saving') : t('details.save')}
        </button>
        <div role="status" aria-live="polite" className="text-[length:var(--text-subhead)]">{status}</div>
      </div>
      {error ? <p role="alert" className="text-[length:var(--text-subhead)] text-[color:var(--danger)]">{error}</p> : null}
    </form>
  );
}
