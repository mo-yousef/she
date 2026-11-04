'use client';
/**
 * Team list + dialogs (task 6.5). Mirrors components/services/services-manager.tsx: the
 * server renders nothing interactive; this owns the form sheet, the delete confirmation and
 * the "can't delete, deactivate instead" sheet. Mutations go through the server actions,
 * which revalidate the page.
 */
import { useState } from 'react';
import { ArrowDown, ArrowUp, Pencil, Plus, Trash2, TriangleAlert, UserCheck, UserX } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { deleteStaff, moveStaff, setStaffActive } from '@/app/actions/team';
import type { TeamMemberDto, TeamWarning } from '@/lib/team';
import type { DayHours } from '@/lib/hours';
import { ConfirmSheet } from '@/components/manage/confirm-sheet';
import { FormSheet } from '@/components/calendar/form-sheet';
import { primaryBtn, secondaryBtn } from '@/components/calendar/fields';
import { StaffForm, type SavedInfo } from './staff-form';

const rowBtn =
  'inline-flex min-h-11 min-w-11 items-center justify-center gap-1.5 rounded-[var(--radius-button)] border border-[color:var(--control-border)] px-3 text-[length:var(--text-subhead)] font-medium disabled:opacity-40 aria-disabled:cursor-not-allowed aria-disabled:opacity-40';

