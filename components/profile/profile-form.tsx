'use client';
/**
 * Profile details form (task 6.7). Controlled fields (a failed save never clears typed values),
 * inline validation after blur using the same shared schema as the server, server field errors
 * merged on top. Field messages reuse `onboarding.validation.*`; labels reuse `onboarding.basics.*`
 * / `onboarding.location.*`, `categories` and `cities`.
 */
import { useState, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { saveProfile } from '@/app/actions/profile';
import { fieldAria } from '@/components/calendar/fields';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
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

const selectClass =
  'min-h-11 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 aria-invalid:border-destructive dark:bg-input/30';

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
      <Input
        type={attrs.type ?? 'text'}
        inputMode={attrs.inputMode}
        autoComplete={attrs.autoComplete ?? 'off'}
        maxLength={attrs.maxLength}
        required={attrs.required}
        className="min-h-11"
        value={v[f]}
        onChange={(e) => set(f, e.target.value)}
        onBlur={() => blur(f)}
        {...fieldAria(`pf-${f}`, attrs.hint, err(f))}
      />
    </Field>
  );

  return (
    <form onSubmit={submit} noValidate className="space-y-4 rounded-xl border bg-card p-4 text-card-foreground shadow-sm">
      <div className="grid gap-4 sm:grid-cols-2">
        {text('name', ob('basics.name'), { autoComplete: 'organization', maxLength: 80, required: true })}
        <Field id="pf-category" label={ob('basics.category')} error={err('category')}>
          <select className={selectClass} value={v.category} onChange={(e) => set('category', e.target.value)} onBlur={() => blur('category')} {...fieldAria('pf-category', undefined, err('category'))}>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>{cat(c)}</option>
            ))}
          </select>
        </Field>
        <Field id="pf-city" label={ob('basics.city')} error={err('city')}>
          <select className={selectClass} value={v.city} onChange={(e) => set('city', e.target.value)} onBlur={() => blur('city')} {...fieldAria('pf-city', undefined, err('city'))}>
            {CITIES.map((c) => (
              <option key={c} value={c}>{cities(c)}</option>
            ))}
          </select>
        </Field>
        {text('address', ob('location.address'), { autoComplete: 'street-address', maxLength: 200, required: true })}
      </div>

      <fieldset aria-describedby="pf-languages-hint" className="space-y-1.5">
        <legend className="text-sm font-medium">{ob('basics.languages')}</legend>
        <p id="pf-languages-hint" className="text-xs text-muted-foreground">{ob('basics.languagesHint')}</p>
        <div className="flex flex-wrap gap-2">
          {LANGUAGES.map((l) => (
            <label key={l} className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-md border border-input px-3">
              <input
                type="checkbox"
                id={l === LANGUAGES[0] ? 'pf-languages' : undefined}
                className="h-5 w-5 accent-primary"
                checked={v.languages.includes(l)}
                onChange={(e) => set('languages', e.target.checked ? [...v.languages, l] : v.languages.filter((x) => x !== l))}
                onBlur={() => blur('languages')}
              />
              {t(`languageNames.${l}`)}
            </label>
          ))}
        </div>
        {err('languages') ? <p className="text-xs text-destructive">{err('languages')}</p> : null}
      </fieldset>

      {text('tagline', ob('basics.tagline'), { maxLength: 120, hint: ob('basics.taglineHint') })}
      <Field id="pf-about" label={ob('basics.about')} error={err('about')}>
        <Textarea rows={5} maxLength={2000} value={v.about} onChange={(e) => set('about', e.target.value)} onBlur={() => blur('about')} {...fieldAria('pf-about', undefined, err('about'))} />
      </Field>

      <h3 className="pt-2 text-base font-semibold">{t('details.contact')}</h3>
      <div className="grid gap-4 sm:grid-cols-2">
        {text('phone', ob('location.phone'), { type: 'tel', inputMode: 'tel', autoComplete: 'tel', hint: ob('location.phoneHint') })}
        {text('whatsapp', ob('location.whatsapp'), { type: 'tel', inputMode: 'tel', autoComplete: 'off' })}
        {text('instagram', ob('location.instagram'), { maxLength: 60, hint: ob('location.instagramHint') })}
        {text('website', ob('location.website'), { type: 'url', inputMode: 'url', autoComplete: 'url', maxLength: 200 })}
        {text('lat', ob('location.lat'), { inputMode: 'decimal', maxLength: 12 })}
        {text('lng', ob('location.lng'), { inputMode: 'decimal', maxLength: 12, hint: ob('location.coordsHint') })}
      </div>

      <h3 className="pt-2 text-base font-semibold">{t('details.translations')}</h3>
      <p className="text-xs text-muted-foreground">{t('details.translationsHint')}</p>
      {TR_LOCALES.map((l) => (
        <fieldset key={l} className="space-y-3 rounded-md border border-border p-3">
          <legend className="px-1 text-sm font-semibold">{t(`languageNames.${l}`)}</legend>
          <Field id={`pf-translations-${l}-tagline`} label={ob('basics.tagline')} error={err(`translations.${l}.tagline`)}>
            <Input type="text" lang={l} aria-label={`${ob('basics.tagline')} (${t(`languageNames.${l}`)})`} maxLength={120} autoComplete="off" className="min-h-11" value={v.translations[l].tagline} onChange={(e) => setTr(l, 'tagline', e.target.value)} onBlur={() => blur(`translations.${l}.tagline`)} {...fieldAria(`pf-translations-${l}-tagline`, undefined, err(`translations.${l}.tagline`))} />
          </Field>
          <Field id={`pf-translations-${l}-about`} label={ob('basics.about')} error={err(`translations.${l}.about`)}>
            <Textarea rows={4} lang={l} aria-label={`${ob('basics.about')} (${t(`languageNames.${l}`)})`} maxLength={2000} value={v.translations[l].about} onChange={(e) => setTr(l, 'about', e.target.value)} onBlur={() => blur(`translations.${l}.about`)} {...fieldAria(`pf-translations-${l}-about`, undefined, err(`translations.${l}.about`))} />
          </Field>
        </fieldset>
      ))}

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" size="lg" disabled={busy}>
          {busy ? t('details.saving') : t('details.save')}
        </Button>
        <div role="status" aria-live="polite" className="text-sm">{status}</div>
      </div>
      {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
    </form>
  );
}
