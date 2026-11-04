'use client';
import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, Star } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { requestReviewCode, submitReview, verifyReviewCode } from '@/app/actions/review';
import { FocusHeading } from '@/components/focus-heading';

const BODY_MAX = 2000;
const field =
  'mt-1 block min-h-11 w-full rounded-[var(--radius-input)] border border-[color:var(--control-border)] bg-[color:var(--surface)] px-3 text-[length:var(--text-body)] text-[color:var(--label)]';
const primaryBtn =
  'inline-flex min-h-11 w-full items-center justify-center rounded-[var(--radius-button)] bg-[color:var(--b1)] px-5 text-[length:var(--text-headline)] font-semibold text-[color:var(--b1-contrast)] disabled:cursor-not-allowed disabled:opacity-50';
const secondaryBtn =
  'inline-flex min-h-11 w-full items-center justify-center rounded-[var(--radius-button)] border border-[color:var(--control-border)] px-5 text-[length:var(--text-headline)] font-semibold disabled:cursor-not-allowed disabled:opacity-50';

type ErrorKey = string; // a key under `review.error.*`
type Err = { key: ErrorKey; values?: Record<string, number> };

/**
 * Review form (task 5.5): step 1 phone OTP (skipped when the signed-in customer already
 * verified this number), step 2 rating + comment. The server re-checks everything; this
 * component only drives the flow. Typed text is never cleared on error.
 */
