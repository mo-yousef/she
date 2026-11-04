'use client';

import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { Check, ChevronLeft } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Link, usePathname, useRouter } from '@/i18n/navigation';
import { createBooking } from '@/app/actions/booking';
import {
  validateDetails,
  validateDetailsField,
  DEFAULT_COUNTRY_CODE,
  LOCALES,
  type CreateBookingResult,
  type DetailsDraft,
  type DetailsErrors,
  type DetailsField,
} from '@/lib/booking-schema';
import { buildBookingQuery, type BookingUrlState } from '@/lib/booking-params';
import {
  applicableSteps,
  clampStep,
  nextStep,
  prevStep,
  stepProgress,
  type Step,
} from '@/lib/booking-steps';
import { formatDate, formatTime } from '@/lib/format-datetime';
import { formatPrice } from '@/lib/money';
import { DateStrip, type StripDay } from './date-strip';
import { SlotGrid, type SlotItem } from './slot-grid';
import { TurnstileWidget } from './turnstile-widget';

export interface BookingStepperProps {
  locale: string;
  slug: string;
  businessName: string;
  services: {
    id: string;
    name: string;
    description: string | null;
    durationMin: number;
    priceCents: number;
  }[];
  staff: { id: string; name: string; role: string }[];
  /** serviceId -> ids of active staff who perform it */
  staffByService: Record<string, string[]>;
  /** Sanitised server view of the URL. */
  state: BookingUrlState & { step: Step };
  stripDays: StripDay[];
  slots: SlotItem[];
  /** Furthest the strip can be extended to (<= 60). */
  maxDays: number;
  prefill: { name: string; email: string; phone: string } | null;
  /** True when nobody is signed in: guests must pass Turnstile (req 9). */
  isGuest: boolean;
  /** Null when Turnstile is not configured (dev only; the server enforces in production). */
  turnstileSiteKey: string | null;
}

const field =
  'mt-1 block min-h-11 w-full rounded-[var(--radius-input)] border border-[color:var(--control-border)] bg-[color:var(--surface)] px-3 text-[length:var(--text-body)] text-[color:var(--label)]';
const primaryBtn =
  'inline-flex min-h-11 w-full items-center justify-center rounded-[var(--radius-button)] bg-[color:var(--b1)] px-5 text-[length:var(--text-headline)] font-semibold text-[color:var(--b1-contrast)] disabled:cursor-not-allowed disabled:opacity-50';
const optionBtn =
  'flex min-h-11 w-full items-center justify-between gap-4 rounded-[var(--radius-card)] border-2 bg-[color:var(--surface)] p-4 text-start';

/**
 * Booking stepper (requirement 3.1): Service -> Team -> Date/Time -> Details ->
 * Review, with Confirm as the action on Review. The URL owns service / staff /
 * date / slot / step: step changes use router.push (browser-back works),
 * in-step selections use router.replace. Details (PII) are never put in the URL.
 */
