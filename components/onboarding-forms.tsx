'use client';

/**
 * Client forms for the onboarding wizard (task 6.1). Fields are CONTROLLED so a failed
 * submit (or React 19's post-action form reset) never clears what the user typed. Validation
 * is server-side (the source of truth); on blur we only flag empty required fields.
 * After a failed submit, focus moves to the first invalid field.
 */
import { useActionState, useEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { initialStepState, type StepState } from '@/lib/onboarding-schema';

type Action = (prev: StepState, fd: FormData) => Promise<StepState>;

export interface FieldDef {
  name: string;
  kind: 'text' | 'textarea' | 'select' | 'checkboxes' | 'number';
  label: string;
  hint?: string;
  required?: boolean;
  type?: 'text' | 'tel' | 'url' | 'email';
  inputMode?: 'text' | 'tel' | 'url' | 'numeric' | 'decimal';
  autoComplete?: string;
  maxLength?: number;
  min?: number;
  max?: number;
  step?: number;
  options?: { value: string; label: string }[];
  value: string | string[];
}

const inputClass =
  'min-h-11 w-full rounded-[var(--radius-input)] border border-[color:var(--control-border)] bg-[color:var(--surface)] px-3 py-2 text-[length:var(--text-body)] text-[color:var(--label)] aria-[invalid=true]:border-[color:var(--danger)]';
export const primaryButton =
  'inline-flex min-h-11 items-center justify-center rounded-[var(--radius-button)] bg-[color:var(--tint)] px-6 font-semibold text-[color:var(--tint-contrast)] disabled:opacity-60';

function useCodeMessage() {
  const t = useTranslations('onboarding');
  return {
    field: (code: string) => (t.has(`validation.${code}`) ? t(`validation.${code}`) : t('validation.invalid')),
    form: (code: string) => (t.has(`error.${code}`) ? t(`error.${code}`) : t('error.UNKNOWN')),
  };
}

function FormError({ state }: { state: StepState }) {
  const m = useCodeMessage();
  // Field-level problems are shown beside their fields; this banner covers everything else.
  if (!state.code || (state.code === 'VALIDATION' && Object.keys(state.errors).length > 0)) return null;
  return (
    <p role="alert" className="rounded-[var(--radius-input)] border border-[color:var(--danger)] p-3 text-[color:var(--danger)]">
      {m.form(state.code)}
    </p>
  );
}

function SubmitButton({ pending, label }: { pending: boolean; label: string }) {
  const t = useTranslations('onboarding');
  return (
    <button type="submit" disabled={pending} className={primaryButton}>
      {pending ? t('saving') : label}
    </button>
  );
}

/** Focus the first errored control after a failed submit. */
function useFocusFirstError(formRef: React.RefObject<HTMLFormElement | null>, state: StepState) {
  useEffect(() => {
    const first = Object.keys(state.errors)[0];
    if (!first || !formRef.current) return;
    const el = formRef.current.querySelector<HTMLElement>(`[data-field="${CSS.escape(first)}"]`);
    el?.focus();
  }, [state, formRef]);
}

export function StepForm({
  action,
  locale,
  fields,
  submitLabel,
}: {
  action: Action;
  locale: string;
  fields: FieldDef[];
  submitLabel: string;
}) {
  const m = useCodeMessage();
  const t = useTranslations('onboarding');
  const [state, formAction, pending] = useActionState(action, initialStepState);
  const [vals, setVals] = useState<Record<string, string | string[]>>(() =>
    Object.fromEntries(fields.map((f) => [f.name, f.value])),
  );
  const [blurErrors, setBlurErrors] = useState<Record<string, string>>({});
  const formRef = useRef<HTMLFormElement>(null);
  useFocusFirstError(formRef, state);

  const set = (name: string, v: string | string[]) => {
    setVals((p) => ({ ...p, [name]: v }));
    setBlurErrors((p) => (p[name] ? { ...p, [name]: '' } : p));
  };
  const onBlur = (f: FieldDef) => {
    const v = vals[f.name];
    const empty = Array.isArray(v) ? v.length === 0 : !String(v).trim();
    setBlurErrors((p) => ({ ...p, [f.name]: f.required && empty ? 'required' : '' }));
  };

  return (
    <form ref={formRef} action={formAction} noValidate className="space-y-5">
      <input type="hidden" name="locale" value={locale} />
      <FormError state={state} />
      {fields.map((f) => {
        const id = `f-${f.name}`;
        const code = state.errors[f.name] || blurErrors[f.name] || '';
        const hintId = f.hint ? `${id}-hint` : undefined;
        const errId = code ? `${id}-err` : undefined;
        const describedBy = [hintId, errId].filter(Boolean).join(' ') || undefined;
        const v = vals[f.name] ?? '';
        const common = {
          id,
          name: f.name,
          'data-field': f.name,
          'aria-invalid': code ? true : undefined,
          'aria-describedby': describedBy,
          'aria-required': f.required ? true : undefined,
          onBlur: () => onBlur(f),
        } as const;

        let control: ReactNode;
        if (f.kind === 'textarea') {
          control = (
            <textarea {...common} rows={4} maxLength={f.maxLength} value={String(v)} onChange={(e) => set(f.name, e.target.value)} className={inputClass} />
          );
        } else if (f.kind === 'select') {
          control = (
            <select {...common} value={String(v)} onChange={(e) => set(f.name, e.target.value)} className={inputClass}>
              {!f.options?.some((o) => o.value === '') ? <option value="">{t('choose')}</option> : null}
              {f.options?.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          );
        } else if (f.kind === 'checkboxes') {
          const selected = Array.isArray(v) ? v : [];
          control = (
            <div className="flex flex-wrap gap-2">
              {f.options?.map((o, i) => (
                <label key={o.value} className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-[var(--radius-button)] border border-[color:var(--control-border)] bg-[color:var(--surface)] px-4">
                  <input
                    type="checkbox"
                    name={f.name}
                    value={o.value}
                    data-field={i === 0 ? f.name : undefined}
                    checked={selected.includes(o.value)}
                    aria-describedby={describedBy}
                    onChange={(e) => set(f.name, e.target.checked ? [...selected, o.value] : selected.filter((x) => x !== o.value))}
                    onBlur={() => onBlur(f)}
                    className="h-5 w-5"
                  />
                  {o.label}
                </label>
              ))}
            </div>
          );
        } else {
          control = (
            <input
              {...common}
              type={f.kind === 'number' ? 'number' : (f.type ?? 'text')}
              inputMode={f.inputMode}
              autoComplete={f.autoComplete ?? 'off'}
              maxLength={f.maxLength}
              min={f.min}
              max={f.max}
              step={f.step}
              value={String(v)}
              onChange={(e) => set(f.name, e.target.value)}
              className={inputClass}
            />
          );
        }

        const Wrapper = f.kind === 'checkboxes' ? 'fieldset' : 'div';
        const Label = f.kind === 'checkboxes' ? 'legend' : 'label';
        return (
          <Wrapper key={f.name} className="space-y-1.5">
            <Label {...(f.kind === 'checkboxes' ? {} : { htmlFor: id })} className="block text-[length:var(--text-subhead)] font-medium">
              {f.label}
              {f.required ? <span aria-hidden> *</span> : null}
            </Label>
            {f.hint ? (
              <p id={hintId} className="text-[length:var(--text-footnote)] text-[color:var(--label-secondary)]">
                {f.hint}
              </p>
            ) : null}
            {control}
            {code ? (
              <p id={errId} className="text-[length:var(--text-footnote)] text-[color:var(--danger)]">
                {m.field(code)}
              </p>
            ) : null}
          </Wrapper>
        );
      })}
      <SubmitButton pending={pending} label={submitLabel} />
    </form>
  );
}

export interface HoursRow {
  weekday: number;
  label: string;
  closed: boolean;
  open: string;
  close: string;
}

/** Seven day rows with a copy-the-first-day-to-all shortcut (the full editor is task 6.6). */
export function HoursForm({ action, locale, rows, submitLabel }: { action: Action; locale: string; rows: HoursRow[]; submitLabel: string }) {
  const t = useTranslations('onboarding');
  const m = useCodeMessage();
  const [state, formAction, pending] = useActionState(action, initialStepState);
  const [days, setDays] = useState(rows);
  const formRef = useRef<HTMLFormElement>(null);
  useFocusFirstError(formRef, state);

  const patch = (weekday: number, p: Partial<HoursRow>) => setDays((d) => d.map((r) => (r.weekday === weekday ? { ...r, ...p } : r)));
  const copyFirst = () => setDays((d) => d.map((r) => ({ ...r, closed: d[0]!.closed, open: d[0]!.open, close: d[0]!.close })));

  return (
    <form ref={formRef} action={formAction} noValidate className="space-y-5">
      <input type="hidden" name="locale" value={locale} />
      <FormError state={state} />
      {state.errors.form ? (
        <p role="alert" className="text-[color:var(--danger)]">
          {m.field(state.errors.form)}
        </p>
      ) : null}
      <ul className="divide-y divide-[color:var(--separator)] rounded-[var(--radius-card)] bg-[color:var(--surface)]">
        {days.map((r) => {
          const code = state.errors[`day-${r.weekday}`];
          const errId = code ? `day-${r.weekday}-err` : undefined;
          return (
            <li key={r.weekday} className="flex flex-wrap items-center gap-x-4 gap-y-2 p-3">
              <span className="w-28 font-medium">{r.label}</span>
              <label className="inline-flex min-h-11 items-center gap-2">
                <input
                  type="checkbox"
                  name={`closed-${r.weekday}`}
                  checked={r.closed}
                  onChange={(e) => patch(r.weekday, { closed: e.target.checked })}
                  className="h-5 w-5"
                />
                {t('hours.closed')}
              </label>
              <label className="inline-flex items-center gap-2">
                <span className="text-[color:var(--label-secondary)]">{t('hours.opens')}</span>
                <input
                  type="time"
                  name={`open-${r.weekday}`}
                  data-field={`day-${r.weekday}`}
                  step={900}
                  value={r.open}
                  disabled={r.closed}
                  aria-invalid={code ? true : undefined}
                  aria-describedby={errId}
                  onChange={(e) => patch(r.weekday, { open: e.target.value })}
                  className={`${inputClass} w-auto`}
                />
              </label>
              <label className="inline-flex items-center gap-2">
                <span className="text-[color:var(--label-secondary)]">{t('hours.closes')}</span>
                <input
                  type="time"
                  name={`close-${r.weekday}`}
                  step={900}
                  value={r.close}
                  disabled={r.closed}
                  aria-invalid={code ? true : undefined}
                  aria-describedby={errId}
                  onChange={(e) => patch(r.weekday, { close: e.target.value })}
                  className={`${inputClass} w-auto`}
                />
              </label>
              {code ? (
                <p id={errId} className="basis-full text-[length:var(--text-footnote)] text-[color:var(--danger)]">
                  {m.field(code)}
                </p>
              ) : null}
            </li>
          );
        })}
      </ul>
      <p className="text-[length:var(--text-footnote)] text-[color:var(--label-secondary)]">{t('hours.timezoneNote')}</p>
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={copyFirst}
          className="inline-flex min-h-11 items-center rounded-[var(--radius-button)] border border-[color:var(--control-border)] bg-[color:var(--surface)] px-5 font-semibold"
        >
          {t('hours.copyToAll', { day: days[0]?.label ?? '' })}
        </button>
        <SubmitButton pending={pending} label={submitLabel} />
      </div>
    </form>
  );
}

/** "Submit for review". The server re-validates the checklist; `disabled` is only a hint. */
export function SubmitForReviewForm({
  action,
  locale,
  disabled,
}: {
  action: Action;
  locale: string;
  disabled: boolean;
}) {
  const t = useTranslations('onboarding');
  const [state, formAction, pending] = useActionState(action, initialStepState);
  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="locale" value={locale} />
      <FormError state={state} />
      <button type="submit" disabled={disabled || pending} className={primaryButton}>
        {pending ? t('submitting') : t('submit')}
      </button>
      {disabled ? <p className="text-[length:var(--text-footnote)] text-[color:var(--label-secondary)]">{t('submitDisabledHint')}</p> : null}
    </form>
  );
}

/** Moves focus to the step heading when a step mounts (like the booking stepper). */
export function StepHeading({ children, id }: { children: ReactNode; id: string }) {
  const ref = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    ref.current?.focus();
  }, []);
  return (
    <h1 id={id} ref={ref} tabIndex={-1} className="text-[length:var(--text-title2)] font-bold tracking-tight outline-none">
      {children}
    </h1>
  );
}
