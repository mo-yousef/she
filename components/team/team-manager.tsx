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
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { StaffForm, type SavedInfo } from './staff-form';

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
        <p className="text-muted-foreground">{t('summary', { count: members.length })}</p>
        <Button type="button" size="lg" onClick={() => setForm({ id: null })}>
          <Plus className="h-5 w-5" aria-hidden />
          {t('add')}
        </Button>
      </div>
      <p role="status" aria-live="polite" className="min-h-0 font-medium">
        {status}
      </p>
      {error ? (
        <p role="alert" className="rounded-md border border-destructive p-3 text-sm text-destructive">
          {error}
        </p>
      ) : null}
      {listingLive && members.length > 0 && activeCount === 0 ? (
        <Card className="flex-row items-start gap-2 p-4">
          <TriangleAlert className="mt-0.5 h-5 w-5 flex-none" aria-hidden />
          <span>{t('warnings.noActiveStaff')}</span>
        </Card>
      ) : null}
      {members.length === 0 ? (
        <Card className="gap-3 p-5">
          <h2 className="text-lg font-semibold">{t('empty.title')}</h2>
          <p className="text-muted-foreground">{t('empty.body')}</p>
          <Button type="button" size="lg" className="w-fit" onClick={() => setForm({ id: null })}>
            <Plus className="h-5 w-5" aria-hidden />
            {t('empty.action')}
          </Button>
        </Card>
      ) : (
        <Card className="gap-0 p-0">
          {members.map((m, i) => {
            const lastActive = listingLive && m.active && activeCount === 1;
            return (
              <div key={m.id}>
                {i > 0 ? <Separator /> : null}
                <div className="space-y-3 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="break-words font-semibold">{m.name}</p>
                      <p className="text-sm text-muted-foreground">{m.role}</p>
                      <p className="text-sm text-muted-foreground">
                        {m.serviceNames.length ? t('row.services', { names: m.serviceNames.join(', ') }) : t('row.noServices')}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {m.customHours ? t('row.customHours') : t('row.businessHours')}
                      </p>
                    </div>
                    <Badge variant="outline" className="gap-1.5 px-2.5 py-1">
                      {m.active ? <UserCheck className="h-4 w-4" aria-hidden /> : <UserX className="h-4 w-4" aria-hidden />}
                      {m.active ? t('row.active') : t('row.inactive')}
                    </Badge>
                  </div>
                  {m.active && m.soleProviderOf.length > 0 ? (
                    <p className="flex items-start gap-2 text-sm">
                      <TriangleAlert className="mt-0.5 h-4 w-4 flex-none" aria-hidden />
                      {t('warnings.soleProvider', { names: m.soleProviderOf.join(', ') })}
                    </p>
                  ) : null}
                  {lastActive ? <p className="text-xs text-muted-foreground">{t('warnings.lastActive')}</p> : null}
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" variant="outline" className="min-h-11" aria-label={t('row.editNamed', { name: m.name })} onClick={() => setForm({ id: m.id })}>
                      <Pencil className="h-4 w-4" aria-hidden />
                      {t('row.edit')}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      className="min-h-11"
                      disabled={busy}
                      aria-label={t(m.active ? 'row.deactivateNamed' : 'row.activateNamed', { name: m.name })}
                      onClick={() => toggle(m, !m.active)}
                    >
                      {m.active ? <UserX className="h-4 w-4" aria-hidden /> : <UserCheck className="h-4 w-4" aria-hidden />}
                      {m.active ? t('row.deactivate') : t('row.activate')}
                    </Button>
                    <Button type="button" variant="outline" className="min-h-11" aria-disabled={busy || i === 0 || undefined} aria-label={t('row.moveUpNamed', { name: m.name })} onClick={() => { if (!(busy || i === 0)) move(m, 'up'); }}>
                      <ArrowUp className="h-4 w-4" aria-hidden />
                      <span className="sr-only sm:not-sr-only">{t('row.moveUp')}</span>
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      className="min-h-11"
                      aria-disabled={busy || i === members.length - 1 || undefined}
                      aria-label={t('row.moveDownNamed', { name: m.name })}
                      onClick={() => { if (!(busy || i === members.length - 1)) move(m, 'down'); }}
                    >
                      <ArrowDown className="h-4 w-4" aria-hidden />
                      <span className="sr-only sm:not-sr-only">{t('row.moveDown')}</span>
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      className="min-h-11 border-destructive text-destructive hover:bg-destructive/10 hover:text-destructive"
                      disabled={busy}
                      aria-label={t('row.deleteNamed', { name: m.name })}
                      onClick={() => setDeleting(m)}
                    >
                      <Trash2 className="h-4 w-4" aria-hidden />
                      {t('row.delete')}
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </Card>
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
              <Button type="button" variant="outline" size="lg" onClick={() => setBlocked(null)}>
                {t('blockedSheet.close')}
              </Button>
            </div>
          </div>
        ) : null}
      </FormSheet>
    </div>
  );
}