export function BookingStepper(props: BookingStepperProps) {
  const { state, services, staff, staffByService, locale, slug } = props;
  const t = useTranslations('booking');
  const tb = useTranslations('business');
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();

  const initialPhone = props.prefill?.phone || `${DEFAULT_COUNTRY_CODE} `;
  const [details, setDetails] = useState<DetailsDraft>({
    name: props.prefill?.name ?? '',
    email: props.prefill?.email ?? '',
    phone: initialPhone,
    note: '',
    consentTerms: false,
    consentMessages: false,
  });
  const [errors, setErrors] = useState<DetailsErrors>({});
  const [submitting, setSubmitting] = useState(false);
  type ErrorCode = Extract<CreateBookingResult, { ok: false }>['code'];
  const [confirmError, setConfirmError] = useState<ErrorCode | null>(null);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [turnstileReset, setTurnstileReset] = useState(0);
  const needsTurnstile = props.isGuest && !!props.turnstileSiteKey;
  const idempotencyKey = useRef<string>('');
  if (!idempotencyKey.current && typeof crypto !== 'undefined') {
    idempotencyKey.current = crypto.randomUUID();
  }

  const eligibleIds = state.serviceId
    ? (staffByService[state.serviceId] ?? [])
    : undefined;
  const steps = applicableSteps(eligibleIds?.length);
  const detailsOk = useMemo(() => validateDetails(details).ok, [details]);
  const step = clampStep(state.step, state, steps, detailsOk);
  const { index, total } = stepProgress(steps, step);

  // Typed details live in state only, so a refresh on Details/Review lands back
  // on the furthest valid step; make the URL say so.
  useEffect(() => {
    if (step !== state.step) go({ step }, 'replace');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, state.step]);

  // Focus the step heading and announce the change (not on first render).
  const headingRef = useRef<HTMLHeadingElement>(null);
  const shown = useRef(step);
  const [announcement, setAnnouncement] = useState('');
  const stepTitle = t(`step.${step}`);
  useEffect(() => {
    if (shown.current === step) return;
    shown.current = step;
    headingRef.current?.focus();
    setAnnouncement(t('stepAnnounce', { current: index, total, name: stepTitle }));
  }, [step, index, total, stepTitle, t]);

  function go(patch: Partial<BookingUrlState>, mode: 'push' | 'replace') {
    const qs = buildBookingQuery({ ...state, ...patch });
    const href = qs ? `${pathname}?${qs}` : pathname;
    if (mode === 'push') router.push(href, { locale });
    else startTransition(() => router.replace(href, { locale, scroll: false }));
  }

  const service = services.find((s) => s.id === state.serviceId);
  const staffMember = staff.find((s) => s.id === state.staffId);
  const back = prevStep(steps, step);

  function pickService(id: string) {
    if (id === state.serviceId) {
      go({ step: nextStep(steps, 'service') }, 'push');
      return;
    }
    const ids = staffByService[id] ?? [];
    // Exactly one person offers it: default to them and skip the Team step.
    const next = nextStep(applicableSteps(ids.length), 'service');
    go(
      {
        serviceId: id,
        staffId: ids.length === 1 ? ids[0] : undefined,
        date: undefined,
        slot: undefined,
        step: next,
      },
      'push',
    );
  }

  function blur(f: DetailsField) {
    const code = validateDetailsField(f, details);
    setErrors((e) => ({ ...e, [f]: code }));
  }
  function change<K extends keyof DetailsDraft>(f: K, value: DetailsDraft[K]) {
    setDetails((d) => ({ ...d, [f]: value }));
    // Clear an error as soon as the value becomes valid; never wipe typed text.
    if (errors[f] && !validateDetailsField(f, { ...details, [f]: value })) {
      setErrors((e) => ({ ...e, [f]: undefined }));
    }
  }
  function submitDetails() {
    const r = validateDetails(details);
    if (r.ok) {
      setErrors({});
      go({ step: 'review' }, 'push');
      return;
    }
    setErrors(r.errors);
    const first = (
      ['name', 'phone', 'email', 'note', 'consentTerms', 'consentMessages'] as const
    ).find((f) => r.errors[f]);
    if (first) document.getElementById(`bk-${first}`)?.focus();
  }

  async function confirm() {
    const r = validateDetails(details);
    if (!r.ok || !state.serviceId || !state.staffId || !state.slot) return;
    setSubmitting(true);
    setConfirmError(null);
    try {
      // 4.3 plug-in point: createBooking is a stub until task 4.3 lands.
      const res = await createBooking({
        businessSlug: slug,
        serviceId: state.serviceId,
        staffId: state.staffId,
        startsAt: state.slot,
        locale: (LOCALES as readonly string[]).includes(locale) ? locale : 'en',
        idempotencyKey: idempotencyKey.current,
        details,
        turnstileToken: turnstileToken ?? undefined,
      });
      if (res.ok) {
        // shortcut: confirmation screen is task 4.4; follow redirectTo when 4.3 supplies it.
        if (res.redirectTo) router.push(res.redirectTo, { locale });
      } else {
        setConfirmError(res.code);
        setTurnstileReset((n) => n + 1); // tokens are single use
        if (res.code === 'SLOT_TAKEN') {
          // The slot is gone: back to Date/Time with the stale slot cleared and
          // fresh availability (router.refresh re-runs the server read).
          go({ step: 'datetime', slot: undefined }, 'push');
          router.refresh();
        }
      }
    } catch {
      setConfirmError('UNKNOWN');
      setTurnstileReset((n) => n + 1);
    } finally {
      setSubmitting(false);
    }
  }

  const whenIso = state.slot;
  const staffLabel =
    state.staffId === 'any' ? t('staffAnyShort') : (staffMember?.name ?? '');

  return (
    <div>
      <div className="flex items-center gap-2">
        {back ? (
          <button
            type="button"
            onClick={() => go({ step: back }, 'push')}
            className="inline-flex min-h-11 items-center gap-1 rounded-[var(--radius-button)] pe-3 text-[length:var(--text-body)] font-medium text-[color:var(--b1-text)]"
          >
            <ChevronLeft className="h-5 w-5 rtl:rotate-180" aria-hidden />
            {t('back')}
          </button>
        ) : (
          <Link
            href={`/b/${slug}`}
            locale={locale}
            className="inline-flex min-h-11 items-center gap-1 rounded-[var(--radius-button)] pe-3 text-[length:var(--text-body)] font-medium text-[color:var(--b1-text)]"
          >
            <ChevronLeft className="h-5 w-5 rtl:rotate-180" aria-hidden />
            {props.businessName}
          </Link>
        )}
      </div>

      <div className="mt-2">
        <div
          role="progressbar"
          aria-label={t('progressLabel')}
          aria-valuemin={1}
          aria-valuemax={total}
          aria-valuenow={index}
          aria-valuetext={t('stepAnnounce', { current: index, total, name: stepTitle })}
          className="h-1.5 overflow-hidden rounded-full bg-[color:var(--separator)]"
        >
          <div
            className="h-full rounded-full bg-[color:var(--b1)] transition-[width] duration-300 motion-reduce:transition-none"
            style={{ width: `${(index / total) * 100}%` }}
          />
        </div>
        <p className="mt-2 text-[length:var(--text-footnote)] text-[color:var(--label-secondary)]">
          {t('stepOf', { current: index, total })}
        </p>
      </div>

      <p role="status" aria-live="polite" className="sr-only">
        {announcement}
      </p>

      <h1
        ref={headingRef}
        tabIndex={-1}
        className="mt-3 text-[length:var(--text-title1)] font-bold tracking-tight focus:outline-none"
      >
        {stepTitle}
      </h1>
      <p className="mt-1 text-[length:var(--text-subhead)] text-[color:var(--label-secondary)]">
        {props.businessName}
        {step !== 'service' && service ? ` · ${service.name}` : ''}
        {step === 'datetime' && staffLabel ? ` · ${staffLabel}` : ''}
      </p>

      <div className="mt-6">
        {step === 'service' ? (
          services.length === 0 ? (
            <p
              role="status"
              className="rounded-[var(--radius-card)] bg-[color:var(--surface)] p-6 text-center"
            >
              {t('noServices')}
            </p>
          ) : (
            <ul className="space-y-2">
              {services.map((s) => (
                <li key={s.id}>
                  <button
                    type="button"
                    aria-pressed={s.id === state.serviceId}
                    onClick={() => pickService(s.id)}
                    className={`${optionBtn} ${s.id === state.serviceId ? 'border-[color:var(--b1-text)]' : 'border-[color:var(--separator)]'}`}
                  >
                    <span className="min-w-0">
                      <span className="block font-medium">{s.name}</span>
                      {s.description ? (
                        <span className="block text-[length:var(--text-subhead)] text-[color:var(--label-secondary)]">
                          {s.description}
                        </span>
                      ) : null}
                      <span className="block text-[length:var(--text-footnote)] text-[color:var(--label-secondary)]">
                        {tb('durationMin', { count: s.durationMin })}
                      </span>
                    </span>
                    <span className="flex shrink-0 items-center gap-2 font-semibold">
                      {formatPrice(s.priceCents, locale)}
                      {s.id === state.serviceId ? <Selected /> : null}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )
        ) : null}

        {step === 'team' ? (
          (eligibleIds ?? []).length === 0 ? (
            <p
              role="status"
              className="rounded-[var(--radius-card)] bg-[color:var(--surface)] p-6 text-center"
            >
              {t('noStaff')}
            </p>
          ) : (
            <ul className="space-y-2">
              <li>
                <button
                  type="button"
                  aria-pressed={state.staffId === 'any'}
                  onClick={() =>
                    go({ staffId: 'any', slot: undefined, step: 'datetime' }, 'push')
                  }
                  className={`${optionBtn} ${state.staffId === 'any' ? 'border-[color:var(--b1-text)]' : 'border-[color:var(--separator)]'}`}
                >
                  <span>
                    <span className="block font-medium">{t('staffAny')}</span>
                    <span className="block text-[length:var(--text-subhead)] text-[color:var(--label-secondary)]">
                      {t('staffAnyHint')}
                    </span>
                  </span>
                  {state.staffId === 'any' ? <Selected /> : null}
                </button>
              </li>
              {staff
                .filter((m) => eligibleIds?.includes(m.id))
                .map((m) => (
                  <li key={m.id}>
                    <button
                      type="button"
                      aria-pressed={state.staffId === m.id}
                      onClick={() =>
                        go({ staffId: m.id, slot: undefined, step: 'datetime' }, 'push')
                      }
                      className={`${optionBtn} ${state.staffId === m.id ? 'border-[color:var(--b1-text)]' : 'border-[color:var(--separator)]'}`}
                    >
                      <span>
                        <span className="block font-medium">{m.name}</span>
                        <span className="block text-[length:var(--text-footnote)] text-[color:var(--label-secondary)]">
                          {m.role}
                        </span>
                      </span>
                      {state.staffId === m.id ? <Selected /> : null}
                    </button>
                  </li>
                ))}
            </ul>
          )
        ) : null}

        {step === 'datetime' ? (
          <div aria-busy={pending}>
            {confirmError === 'SLOT_TAKEN' ? (
              <p
                role="alert"
                className="mb-4 text-[length:var(--text-subhead)] text-[color:var(--danger)]"
              >
                {t('confirmError.SLOT_TAKEN')}
              </p>
            ) : null}
            {props.stripDays.length === 0 ? (
              <p
                role="status"
                className="rounded-[var(--radius-card)] bg-[color:var(--surface)] p-6 text-center"
              >
                {t('noTimesAtAll')}
              </p>
            ) : (
              <>
                <DateStrip
                  days={props.stripDays}
                  value={state.date ?? null}
                  onChange={(date) => go({ date, slot: undefined }, 'replace')}
                />
                {state.days < props.maxDays ? (
                  <button
                    type="button"
                    onClick={() => go({ days: props.maxDays }, 'replace')}
                    className="mt-1 inline-flex min-h-11 items-center text-[length:var(--text-subhead)] font-medium text-[color:var(--b1-text)] underline underline-offset-2"
                  >
                    {t('moreDates')}
                  </button>
                ) : null}
                <div className="mt-4">
                  <SlotGrid
                    slots={props.slots}
                    value={state.slot ?? null}
                    onChange={(slot) => {
                      setConfirmError(null);
                      go({ slot, date: state.date }, 'replace');
                    }}
                  />
                </div>
                <p className="mt-3 text-[length:var(--text-footnote)] text-[color:var(--label-secondary)]">
                  {t('timezoneNote')}
                </p>
              </>
            )}
            <button
              type="button"
              disabled={!state.slot}
              onClick={() => go({ step: 'details' }, 'push')}
              className={`${primaryBtn} mt-6`}
            >
              {t('continue')}
            </button>
          </div>
        ) : null}

        {step === 'details' ? (
          <form
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              submitDetails();
            }}
            className="space-y-4"
          >
            {props.prefill ? (
              <p className="text-[length:var(--text-footnote)] text-[color:var(--label-secondary)]">
                {t('prefilled')}
              </p>
            ) : null}
            <TextField
              id="bk-name"
              label={t('fullName')}
              value={details.name}
              error={errors.name}
              onChange={(v) => change('name', v)}
              onBlur={() => blur('name')}
              inputProps={{
                type: 'text',
                autoComplete: 'name',
                inputMode: 'text',
                maxLength: 80,
                required: true,
              }}
            />
            <TextField
              id="bk-phone"
              label={t('mobile')}
              hint={t('mobileHint')}
              value={details.phone}
              error={errors.phone}
              onChange={(v) => change('phone', v)}
              onBlur={() => blur('phone')}
              inputProps={{
                type: 'tel',
                autoComplete: 'tel',
                inputMode: 'tel',
                maxLength: 24,
                required: true,
              }}
            />
            <TextField
              id="bk-email"
              label={t('email')}
              value={details.email}
              error={errors.email}
              onChange={(v) => change('email', v)}
              onBlur={() => blur('email')}
              inputProps={{
                type: 'email',
                autoComplete: 'email',
                inputMode: 'email',
                maxLength: 254,
                required: true,
              }}
            />
            <div>
              <label
                htmlFor="bk-note"
                className="block text-[length:var(--text-subhead)] font-medium"
              >
                {t('note')}
              </label>
              <textarea
                id="bk-note"
                rows={3}
                maxLength={500}
                autoComplete="off"
                value={details.note}
                aria-invalid={!!errors.note}
                aria-describedby={errors.note ? 'bk-note-err' : undefined}
                onChange={(e) => change('note', e.target.value)}
                onBlur={() => blur('note')}
                className={`${field} py-2`}
              />
              <FieldError id="bk-note-err" code={errors.note} />
            </div>
            <Consent
              id="bk-consentTerms"
              label={t('consentTerms')}
              checked={details.consentTerms}
              error={errors.consentTerms}
              onChange={(v) => change('consentTerms', v)}
            />
            <Consent
              id="bk-consentMessages"
              label={t('consentMessages')}
              checked={details.consentMessages}
              error={errors.consentMessages}
              onChange={(v) => change('consentMessages', v)}
            />
            <button type="submit" className={primaryBtn}>
              {t('continue')}
            </button>
          </form>
        ) : null}

        {step === 'review' && service && whenIso ? (
          <div>
            <dl className="divide-y divide-[color:var(--separator)] rounded-[var(--radius-card)] bg-[color:var(--surface)] px-4 shadow-sm">
              <Row
                label={t('summaryService')}
                value={`${service.name} · ${tb('durationMin', { count: service.durationMin })}`}
              />
              <Row label={t('summaryStaff')} value={staffLabel} />
              <Row
                label={t('summaryWhen')}
                value={`${formatDate(whenIso, locale)}, ${formatTime(whenIso, locale)}`}
              />
              <Row
                label={t('summaryPrice')}
                value={formatPrice(service.priceCents, locale)}
                strong
              />
              <Row label={t('fullName')} value={details.name.trim()} />
              <Row label={t('mobile')} value={details.phone.trim()} />
              <Row label={t('email')} value={details.email.trim()} />
              {details.note.trim() ? (
                <Row label={t('note')} value={details.note.trim()} />
              ) : null}
            </dl>
            <p className="mt-3 text-[length:var(--text-footnote)] text-[color:var(--label-secondary)]">
              {t('timezoneNote')}
            </p>
            {confirmError ? (
              <p
                role="alert"
                className="mt-4 text-[length:var(--text-subhead)] text-[color:var(--danger)]"
              >
                {t(`confirmError.${confirmError}`)}
              </p>
            ) : null}
            {needsTurnstile && props.turnstileSiteKey ? (
              <TurnstileWidget
                siteKey={props.turnstileSiteKey}
                locale={locale}
                resetKey={turnstileReset}
                onToken={setTurnstileToken}
              />
            ) : null}
            <button
              type="button"
              disabled={submitting || (needsTurnstile && !turnstileToken)}
              onClick={confirm}
              className={`${primaryBtn} mt-6`}
            >
              {submitting ? t('confirming') : t('confirmBooking')}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

/** Selected marker for option cards: an icon, so selection is not conveyed by border colour alone. */
function Selected() {
  return (
    <Check className="h-5 w-5 text-[color:var(--b1-text)]" aria-hidden strokeWidth={3} />
  );
}

function FieldError({ id, code }: { id: string; code?: string }) {
  const t = useTranslations('booking.validation');
  if (!code) return null;
  return (
    <p
      id={id}
      className="mt-1 text-[length:var(--text-footnote)] text-[color:var(--danger)]"
    >
      {t(code)}
    </p>
  );
}

function TextField({
  id,
  label,
  hint,
  value,
  error,
  onChange,
  onBlur,
  inputProps,
}: {
  id: string;
  label: string;
  hint?: string;
  value: string;
  error?: string;
  onChange: (v: string) => void;
  onBlur: () => void;
  inputProps: React.InputHTMLAttributes<HTMLInputElement>;
}) {
  const describedBy = [hint ? `${id}-hint` : '', error ? `${id}-err` : '']
    .filter(Boolean)
    .join(' ');
  return (
    <div>
      <label htmlFor={id} className="block text-[length:var(--text-subhead)] font-medium">
        {label}
      </label>
      {hint ? (
        <p
          id={`${id}-hint`}
          className="text-[length:var(--text-footnote)] text-[color:var(--label-secondary)]"
        >
          {hint}
        </p>
      ) : null}
      <input
        id={id}
        {...inputProps}
        value={value}
        aria-invalid={!!error}
        aria-describedby={describedBy || undefined}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        className={field}
      />
      <FieldError id={`${id}-err`} code={error} />
    </div>
  );
}

function Consent({
  id,
  label,
  checked,
  error,
  onChange,
}: {
  id: string;
  label: string;
  checked: boolean;
  error?: string;
  onChange: (v: boolean) => void;
}) {
  return (
    <div>
      <label htmlFor={id} className="flex min-h-11 items-start gap-3 py-2">
        <input
          id={id}
          type="checkbox"
          checked={checked}
          aria-invalid={!!error}
          aria-describedby={error ? `${id}-err` : undefined}
          onChange={(e) => onChange(e.target.checked)}
          className="mt-0.5 h-6 w-6 shrink-0 accent-[color:var(--b1)]"
        />
        <span className="text-[length:var(--text-subhead)]">{label}</span>
      </label>
      <FieldError id={`${id}-err`} code={error} />
    </div>
  );
}

function Row({
  label,
  value,
  strong,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-3">
      <dt className="text-[length:var(--text-subhead)] text-[color:var(--label-secondary)]">
        {label}
      </dt>
      <dd className={`text-end ${strong ? 'font-semibold' : ''}`}>{value}</dd>
    </div>
  );
}