export function TeamManager({
  members,
  services,
  businessHours,
  todayKey,
  listingLive,
}: {
  members: TeamMemberDto[];
  services: Array<{ id: string; name: string; active: boolean }>;
  businessHours: DayHours[];
  todayKey: string;
  /** Listing is PENDING or PUBLISHED: unbookable states matter. */
  listingLive: boolean;
}) {
  const t = useTranslations('team');
  // Keep only the id: the sheet re-reads the member from props, so days off added or removed
  // inside it (which revalidate the page) show up without closing the sheet.
  const [form, setForm] = useState<{ id: string | null } | null>(null);
  const formMember = form?.id ? (members.find((m) => m.id === form.id) ?? null) : null;
  const [deleting, setDeleting] = useState<TeamMemberDto | null>(null);
  const [blocked, setBlocked] = useState<{ member: TeamMemberDto; count: number; kind: 'delete' | 'deactivate' } | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const activeCount = members.filter((m) => m.active).length;

  const warn = (w: TeamWarning[]) =>
    w.includes('NO_ACTIVE_STAFF') ? ` ${t('warnings.noActiveStaff')}` : w.includes('SERVICE_WITHOUT_STAFF') ? ` ${t('warnings.serviceWithoutStaff')}` : '';
  const fail = (code: string) => setError(t(t.has(`error.${code}`) ? `error.${code}` : 'error.UNKNOWN'));

  function saved(info: SavedInfo) {
    setForm(null);
    setError('');
    setStatus(t(info.mode === 'created' ? 'status.created' : 'status.updated') + warn(info.warnings));
  }

  async function toggle(m: TeamMemberDto, active: boolean) {
    setBusy(true);
    setError('');
    setStatus('');
    try {
      const res = await setStaffActive(m.id, active);
      if (res.ok) setStatus(t(active ? 'status.activated' : 'status.deactivated', { name: m.name }) + warn(res.warnings));
      else if (res.code === 'HAS_FUTURE_BOOKINGS') setBlocked({ member: m, count: res.futureCount ?? 0, kind: 'deactivate' });
      else fail(res.code);
    } catch {
      fail('UNKNOWN');
    } finally {
      setBusy(false);
    }
  }

  async function move(m: TeamMemberDto, dir: 'up' | 'down') {
    setBusy(true);
    setError('');
    try {
      const res = await moveStaff(m.id, dir);
      if (res.ok) setStatus(t('status.moved', { name: m.name, direction: dir }));
      else fail(res.code);
    } catch {
      fail('UNKNOWN');
    } finally {
      setBusy(false);
    }
  }

  async function remove(m: TeamMemberDto) {
    setBusy(true);
    setError('');
    setStatus('');
    try {
      const res = await deleteStaff(m.id);
      if (res.ok) setStatus(t(res.outcome === 'DELETED' ? 'status.deleted' : 'status.archived', { name: m.name }) + warn(res.warnings));
      else if (res.code === 'HAS_FUTURE_BOOKINGS') setBlocked({ member: m, count: res.futureCount ?? 0, kind: 'delete' });
      else fail(res.code);
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
        <p className="text-[color:var(--label-secondary)]">{t('summary', { count: members.length })}</p>
        <button type="button" className={primaryBtn} onClick={() => setForm({ id: null })}>
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
      {listingLive && members.length > 0 && activeCount === 0 ? (
        <p className="flex items-start gap-2 rounded-[var(--radius-card)] border border-[color:var(--control-border)] bg-[color:var(--surface)] p-4">
          <TriangleAlert className="mt-0.5 h-5 w-5 flex-none" aria-hidden />
          <span>{t('warnings.noActiveStaff')}</span>
        </p>
      ) : null}
      {members.length === 0 ? (
        <div className="space-y-3 rounded-[var(--radius-card)] bg-[color:var(--surface)] p-5 shadow-sm">
          <h2 className="text-[length:var(--text-title3)] font-semibold">{t('empty.title')}</h2>
          <p className="text-[color:var(--label-secondary)]">{t('empty.body')}</p>
          <button type="button" className={primaryBtn} onClick={() => setForm({ id: null })}>
            <Plus className="h-5 w-5" aria-hidden />
            {t('empty.action')}
          </button>
        </div>
      ) : (
        <ul className="divide-y divide-[color:var(--separator)] rounded-[var(--radius-card)] bg-[color:var(--surface)] shadow-sm">
          {members.map((m, i) => {
            const lastActive = listingLive && m.active && activeCount === 1;
            return (
              <li key={m.id} className="space-y-3 p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="break-words font-semibold">{m.name}</p>
                    <p className="text-[length:var(--text-subhead)] text-[color:var(--label-secondary)]">{m.role}</p>
                    <p className="text-[length:var(--text-subhead)] text-[color:var(--label-secondary)]">
                      {m.serviceNames.length ? t('row.services', { names: m.serviceNames.join(', ') }) : t('row.noServices')}
                    </p>
                    <p className="text-[length:var(--text-footnote)] text-[color:var(--label-secondary)]">
                      {m.customHours ? t('row.customHours') : t('row.businessHours')}
                    </p>
                  </div>
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-[color:var(--control-border)] px-2.5 py-1 text-[length:var(--text-footnote)] font-medium">
                    {m.active ? <UserCheck className="h-4 w-4" aria-hidden /> : <UserX className="h-4 w-4" aria-hidden />}
                    {m.active ? t('row.active') : t('row.inactive')}
                  </span>
                </div>
                {m.active && m.soleProviderOf.length > 0 ? (
                  <p className="flex items-start gap-2 text-[length:var(--text-subhead)]">
                    <TriangleAlert className="mt-0.5 h-4 w-4 flex-none" aria-hidden />
                    {t('warnings.soleProvider', { names: m.soleProviderOf.join(', ') })}
                  </p>
                ) : null}
                {lastActive ? <p className="text-[length:var(--text-footnote)] text-[color:var(--label-secondary)]">{t('warnings.lastActive')}</p> : null}
                <div className="flex flex-wrap gap-2">
                  <button type="button" className={rowBtn} aria-label={t('row.editNamed', { name: m.name })} onClick={() => setForm({ id: m.id })}>
                    <Pencil className="h-4 w-4" aria-hidden />
                    {t('row.edit')}
                  </button>
                  <button
                    type="button"
                    className={rowBtn}
                    disabled={busy}
                    aria-label={t(m.active ? 'row.deactivateNamed' : 'row.activateNamed', { name: m.name })}
                    onClick={() => toggle(m, !m.active)}
                  >
                    {m.active ? <UserX className="h-4 w-4" aria-hidden /> : <UserCheck className="h-4 w-4" aria-hidden />}
                    {m.active ? t('row.deactivate') : t('row.activate')}
                  </button>
                  <button type="button" className={rowBtn} aria-disabled={busy || i === 0 || undefined} aria-label={t('row.moveUpNamed', { name: m.name })} onClick={() => { if (!(busy || i === 0)) move(m, 'up'); }}>
                    <ArrowUp className="h-4 w-4" aria-hidden />
                    <span className="sr-only sm:not-sr-only">{t('row.moveUp')}</span>
                  </button>
                  <button
                    type="button"
                    className={rowBtn}
                    aria-disabled={busy || i === members.length - 1 || undefined}
                    aria-label={t('row.moveDownNamed', { name: m.name })}
                    onClick={() => { if (!(busy || i === members.length - 1)) move(m, 'down'); }}
                  >
                    <ArrowDown className="h-4 w-4" aria-hidden />
                    <span className="sr-only sm:not-sr-only">{t('row.moveDown')}</span>
                  </button>
                  <button
                    type="button"
                    className={`${rowBtn} !border-[color:var(--danger)] text-[color:var(--danger)]`}
                    disabled={busy}
                    aria-label={t('row.deleteNamed', { name: m.name })}
                    onClick={() => setDeleting(m)}
                  >
                    <Trash2 className="h-4 w-4" aria-hidden />
                    {t('row.delete')}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <FormSheet open={!!form} title={formMember ? t('form.editTitle') : t('form.addTitle')} closeLabel={t('form.close')} onClose={() => setForm(null)}>
        {form ? (
          <StaffForm
            key={form.id ?? 'new'}
            member={formMember}
            services={services}
            businessHours={businessHours}
            todayKey={todayKey}
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
      <FormSheet open={!!blocked} title={t('blockedSheet.title', { name: blocked?.member.name ?? '' })} closeLabel={t('form.close')} onClose={() => setBlocked(null)}>
        {blocked ? (
          <div className="space-y-4">
            <p>{t(blocked.kind === 'delete' ? 'blockedSheet.deleteBody' : 'blockedSheet.deactivateBody', { count: blocked.count })}</p>
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button type="button" className={secondaryBtn} onClick={() => setBlocked(null)}>
                {t('blockedSheet.close')}
              </button>
            </div>
          </div>
        ) : null}
      </FormSheet>
    </div>
  );
}
