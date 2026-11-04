'use client';

/**
 * Services list + dialogs (task 6.4). The server renders nothing interactive; this owns the
 * form sheet, the delete confirmation, the "can't delete, hide instead" sheet and the
 * aria-live status line. Mutations go through the server actions, which revalidate the page.
 */
import { useState } from 'react';
import { ArrowDown, ArrowUp, Eye, EyeOff, Pencil, Plus, Trash2, TriangleAlert } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { deleteService, moveService, setServiceActive } from '@/app/actions/services';
import type { ServiceDto, ServiceWarning } from '@/lib/services';
import { formatPrice } from '@/lib/money';
import { ConfirmSheet } from '@/components/manage/confirm-sheet';
import { FormSheet } from '@/components/calendar/form-sheet';
import { primaryBtn, secondaryBtn } from '@/components/calendar/fields';
import { ServiceForm, type SavedInfo } from './service-form';

const rowBtn =
  'inline-flex min-h-11 min-w-11 items-center justify-center gap-1.5 rounded-[var(--radius-button)] border border-[color:var(--control-border)] px-3 text-[length:var(--text-subhead)] font-medium disabled:opacity-40 aria-disabled:cursor-not-allowed aria-disabled:opacity-40';

export function ServicesManager({
  services,
  staff,
  locale,
  listingLive,
}: {
  services: ServiceDto[];
  staff: Array<{ id: string; name: string }>;
  locale: string;
  /** Listing is PENDING or PUBLISHED: unbookable states matter. */
  listingLive: boolean;
}) {
  const t = useTranslations('services');
  const cat = useTranslations('categories');
  const [form, setForm] = useState<{ service: ServiceDto | null } | null>(null);
  const [deleting, setDeleting] = useState<ServiceDto | null>(null);
  const [blocked, setBlocked] = useState<{ service: ServiceDto; count: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');

  const visibleCount = services.filter((s) => s.active).length;
  const groups = new Map<string, ServiceDto[]>();
  for (const s of services) groups.set(s.category, [...(groups.get(s.category) ?? []), s]);

  const warn = (w: ServiceWarning[]) => (w.includes('NO_VISIBLE_SERVICE') ? ` ${t('warnings.noVisible')}` : '');
  const fail = (code: string) => setError(t(t.has(`error.${code}`) ? `error.${code}` : 'error.UNKNOWN'));

  function saved(info: SavedInfo) {
    setForm(null);
    setError('');
    setStatus(t(info.mode === 'created' ? 'status.created' : 'status.updated') + (info.noVisible ? ` ${t('warnings.noVisible')}` : ''));
  }

  async function toggle(s: ServiceDto, active: boolean) {
    setBusy(true);
    setError('');
    setStatus('');
    try {
      const res = await setServiceActive(s.id, active);
      if (res.ok) setStatus(t(active ? 'status.shown' : 'status.hidden', { name: s.name }) + warn(res.warnings));
      else if ('errors' in res && res.errors?.staffIds) setError(t('error.showNeedsStaff', { name: s.name }));
      else fail(res.code);
    } catch {
      fail('UNKNOWN');
    } finally {
      setBusy(false);
      setBlocked(null);
    }
  }

  async function move(s: ServiceDto, dir: 'up' | 'down') {
    setBusy(true);
    setError('');
    try {
      const res = await moveService(s.id, dir);
      if (res.ok) setStatus(t('status.moved', { name: s.name, direction: dir }));
      else fail(res.code);
    } catch {
      fail('UNKNOWN');
    } finally {
      setBusy(false);
    }
  }

  async function remove(s: ServiceDto) {
    setBusy(true);
    setError('');
    setStatus('');
    try {
      const res = await deleteService(s.id);
      if (res.ok) {
        setStatus(t(res.outcome === 'DELETED' ? 'status.deleted' : 'status.archived', { name: s.name }) + warn(res.warnings));
      } else if (res.code === 'HAS_FUTURE_BOOKINGS') {
        setBlocked({ service: s, count: 'futureCount' in res ? (res.futureCount ?? 0) : 0 });
      } else fail(res.code);
    } catch {
      fail('UNKNOWN');
    } finally {
      setBusy(false);
      setDeleting(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[color:var(--label-secondary)]">{t('summary', { count: services.length })}</p>
        <button type="button" className={primaryBtn} onClick={() => setForm({ service: null })}>
          <Plus className="h-5 w-5" aria-hidden />
          {t('add')}
        </button>
      </div>

      <p role="status" aria-live="polite" className="min-h-0 font-medium">
        {status}
      </p>
      {error ? (
        <p role="alert" className="rounded-[var(--radius-input)] border border-[color:var(--danger)] p-3 text-[color:var(--danger)]">
          {error}
        </p>
      ) : null}

      {listingLive && services.length > 0 && visibleCount === 0 ? (
        <p className="flex items-start gap-2 rounded-[var(--radius-card)] border border-[color:var(--control-border)] bg-[color:var(--surface)] p-4">
          <TriangleAlert className="mt-0.5 h-5 w-5 flex-none" aria-hidden />
          <span>{t('warnings.noVisible')}</span>
        </p>
      ) : null}

      {services.length === 0 ? (
        <div className="space-y-3 rounded-[var(--radius-card)] bg-[color:var(--surface)] p-5 shadow-sm">
          <h2 className="text-[length:var(--text-title3)] font-semibold">{t('empty.title')}</h2>
          <p className="text-[color:var(--label-secondary)]">{t('empty.body')}</p>
          <button type="button" className={primaryBtn} onClick={() => setForm({ service: null })}>
            <Plus className="h-5 w-5" aria-hidden />
            {t('empty.action')}
          </button>
        </div>
      ) : (
        [...groups.entries()].map(([category, list]) => (
          <section key={category} aria-labelledby={`svc-cat-${category}`}>
            <h2 id={`svc-cat-${category}`} className="text-[length:var(--text-headline)] font-semibold text-[color:var(--label-secondary)]">
              {cat(category)}
            </h2>
            <ul className="mt-2 divide-y divide-[color:var(--separator)] rounded-[var(--radius-card)] bg-[color:var(--surface)] shadow-sm">
              {list.map((s, i) => {
                const lastVisible = listingLive && s.active && visibleCount === 1;
                return (
                  <li key={s.id} className="space-y-3 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="break-words font-semibold">{s.name}</p>
                        <p className="text-[length:var(--text-subhead)] text-[color:var(--label-secondary)]">
                          {t('row.duration', { count: s.durationMin })}
                          {' · '}
                          {t('row.buffer', { count: s.bufferMin })}
                          {' · '}
                          {s.priceCents === 0 ? t('row.free') : formatPrice(s.priceCents, locale)}
                        </p>
                        <p className="text-[length:var(--text-subhead)] text-[color:var(--label-secondary)]">
                          {s.staffNames.length ? t('row.staff', { names: s.staffNames.join(', ') }) : t('row.noStaff')}
                        </p>
                      </div>
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-[color:var(--control-border)] px-2.5 py-1 text-[length:var(--text-footnote)] font-medium">
                        {s.active ? <Eye className="h-4 w-4" aria-hidden /> : <EyeOff className="h-4 w-4" aria-hidden />}
                        {s.active ? t('row.visible') : t('row.hidden')}
                      </span>
                    </div>

                    {s.active && s.staffNames.length === 0 ? (
                      <p className="flex items-start gap-2 text-[length:var(--text-subhead)]">
                        <TriangleAlert className="mt-0.5 h-4 w-4 flex-none" aria-hidden />
                        {t('warnings.noEligibleStaff')}
                      </p>
                    ) : null}
                    {lastVisible ? (
                      <p className="text-[length:var(--text-footnote)] text-[color:var(--label-secondary)]">{t('warnings.lastVisible')}</p>
                    ) : null}

                    <div className="flex flex-wrap gap-2">
                      <button type="button" className={rowBtn} aria-label={t('row.editNamed', { name: s.name })} onClick={() => setForm({ service: s })}>
                        <Pencil className="h-4 w-4" aria-hidden />
                        {t('row.edit')}
                      </button>
                      <button type="button" className={rowBtn} disabled={busy} aria-label={t(s.active ? 'row.hideNamed' : 'row.showNamed', { name: s.name })} onClick={() => toggle(s, !s.active)}>
                        {s.active ? <EyeOff className="h-4 w-4" aria-hidden /> : <Eye className="h-4 w-4" aria-hidden />}
                        {s.active ? t('row.hide') : t('row.show')}
                      </button>
                      <div className="flex gap-2">
                        <button type="button" className={rowBtn} aria-disabled={busy || i === 0 || undefined} aria-label={t('row.moveUpNamed', { name: s.name })} onClick={() => { if (!(busy || i === 0)) move(s, 'up'); }}>
                          <ArrowUp className="h-4 w-4" aria-hidden />
                          <span className="sr-only sm:not-sr-only">{t('row.moveUp')}</span>
                        </button>
                        <button type="button" className={rowBtn} aria-disabled={busy || i === list.length - 1 || undefined} aria-label={t('row.moveDownNamed', { name: s.name })} onClick={() => { if (!(busy || i === list.length - 1)) move(s, 'down'); }}>
                          <ArrowDown className="h-4 w-4" aria-hidden />
                          <span className="sr-only sm:not-sr-only">{t('row.moveDown')}</span>
                        </button>
                      </div>
                      <button type="button" className={`${rowBtn} !border-[color:var(--danger)] text-[color:var(--danger)]`} disabled={busy} aria-label={t('row.deleteNamed', { name: s.name })} onClick={() => setDeleting(s)}>
                        <Trash2 className="h-4 w-4" aria-hidden />
                        {t('row.delete')}
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        ))
      )}

      <FormSheet open={!!form} title={form?.service ? t('form.editTitle') : t('form.addTitle')} closeLabel={t('form.close')} onClose={() => setForm(null)}>
        {form ? (
          <ServiceForm
            key={form.service?.id ?? 'new'}
            service={form.service}
            staff={staff}
            warnLastVisible={listingLive && !!form.service?.active && visibleCount === 1}
            onDone={saved}
            onCancel={() => setForm(null)}
          />
        ) : null}
      </FormSheet>

      <ConfirmSheet
        open={!!deleting}
        title={t('deleteSheet.title', { name: deleting?.name ?? '' })}
        confirmLabel={t('deleteSheet.confirm')}
        keepLabel={t('deleteSheet.keep')}
        busy={busy}
        onConfirm={() => deleting && remove(deleting)}
        onClose={() => setDeleting(null)}
      >
        <p>{t('deleteSheet.body')}</p>
      </ConfirmSheet>

      <FormSheet open={!!blocked} title={t('blockedSheet.title', { name: blocked?.service.name ?? '' })} closeLabel={t('form.close')} onClose={() => setBlocked(null)}>
        {blocked ? (
          <div className="space-y-4">
            <p>{t('blockedSheet.body', { count: blocked.count })}</p>
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button type="button" className={secondaryBtn} onClick={() => setBlocked(null)}>
                {t('blockedSheet.close')}
              </button>
              {blocked.service.active ? (
                <button type="button" className={primaryBtn} disabled={busy} onClick={() => toggle(blocked.service, false)}>
                  {t('blockedSheet.hide')}
                </button>
              ) : null}
            </div>
          </div>
        ) : null}
      </FormSheet>
    </div>
  );
}
