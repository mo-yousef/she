'use client';

/**
 * Manual (walk-in / phone) booking form (task 6.2). Fields are controlled, so a failed
 * submit never clears what was typed. The server core is the source of truth; the shared
 * Zod schema gives inline validation after blur. A nonce per form mount makes a double
 * submit safe (the core returns the first booking instead of creating a second).
 */
import { useMemo, useRef, useState, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { createManualBooking } from '@/app/actions/calendar';
import { manualBookingInputSchema } from '@/lib/calendar-schema';
import { formatPrice, parseEuroToCents } from '@/lib/money';
import type { ServiceOption } from '@/lib/calendar-data';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { fieldAria, failureKey, type ActionFailure } from './fields';

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

export interface BookingDefaults {
  staffId: string;
  dateKey: string;
  time: string;
}

type FieldName =
  | 'serviceId'
  | 'staffId'
  | 'date'
  | 'time'
  | 'name'
  | 'phone'
  | 'email'
  | 'note'
  | 'price';
const ORDER: FieldName[] = [
  'serviceId',
  'staffId',
  'date',
  'time',
  'name',
  'phone',
  'email',
  'note',
  'price',
];

export function ManualBookingForm({
  locale,
  services,
  staff,
  defaults,
  slotIntervalMin,
  onDone,
  onCancel,
}: {
  locale: string;
  services: ServiceOption[];
  staff: Array<{ id: string; name: string }>;
  defaults: BookingDefaults;
  slotIntervalMin: number;
  onDone: (reference: string) => void;
  onCancel: () => void;
}) {
  const t = useTranslations('calendar');
  const nonce = useRef(
    globalThis.crypto?.randomUUID?.() ??
    `${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  const formRef = useRef<HTMLFormElement>(null);

  const [v, setV] = useState(() => {
    const firstService =
      services.find((s) => s.staffIds.includes(defaults.staffId)) ?? services[0];
    return {
      serviceId: firstService?.id ?? '',
      staffId: defaults.staffId,
      date: defaults.dateKey,
      time: defaults.time,
      name: '',
      phone: '',
      email: '',
      note: '',
      status: 'CONFIRMED' as 'CONFIRMED' | 'PENDING',
      price: '',
      send: true,
    };
  });
  const [touched, setTouched] = useState<Partial<Record<FieldName, boolean>>>({});
  const [submitted, setSubmitted] = useState(false);
  const [serverErrors, setServerErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const service = services.find((s) => s.id === v.serviceId);
  const staffOptions = useMemo(
    () => staff.filter((s) => !service || service.staffIds.includes(s.id)),
    [staff, service],
  );

  const set = <K extends keyof typeof v>(k: K, val: (typeof v)[K]) => {
    setV((p) => ({ ...p, [k]: val }));
    setServerErrors({});
  };
  const onServiceChange = (id: string) => {
    const next = services.find((s) => s.id === id);
    setV((p) => ({
      ...p,
      serviceId: id,
      staffId:
        next && !next.staffIds.includes(p.staffId)
          ? (next.staffIds.find((x) => staff.some((s) => s.id === x)) ?? p.staffId)
          : p.staffId,
    }));
    setServerErrors({});
  };

  /** Price field -> cents (undefined = use the service price), or an error code. */
  const price = (() => {
    const raw = v.price.trim();
    if (!raw) return { cents: undefined as number | undefined };
    if (/^0+(?:[.,]0{1,2})?$/.test(raw)) return { cents: 0 };
    const cents = parseEuroToCents(raw);
    return cents === null ? { error: 'priceInvalid' } : { cents };
  })();

  const payload = () => ({
    serviceId: v.serviceId,
    staffId: v.staffId,
    date: v.date,
    time: v.time,
    locale,
    name: v.name,
    phone: v.phone,
    email: v.email,
    note: v.note,
    status: v.status,
    priceCents: price.cents,
    sendConfirmation: v.send && v.email.trim().length > 0,
    idempotencyKey: nonce.current,
  });

  const validate = (): Record<string, string> => {
    const errs: Record<string, string> = {};
    const r = manualBookingInputSchema.safeParse(payload());
    if (!r.success) for (const i of r.error.issues) errs[String(i.path[0])] ??= i.message;
    if ('error' in price && price.error) errs.priceCents = price.error;
    if (errs.priceCents) errs.price = errs.priceCents;
    return errs;
  };
  const errors = { ...validate(), ...serverErrors };
  if (errors.priceCents) errors.price = errors.priceCents;
  const shown = (f: FieldName) =>
    touched[f] || submitted || serverErrors[f] ? errors[f] : undefined;
  const msg = (code?: string) =>
    code
      ? t.has(`validation.${code}`)
        ? t(`validation.${code}`)
        : t('validation.required')
      : undefined;
  const blur = (f: FieldName) => setTouched((p) => ({ ...p, [f]: true }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitted(true);
    setFormError(null);
    const errs = validate();
    const first = ORDER.find((f) => errs[f]);
    if (first) {
      formRef.current?.querySelector<HTMLElement>(`#mb-${first}`)?.focus();
      return;
    }
    setBusy(true);
    try {
      const res = await createManualBooking(payload());
      if (res.ok) {
        onDone(res.reference);
        return;
      }
      const f = res as ActionFailure;
      if (f.errors && Object.keys(f.errors).length) {
        setServerErrors(f.errors);
        const k = ORDER.find((x) => f.errors?.[x]);
        if (k) formRef.current?.querySelector<HTMLElement>(`#mb-${k}`)?.focus();
      } else {
        setFormError(t(`error.${failureKey(f).key}`));
      }
    } catch {
      setFormError(t('error.UNKNOWN'));
    } finally {
      setBusy(false);
    }
  }

  const hasEmail = v.email.trim().length > 0;

  return (
    <form ref={formRef} onSubmit={submit} noValidate className="space-y-4">
      {formError ? (
        <p role="alert" className="rounded-md border border-destructive p-3 text-destructive">
          {formError}
        </p>
      ) : null}
      <p className="text-xs text-muted-foreground">
        {t('bookingForm.outsideHoursHint')}
      </p>

      <Field
        id="mb-serviceId"
        label={t('bookingForm.service')}
        error={msg(shown('serviceId'))}
      >
        <select
          {...fieldAria('mb-serviceId', undefined, msg(shown('serviceId')))}
          className={selectClass}
          value={v.serviceId}
          onChange={(e) => onServiceChange(e.target.value)}
          onBlur={() => blur('serviceId')}
        >
          {services.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </Field>

      <Field id="mb-staffId" label={t('bookingForm.staff')} error={msg(shown('staffId'))}>
        <select
          {...fieldAria('mb-staffId', undefined, msg(shown('staffId')))}
          className={selectClass}
          value={v.staffId}
          onChange={(e) => set('staffId', e.target.value)}
          onBlur={() => blur('staffId')}
        >
          {staffOptions.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field id="mb-date" label={t('bookingForm.date')} error={msg(shown('date'))}>
          <Input
            {...fieldAria('mb-date', undefined, msg(shown('date')))}
            type="date"
            className="min-h-11"
            value={v.date}
            onChange={(e) => set('date', e.target.value)}
            onBlur={() => blur('date')}
          />
        </Field>
        <Field id="mb-time" label={t('bookingForm.time')} error={msg(shown('time'))}>
          <Input
            {...fieldAria('mb-time', undefined, msg(shown('time')))}
            type="time"
            step={slotIntervalMin * 60}
            className="min-h-11"
            value={v.time}
            onChange={(e) => set('time', e.target.value)}
            onBlur={() => blur('time')}
          />
        </Field>
      </div>

      <Field id="mb-name" label={t('bookingForm.name')} error={msg(shown('name'))}>
        <Input
          {...fieldAria('mb-name', undefined, msg(shown('name')))}
          type="text"
          autoComplete="off"
          maxLength={80}
          className="min-h-11"
          value={v.name}
          onChange={(e) => set('name', e.target.value)}
          onBlur={() => blur('name')}
        />
      </Field>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field id="mb-phone" label={t('bookingForm.phone')} error={msg(shown('phone'))}>
          <Input
            {...fieldAria('mb-phone', undefined, msg(shown('phone')))}
            type="tel"
            inputMode="tel"
            autoComplete="off"
            className="min-h-11"
            value={v.phone}
            onChange={(e) => set('phone', e.target.value)}
            onBlur={() => blur('phone')}
          />
        </Field>
        <Field id="mb-email" label={t('bookingForm.email')} error={msg(shown('email'))}>
          <Input
            {...fieldAria('mb-email', undefined, msg(shown('email')))}
            type="email"
            inputMode="email"
            autoComplete="off"
            className="min-h-11"
            value={v.email}
            onChange={(e) => set('email', e.target.value)}
            onBlur={() => blur('email')}
          />
        </Field>
      </div>

      <Field id="mb-note" label={t('bookingForm.note')} error={msg(shown('note'))}>
        <Textarea
          {...fieldAria('mb-note', undefined, msg(shown('note')))}
          rows={2}
          maxLength={500}
          value={v.note}
          onChange={(e) => set('note', e.target.value)}
          onBlur={() => blur('note')}
        />
      </Field>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field id="mb-status" label={t('bookingForm.status')}>
          <select
            id="mb-status"
            className={selectClass}
            value={v.status}
            onChange={(e) => set('status', e.target.value as 'CONFIRMED' | 'PENDING')}
          >
            <option value="CONFIRMED">{t('bookingForm.statusConfirmed')}</option>
            <option value="PENDING">{t('bookingForm.statusPending')}</option>
          </select>
        </Field>
        <Field
          id="mb-price"
          label={t('bookingForm.price')}
          hint={
            service
              ? t('bookingForm.priceHint', {
                price: formatPrice(service.priceCents, locale),
              })
              : undefined
          }
          error={msg(shown('price'))}
        >
          <Input
            {...fieldAria('mb-price', service ? 'hint' : undefined, msg(shown('price')))}
            type="text"
            inputMode="decimal"
            autoComplete="off"
            className="min-h-11"
            value={v.price}
            onChange={(e) => set('price', e.target.value)}
            onBlur={() => blur('price')}
          />
        </Field>
      </div>

      <div>
        <label className="flex min-h-11 items-center gap-3">
          <input
            type="checkbox"
            className="h-5 w-5"
            checked={v.send && hasEmail}
            disabled={!hasEmail}
            onChange={(e) => set('send', e.target.checked)}
          />
          <span>{t('bookingForm.sendConfirmation')}</span>
        </label>
        {!hasEmail ? (
          <p className="text-xs text-muted-foreground">
            {t('bookingForm.needsEmail')}
          </p>
        ) : null}
      </div>

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="outline" size="lg" onClick={onCancel} disabled={busy}>
          {t('bookingForm.cancel')}
        </Button>
        <Button type="submit" size="lg" disabled={busy}>
          {busy ? t('bookingForm.saving') : t('bookingForm.submit')}
        </Button>
      </div>
    </form>
  );
}