export function ReviewForm({
  slug,
  reference,
  token,
  businessName,
  maskedPhone,
  needsOtp,
}: {
  slug: string;
  reference: string;
  token: string;
  businessName: string;
  maskedPhone: string;
  needsOtp: boolean;
}) {
  const t = useTranslations('review');
  const [receipt, setReceipt] = useState<string | null>(null);
  const [codeSent, setCodeSent] = useState(false);
  const [code, setCode] = useState('');
  const [cooldown, setCooldown] = useState(0);
  const [rating, setRating] = useState(0);
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState<'send' | 'verify' | 'submit' | null>(null);
  const [codeError, setCodeError] = useState<Err | null>(null);
  const [formError, setFormError] = useState<Err | null>(null);
  const [ratingError, setRatingError] = useState(false);
  const [done, setDone] = useState(false);

  const codeRef = useRef<HTMLInputElement>(null);
  const stepTwoRef = useRef<HTMLHeadingElement>(null);
  const phoneOk = !needsOtp || receipt !== null;
  const identity = { businessSlug: slug, reference, token };

  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(id);
  }, [cooldown]);

  const msg = (e: Err) => t(`error.${e.key}`, e.values ?? {});

  async function sendCode() {
    setBusy('send');
    setCodeError(null);
    try {
      const res = await requestReviewCode(identity);
      if (res.ok) {
        setCodeSent(true);
        setCooldown(60);
        setTimeout(() => codeRef.current?.focus(), 0);
      } else if (res.code === 'ALREADY_VERIFIED') {
        window.location.reload(); // server now skips the OTP step
      } else {
        if (res.code === 'COOLDOWN' && res.retryAfterSec) setCooldown(res.retryAfterSec);
        setCodeError({ key: res.code, values: { seconds: res.retryAfterSec ?? 60 } });
      }
    } catch {
      setCodeError({ key: 'UNKNOWN' });
    } finally {
      setBusy(null);
    }
  }

  async function verifyCode(e: React.FormEvent) {
    e.preventDefault();
    if (!/^\d{6}$/.test(code.trim())) {
      setCodeError({ key: 'codeFormat' });
      codeRef.current?.focus();
      return;
    }
    setBusy('verify');
    setCodeError(null);
    try {
      const res = await verifyReviewCode({ ...identity, code: code.trim() });
      if (res.ok) {
        setReceipt(res.receipt);
        setTimeout(() => stepTwoRef.current?.focus(), 0);
      } else {
        setCodeError({ key: res.code, values: { left: res.attemptsLeft ?? 0 } });
        codeRef.current?.focus();
      }
    } catch {
      setCodeError({ key: 'UNKNOWN' });
    } finally {
      setBusy(null);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (rating < 1) {
      setRatingError(true);
      return;
    }
    if (body.trim().length > BODY_MAX) {
      setFormError({ key: 'bodyTooLong', values: { max: BODY_MAX } });
      return;
    }
    setBusy('submit');
    setFormError(null);
    setRatingError(false);
    try {
      const res = await submitReview({ ...identity, receipt: receipt ?? undefined, rating, body });
      if (res.ok) setDone(true);
      else setFormError({ key: res.code });
    } catch {
      setFormError({ key: 'UNKNOWN' });
    } finally {
      setBusy(null);
    }
  }

  if (done) {
    return (
      <div role="status" className="flex flex-col items-center text-center">
        <CheckCircle2 className="h-12 w-12 text-[color:var(--b1-text)]" aria-hidden />
        <FocusHeading className="mt-3 text-[length:var(--text-title1)] font-bold">{t('thanksHeading')}</FocusHeading>
        <p className="mt-2 text-[color:var(--label-secondary)]">{t('thanksBody', { business: businessName })}</p>
        <Link
          href={`/b/${slug}`}
          className="mt-6 inline-flex min-h-11 items-center text-[length:var(--text-footnote)] font-medium text-[color:var(--b1-text)] underline underline-offset-2"
        >
          {t('backToBusiness', { name: businessName })}
        </Link>
      </div>
    );
  }

  const card = 'rounded-[var(--radius-card)] bg-[color:var(--surface)] p-5 shadow-sm';
  const errText = 'mt-2 text-[length:var(--text-footnote)] font-medium text-[color:var(--danger)]';

  return (
    <div className="flex flex-col gap-6">
      {needsOtp ? (
        <section aria-labelledby="rv-otp-h" className={card}>
          <h2 id="rv-otp-h" className="text-[length:var(--text-headline)] font-semibold">
            {t('otpHeading')}
          </h2>
          {receipt ? (
            <p role="status" className="mt-2 flex items-center gap-2 font-medium text-[color:var(--success)]">
              <CheckCircle2 className="h-5 w-5" aria-hidden />
              {t('verified')}
            </p>
          ) : (
            <>
              <p className="mt-1 text-[length:var(--text-subhead)] text-[color:var(--label-secondary)]">
                {t('otpIntro', { phone: maskedPhone })}
              </p>
              {codeSent ? (
                <form onSubmit={verifyCode} noValidate className="mt-4">
                  <p role="status" className="text-[length:var(--text-footnote)] text-[color:var(--label-secondary)]">
                    {t('codeSent', { phone: maskedPhone })}
                  </p>
                  <label htmlFor="rv-code" className="mt-3 block text-[length:var(--text-subhead)] font-medium">
                    {t('codeLabel')}
                  </label>
                  <input
                    ref={codeRef}
                    id="rv-code"
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    pattern="[0-9]*"
                    maxLength={6}
                    value={code}
                    aria-invalid={!!codeError}
                    aria-describedby={codeError ? 'rv-code-err' : undefined}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                    className={`${field} tracking-[0.4em] tabular-nums`}
                  />
                  {codeError ? (
                    <p id="rv-code-err" role="alert" className={errText}>
                      {msg(codeError)}
                    </p>
                  ) : null}
                  <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                    <button type="submit" disabled={busy !== null} className={primaryBtn}>
                      {busy === 'verify' ? t('verifying') : t('verifyCode')}
                    </button>
                    <button
                      type="button"
                      onClick={sendCode}
                      disabled={busy !== null || cooldown > 0}
                      className={secondaryBtn}
                    >
                      {cooldown > 0 ? t('resendIn', { seconds: cooldown }) : t('resendCode')}
                    </button>
                  </div>
                </form>
              ) : (
                <div className="mt-4">
                  <button type="button" onClick={sendCode} disabled={busy !== null || cooldown > 0} className={primaryBtn}>
                    {busy === 'send' ? t('sending') : cooldown > 0 ? t('resendIn', { seconds: cooldown }) : t('sendCode')}
                  </button>
                  {codeError ? (
                    <p role="alert" className={errText}>
                      {msg(codeError)}
                    </p>
                  ) : null}
                </div>
              )}
            </>
          )}
        </section>
      ) : null}

      {phoneOk ? (
        <form onSubmit={submit} noValidate className={card} aria-labelledby="rv-step-h">
          <h2
            id="rv-step-h"
            ref={stepTwoRef}
            tabIndex={-1}
            className="text-[length:var(--text-headline)] font-semibold outline-none"
          >
            {t('heading')}
          </h2>

          <fieldset className="mt-4" aria-describedby={ratingError ? 'rv-rating-err' : undefined}>
            <legend className="text-[length:var(--text-subhead)] font-medium">{t('ratingLegend')}</legend>
            <div className="mt-2 flex flex-wrap gap-1">
              {[1, 2, 3, 4, 5].map((n) => (
                <label
                  key={n}
                  className={`relative inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center gap-1 rounded-[var(--radius-button)] border px-2 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[color:var(--b1-text)] ${
                    rating === n ? 'border-[color:var(--b1-text)] font-semibold' : 'border-[color:var(--separator)]'
                  }`}
                >
                  <input
                    type="radio"
                    name="rating"
                    value={n}
                    checked={rating === n}
                    onChange={() => {
                      setRating(n);
                      setRatingError(false);
                    }}
                    aria-label={t('ratingOption', { count: n })}
                    className="sr-only"
                  />
                  <Star
                    className={`h-5 w-5 text-[color:var(--b1-text)] ${n <= rating ? 'fill-current' : ''}`}
                    aria-hidden
                  />
                  <span aria-hidden className="tabular-nums">
                    {n}
                  </span>
                </label>
              ))}
            </div>
            {ratingError ? (
              <p id="rv-rating-err" role="alert" className={errText}>
                {t('error.ratingRequired')}
              </p>
            ) : null}
          </fieldset>

          <div className="mt-5">
            <label htmlFor="rv-body" className="block text-[length:var(--text-subhead)] font-medium">
              {t('commentLabel')}
            </label>
            <textarea
              id="rv-body"
              rows={5}
              autoComplete="off"
              value={body}
              aria-describedby="rv-body-hint rv-body-count"
              aria-invalid={body.length > BODY_MAX}
              onChange={(e) => setBody(e.target.value)}
              className={field}
            />
            <div className="mt-1 flex justify-between gap-3 text-[length:var(--text-footnote)] text-[color:var(--label-secondary)]">
              <span id="rv-body-hint">{t('commentHint')}</span>
              <span id="rv-body-count" className="tabular-nums">
                {t('charCount', { count: body.length, max: BODY_MAX })}
              </span>
            </div>
          </div>

          {formError ? (
            <p role="alert" className={errText}>
              {msg(formError)}
            </p>
          ) : null}

          <button type="submit" disabled={busy !== null} className={`${primaryBtn} mt-5`}>
            {busy === 'submit' ? t('submitting') : t('submit')}
          </button>
        </form>
      ) : null}
    </div>
  );
}
