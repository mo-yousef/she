'use client';

/**
 * Dashboard calendar grid (task 6.2). Custom CSS grid, no calendar library. The server
 * lays everything out (lib/calendar-layout.ts, wall-clock minutes in Europe/Nicosia); this
 * component only draws it and owns the dialogs: event details (+ status actions and block
 * removal), "Add booking" and "Block time". One grid row = 15 minutes = `--cal-row`.
 * No drag-and-drop (shortcut in docs/shortcuts.md).
 */
import { useState, type CSSProperties } from 'react';
import { Ban, Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { changeBookingStatus, deleteBlock } from '@/app/actions/calendar';
import type { BookingStatusName } from '@/lib/booking-status';
import { minuteAtFraction, ROW_MIN, type Axis } from '@/lib/calendar-layout';
import type { ColumnDto, EventDto, ServiceOption } from '@/lib/calendar-data';
import { ConfirmSheet } from '@/components/manage/confirm-sheet';
import { BlockForm } from './block-form';
import { BookingDetails, STATUS_STYLE } from './booking-details';
import {
  dangerBtn,
  failureKey,
  primaryBtn,
  secondaryBtn,
  type ActionFailure,
} from './fields';
import { FormSheet } from './form-sheet';
import { ManualBookingForm } from './manual-booking-form';

export interface ColumnView extends ColumnDto {
  heading: string;
  sub?: string;
}

const hhmm = (min: number) =>
  `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
const rows = (min: number) => min / ROW_MIN;
const HATCH_BLOCK =
  'repeating-linear-gradient(45deg, var(--separator) 0 3px, transparent 3px 9px)';
const HATCH_CLOSED =
  'repeating-linear-gradient(135deg, var(--separator) 0 1px, transparent 1px 8px)';

export function CalendarGrid({
  locale,
  label,
  todayKey,
  dateKey,
  axis,
  columns,
  staff,
  services,
  slotIntervalMin,
  activeStaffId,
}: {
  locale: string;
  label: string;
  todayKey: string;
  dateKey: string;
  axis: Axis;
  columns: ColumnView[];
  staff: Array<{ id: string; name: string }>;
  services: ServiceOption[];
  slotIntervalMin: number;
  activeStaffId: string | null;
}) {
  const t = useTranslations('calendar');
  const router = useRouter();
  const [selected, setSelected] = useState<EventDto | null>(null);
  const [bookingForm, setBookingForm] = useState<{
    n: number;
    staffId: string;
    dateKey: string;
    time: string;
  } | null>(null);
  const [blockForm, setBlockForm] = useState<{
    n: number;
    staffId: string;
    dateKey: string;
    start: string;
    end: string;
  } | null>(null);
  const [sheet, setSheet] = useState<'cancel' | 'remove' | null>(null);
  const [busy, setBusy] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [announce, setAnnounce] = useState('');
  const [counter, setCounter] = useState(0);

  const totalRows = rows(axis.endMin - axis.startMin);
  const hours: number[] = [];
  for (let m = Math.ceil(axis.startMin / 60) * 60; m < axis.endMin; m += 60)
    hours.push(m);

  const canBook = staff.length > 0 && services.length > 0;
  const defaultStaff = activeStaffId ?? staff[0]?.id ?? '';

  function openBooking(p: { staffId?: string; dateKey?: string; minute?: number }) {
    setCounter((c) => c + 1);
    setBookingForm({
      n: counter + 1,
      staffId: p.staffId ?? defaultStaff,
      dateKey: p.dateKey ?? dateKey,
      time: hhmm(p.minute ?? Math.max(axis.startMin, 9 * 60)),
    });
  }
  function openBlock() {
    setCounter((c) => c + 1);
    const start = Math.max(axis.startMin, 9 * 60);
    setBlockForm({
      n: counter + 1,
      staffId: defaultStaff || 'all',
      dateKey,
      start: hhmm(start),
      end: hhmm(Math.min(1439, start + 60)),
    });
  }

  function closeDetails() {
    setSelected(null);
    setSheet(null);
    setDetailError(null);
  }

  async function run(fn: () => Promise<{ ok: boolean }>, success: string) {
    setBusy(true);
    setDetailError(null);
    try {
      const res = await fn();
      if (res.ok) {
        setSheet(null);
        closeDetails();
        setAnnounce(success);
        router.refresh();
        return;
      }
      setSheet(null);
      const { key } = failureKey(res as unknown as ActionFailure);
      setDetailError(t.has(`error.${key}`) ? t(`error.${key}`) : t('error.UNKNOWN'));
    } catch {
      setSheet(null);
      setDetailError(t('error.UNKNOWN'));
    } finally {
      setBusy(false);
    }
  }

  if (staff.length === 0) {
    return (
      <p className="rounded-[var(--radius-card)] bg-[color:var(--surface)] p-5 shadow-sm">
        {t('grid.emptyNoStaff')}
      </p>
    );
  }

  const gridCols = `3.25rem repeat(${columns.length}, minmax(${columns.length > 1 ? '10rem' : '14rem'}, 1fr))`;

  return (
    <div className="space-y-3" style={{ '--cal-row': '1.25rem' } as CSSProperties}>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={!canBook}
          onClick={() => openBooking({})}
          className={primaryBtn}
        >
          <Plus className="h-5 w-5" aria-hidden />
          {t('actions.addBooking')}
        </button>
        <button type="button" onClick={openBlock} className={secondaryBtn}>
          <Ban className="h-5 w-5" aria-hidden />
          {t('actions.blockTime')}
        </button>
      </div>
      {!canBook ? (
        <p className="text-[color:var(--label-secondary)]">{t('grid.emptyNoServices')}</p>
      ) : null}
      <p
        role="status"
        aria-live="polite"
        className={announce ? 'font-medium text-[color:var(--success)]' : 'sr-only'}
      >
        {announce}
      </p>
      {detailError && !selected ? (
        <p
          role="alert"
          className="rounded-[var(--radius-input)] border border-[color:var(--danger)] p-3 text-[color:var(--danger)]"
        >
          {detailError}
        </p>
      ) : null}

      <div
        role="region"
        aria-label={label}
        tabIndex={0}
        className="overflow-x-auto rounded-[var(--radius-card)] bg-[color:var(--surface)] shadow-sm"
      >
        <div className="grid min-w-max" style={{ gridTemplateColumns: gridCols }}>
          {/* Header row */}
          <div className="border-b border-[color:var(--separator)] p-2 text-[length:var(--text-caption)] text-[color:var(--label-secondary)]">
            <span className="sr-only">{t('grid.timeColumn')}</span>
          </div>
          {columns.map((c) => (
            <div
              key={`h-${c.key}`}
              aria-current={
                c.dateKey === todayKey && columns.length > 1 ? 'date' : undefined
              }
              className={`border-b border-l border-[color:var(--separator)] p-2 text-center ${
                c.dateKey === todayKey && columns.length > 1
                  ? 'font-bold text-[color:var(--tint)]'
                  : 'font-semibold'
              }`}
            >
              <div className="truncate">{c.heading}</div>
              {c.sub ? (
                <div className="truncate text-[length:var(--text-caption)] font-normal text-[color:var(--label-secondary)]">
                  {c.sub}
                </div>
              ) : null}
            </div>
          ))}

          {/* Time axis */}
          <div
            className="relative"
            style={{ height: `calc(var(--cal-row) * ${totalRows})` }}
            aria-hidden
          >
            {hours.map((m) => (
              <span
                key={m}
                className="absolute right-1 -translate-y-1/2 text-[length:var(--text-caption)] text-[color:var(--label-secondary)]"
                style={{ top: `calc(var(--cal-row) * ${rows(m - axis.startMin)})` }}
              >
                {hhmm(m)}
              </span>
            ))}
          </div>

          {/* Columns */}
          {columns.map((c) => (
            <div
              key={c.key}
              role="group"
              aria-label={c.sub ? `${c.heading}, ${c.sub}` : c.heading}
              className="relative cursor-cell border-l border-[color:var(--separator)]"
              style={{
                height: `calc(var(--cal-row) * ${totalRows})`,
                backgroundImage:
                  'repeating-linear-gradient(to bottom, var(--separator) 0 1px, transparent 1px calc(var(--cal-row) * 4))',
              }}
              onClick={(e) => {
                if (!canBook) return;
                const rect = e.currentTarget.getBoundingClientRect();
                const minute = minuteAtFraction(
                  (e.clientY - rect.top) / rect.height,
                  axis,
                  slotIntervalMin,
                );
                openBooking({ staffId: c.staffId, dateKey: c.dateKey, minute });
              }}
            >
              {c.closed.map((s, i) => (
                <div
                  key={i}
                  aria-hidden
                  className="pointer-events-none absolute inset-x-0"
                  style={{
                    top: `calc(var(--cal-row) * ${rows(s.startMin - axis.startMin)})`,
                    height: `calc(var(--cal-row) * ${rows(s.endMin - s.startMin)})`,
                    backgroundImage: HATCH_CLOSED,
                    backgroundColor: 'var(--bg)',
                    opacity: 0.9,
                  }}
                />
              ))}
              {c.events.map((ev) => (
                <EventButton
                  key={`${ev.kind}-${ev.id}`}
                  ev={ev}
                  axis={axis}
                  onSelect={() => setSelected(ev)}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
      <p className="text-[length:var(--text-footnote)] text-[color:var(--label-secondary)]">
        {t('grid.tapToAdd')}
      </p>

      {/* Event details */}
      <FormSheet
        open={selected !== null}
        title={
          selected?.kind === 'block' ? t('details.blockTitle') : t('details.bookingTitle')
        }
        closeLabel={t('details.close')}
        onClose={closeDetails}
      >
        {selected ? (
          <Details
            ev={selected}
            locale={locale}
            busy={busy}
            error={detailError}
            onStatus={(to) =>
              run(() => changeBookingStatus(selected.id, to), t('result.statusChanged'))
            }
            onAskCancel={() => setSheet('cancel')}
            onAskRemove={() => setSheet('remove')}
          />
        ) : null}
      </FormSheet>

      <ConfirmSheet
        open={sheet === 'cancel'}
        title={t('cancelSheet.title')}
        confirmLabel={busy ? t('details.working') : t('cancelSheet.confirm')}
        keepLabel={t('cancelSheet.keep')}
        busy={busy}
        onConfirm={() =>
          selected &&
          run(
            () => changeBookingStatus(selected.id, 'CANCELLED_BY_BUSINESS'),
            t('result.bookingCancelled'),
          )
        }
        onClose={() => setSheet(null)}
      >
        <p>{t('cancelSheet.body')}</p>
      </ConfirmSheet>
      <ConfirmSheet
        open={sheet === 'remove'}
        title={t('removeSheet.title')}
        confirmLabel={busy ? t('details.working') : t('removeSheet.confirm')}
        keepLabel={t('removeSheet.keep')}
        busy={busy}
        onConfirm={() =>
          selected && run(() => deleteBlock(selected.id), t('result.blockRemoved'))
        }
        onClose={() => setSheet(null)}
      >
        <p>{t('removeSheet.body')}</p>
      </ConfirmSheet>

      {/* Add booking */}
      <FormSheet
        open={bookingForm !== null}
        title={t('bookingForm.title')}
        closeLabel={t('details.close')}
        onClose={() => setBookingForm(null)}
      >
        {bookingForm ? (
          <ManualBookingForm
            key={bookingForm.n}
            locale={locale}
            services={services}
            staff={staff}
            slotIntervalMin={slotIntervalMin}
            defaults={bookingForm}
            onCancel={() => setBookingForm(null)}
            onDone={(reference) => {
              setBookingForm(null);
              setAnnounce(t('result.bookingAdded', { reference }));
              router.refresh();
            }}
          />
        ) : null}
      </FormSheet>

      {/* Block time */}
      <FormSheet
        open={blockForm !== null}
        title={t('blockForm.title')}
        closeLabel={t('details.close')}
        onClose={() => setBlockForm(null)}
      >
        {blockForm ? (
          <BlockForm
            key={blockForm.n}
            staff={staff}
            slotIntervalMin={slotIntervalMin}
            defaults={blockForm}
            onCancel={() => setBlockForm(null)}
            onDone={(count) => {
              setBlockForm(null);
              setAnnounce(t('result.blocksAdded', { count }));
              router.refresh();
            }}
          />
        ) : null}
      </FormSheet>
    </div>
  );
}

function EventButton({
  ev,
  axis,
  onSelect,
}: {
  ev: EventDto;
  axis: Axis;
  onSelect: () => void;
}) {
  const t = useTranslations('calendar');
  const top = rows(ev.startMin - axis.startMin);
  const height = rows(ev.endMin - ev.startMin);
  const isBlock = ev.kind === 'block';
  const st = isBlock ? null : (STATUS_STYLE[ev.status ?? ''] ?? STATUS_STYLE.CONFIRMED!);
  const Icon = isBlock ? Ban : st!.icon;
  const statusText = isBlock
    ? t('grid.blocked')
    : t(`status.${ev.status}` as 'status.CONFIRMED');
  const name = isBlock ? ev.title || t('grid.blockedNoReason') : (ev.guestName ?? '');
  const aria = isBlock
    ? `${ev.timeLabel}, ${statusText}${ev.title ? `, ${ev.title}` : ''}`
    : `${ev.timeLabel}, ${name}, ${ev.title}, ${statusText}`;

  return (
    <button
      type="button"
      aria-label={aria}
      onClick={(e) => {
        e.stopPropagation();
        onSelect();
      }}
      className={`absolute overflow-hidden rounded-[8px] px-1.5 py-0.5 text-left text-[length:var(--text-caption)] leading-tight focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--tint)] ${
        isBlock
          ? 'border-2 border-solid border-[color:var(--control-border)] bg-[color:var(--surface)] text-[color:var(--label)]'
          : st!.cls
      }`}
      style={{
        top: `calc(var(--cal-row) * ${top})`,
        height: `max(calc(var(--cal-row) * ${height} - 2px), 1.75rem)`,
        left: `calc(${(ev.lane / ev.lanes) * 100}% + 2px)`,
        width: `calc(${100 / ev.lanes}% - 4px)`,
        ...(isBlock ? { backgroundImage: HATCH_BLOCK } : null),
      }}
    >
      <span className="flex items-center gap-1 font-semibold">
        <Icon className="h-3.5 w-3.5 flex-none" aria-hidden />
        <span className="truncate">{ev.timeLabel}</span>
      </span>
      <span className="block truncate">{name}</span>
      {height >= 3 ? (
        <span className="block truncate opacity-90">
          {isBlock ? statusText : `${ev.title} · ${statusText}`}
        </span>
      ) : null}
    </button>
  );
}

function Details({
  ev,
  locale,
  busy,
  error,
  onStatus,
  onAskCancel,
  onAskRemove,
}: {
  ev: EventDto;
  locale: string;
  busy: boolean;
  error: string | null;
  onStatus: (to: BookingStatusName) => void;
  onAskCancel: () => void;
  onAskRemove: () => void;
}) {
  const t = useTranslations('calendar');
  if (ev.kind !== 'block')
    return (
      <BookingDetails
        booking={{ ...ev, staffName: ev.staffName }}
        locale={locale}
        busy={busy}
        error={error}
        onStatus={onStatus}
        onAskCancel={onAskCancel}
      />
    );

  const row = (label: string, value: React.ReactNode) =>
    value ? (
      <div className="grid grid-cols-[7rem_1fr] gap-2 py-1.5">
        <dt className="text-[color:var(--label-secondary)]">{label}</dt>
        <dd className="min-w-0 break-words">{value}</dd>
      </div>
    ) : null;

  return (
    <div className="space-y-4">
      {error ? (
        <p
          role="alert"
          className="rounded-[var(--radius-input)] border border-[color:var(--danger)] p-3 text-[color:var(--danger)]"
        >
          {error}
        </p>
      ) : null}
      <dl className="divide-y divide-[color:var(--separator)]">
        {row(t('details.time'), ev.timeLabel)}
        {row(t('details.staff'), ev.staffName)}
        {row(t('details.reason'), ev.title || t('details.noReason'))}
      </dl>
      <div className="flex flex-col gap-2">
        <button type="button" disabled={busy} onClick={onAskRemove} className={dangerBtn}>
          {t('details.removeBlock')}
        </button>
      </div>
    </div>
  );
}
