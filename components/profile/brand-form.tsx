'use client';
/**
 * Brand colour picker (task 6.7). Native colour input + hex text input kept in sync; the same
 * pure `checkBrand` as the server runs live and shows the ratio as TEXT with an icon (never
 * colour alone). The preview reproduces the public header exactly (white text on
 * `linear-gradient(135deg, b1, b1 78% + black)`). Typed values are never cleared on error.
 */
import { useId, useState } from 'react';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { saveBrand } from '@/app/actions/profile';
import { Field, inputClass, primaryBtn, secondaryBtn } from '@/components/calendar/fields';
import { DEFAULT_BRAND_ACCENT, DEFAULT_BRAND_PRIMARY, MIN_BRAND_CONTRAST, checkBrand, type BrandFieldCheck } from '@/lib/brand';
import { displayRatio, parseHex } from '@/lib/contrast';

type Key = 'brandPrimary' | 'brandAccent';

export function BrandForm({ businessName, initial }: { businessName: string; initial: { brandPrimary: string; brandAccent: string } }) {
  const t = useTranslations('profile.brand');
  const locale = useLocale();
  const uid = useId();
  const [v, setV] = useState(initial);
  const [touched, setTouched] = useState<Record<Key, boolean>>({ brandPrimary: false, brandAccent: false });
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const check = checkBrand(v.brandPrimary, v.brandAccent);
  const fmt = (n: number) => new Intl.NumberFormat(locale, { minimumFractionDigits: 1, maximumFractionDigits: 2 }).format(displayRatio(n));
  const set = (k: Key, val: string) => {
    setV((p) => ({ ...p, [k]: val }));
    setStatus('');
  };

  function readout(k: Key, c: BrandFieldCheck) {
    if (c.ratio === null) {
      return c.error === 'hexInvalid' ? { ok: false, text: t('error.hexInvalid') } : { ok: false, text: t('readout.waiting') };
    }
    const ratio = fmt(c.ratio);
    return c.ok
      ? { ok: true, text: t('readout.pass', { ratio }) }
      : { ok: false, text: t(k === 'brandPrimary' ? 'readout.failPrimary' : 'readout.failAccent', { ratio, min: fmt(MIN_BRAND_CONTRAST) }) };
  }

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus('');
    setError('');
    setTouched({ brandPrimary: true, brandAccent: true });
    if (!check.ok) {
      setError(t('error.fix'));
      return;
    }
    setBusy(true);
    try {
      const res = await saveBrand(v);
      if (res.ok) {
        setV({ brandPrimary: res.brandPrimary, brandAccent: res.brandAccent });
        setStatus(t('saved'));
      } else setError(t(t.has(`error.${res.code}`) ? `error.${res.code}` : 'error.UNKNOWN'));
    } catch {
      setError(t('error.UNKNOWN'));
    } finally {
      setBusy(false);
    }
  }

  const primary = check.brandPrimary.hex ?? DEFAULT_BRAND_PRIMARY;
  const picker = (k: Key, label: string, hint: string) => {
    const c = check[k];
    const r = readout(k, c);
    const id = `${uid}-${k}`;
    const showInvalid = touched[k] && !c.ok;
    return (
      <div className="space-y-2">
        <Field id={id} label={label} hint={hint}>
          <div className="flex items-center gap-2">
            <input
              type="color"
              aria-label={t('pickerLabel', { field: label })}
              className="h-11 w-14 shrink-0 cursor-pointer rounded-[var(--radius-input)] border border-[color:var(--control-border)] bg-transparent p-1"
              value={parseHex(v[k]) ?? '#000000'}
              onChange={(e) => set(k, e.target.value)}
            />
            <input
              id={id}
              type="text"
              inputMode="text"
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
              maxLength={7}
              className={`${inputClass} font-mono`}
              value={v[k]}
              onChange={(e) => set(k, e.target.value)}
              onBlur={() => setTouched((p) => ({ ...p, [k]: true }))}
              aria-invalid={showInvalid ? true : undefined}
              aria-describedby={`${id}-hint ${id}-readout`}
            />
          </div>
        </Field>
        <p id={`${id}-readout`} className={`flex items-start gap-2 text-[length:var(--text-subhead)] ${r.ok ? '' : 'font-medium text-[color:var(--danger)]'}`}>
          {r.ok ? <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-[color:var(--success)]" aria-hidden /> : <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />}
          <span>{r.text}</span>
        </p>
        {c.suggestion ? (
          <button type="button" className={secondaryBtn} onClick={() => set(k, c.suggestion!)}>
            {t('useSuggested')}
            <span className="inline-block h-5 w-5 rounded-full border border-[color:var(--control-border)]" style={{ backgroundColor: c.suggestion }} aria-hidden />
            <span className="font-mono text-[length:var(--text-footnote)] font-normal">{c.suggestion}</span>
          </button>
        ) : null}
      </div>
    );
  };

  return (
    <form onSubmit={submit} noValidate className="space-y-4 rounded-[var(--radius-card)] bg-[color:var(--surface)] p-4">
      <div className="grid gap-6 sm:grid-cols-2">
        {picker('brandPrimary', t('primary'), t('primaryHint'))}
        {picker('brandAccent', t('accent'), t('accentHint'))}
      </div>

      <div>
        <p className="mb-2 text-[length:var(--text-subhead)] font-medium">{t('preview')}</p>
        {/* Mirrors the public business header (app/[locale]/b/[slug]/page.tsx). */}
        <div
          className="rounded-[var(--radius-card)] p-6 text-white"
          style={{ background: `linear-gradient(135deg, ${primary}, color-mix(in srgb, ${primary} 78%, black))` }}
        >
          <p className="text-[length:var(--text-title2)] font-bold tracking-tight">{businessName}</p>
          <span className="mt-3 inline-flex min-h-11 items-center rounded-[var(--radius-button)] bg-white px-5 font-semibold" style={{ color: primary }}>
            {t('previewButton')}
          </span>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={busy} className={primaryBtn}>
          {busy ? t('saving') : t('save')}
        </button>
        <button type="button" className={secondaryBtn} onClick={() => setV({ brandPrimary: DEFAULT_BRAND_PRIMARY, brandAccent: DEFAULT_BRAND_ACCENT })}>
          {t('reset')}
        </button>
        <div role="status" aria-live="polite" className="text-[length:var(--text-subhead)]">{status}</div>
      </div>
      {error ? <p role="alert" className="text-[length:var(--text-subhead)] text-[color:var(--danger)]">{error}</p> : null}
    </form>
  );
}
