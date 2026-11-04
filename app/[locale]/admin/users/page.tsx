import { getTranslations, setRequestLocale } from 'next-intl/server';
import { requireAdmin } from '@/lib/admin-session';
import { loadAdminUsers } from '@/lib/admin-data';
import { parseAdminUserParams } from '@/lib/admin-params';
import { AdminAction } from '@/components/admin/admin-action';
import { Pager } from '@/components/admin/pager';
import { FocusHeading } from '@/components/focus-heading';
import { inputClass, primaryBtn } from '@/components/calendar/fields';
export const dynamic = 'force-dynamic';
export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return { title: (await getTranslations({ locale, namespace: 'admin' }))('users.title') };
}
export default async function AdminUsers({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { userId } = await requireAdmin(locale, `/${locale}/admin/users`);
  const p = parseAdminUserParams(await searchParams);
  const t = await getTranslations('admin');
  const { total, rows } = await loadAdminUsers(p);
  const dateFmt = new Intl.DateTimeFormat(locale, { dateStyle: 'medium' });
  const href = (page: number) => {
    const qs = new URLSearchParams();
    if (p.q) qs.set('q', p.q);
    if (page > 1) qs.set('page', String(page));
    return qs.size ? `/admin/users?${qs}` : '/admin/users';
  };
  return (
    <div className="space-y-6">
      <FocusHeading className="text-[length:var(--text-title1)] font-bold tracking-tight">{t('users.title')}</FocusHeading>
      <form method="get" className="flex flex-wrap items-end gap-2" role="search">
        <div className="min-w-48 flex-1">
          <label htmlFor="au-q" className="block text-[length:var(--text-subhead)] font-medium">{t('users.search')}</label>
          <input id="au-q" name="q" type="search" inputMode="email" autoComplete="off" defaultValue={p.q} maxLength={80} className={inputClass} />
        </div>
        <button type="submit" className={primaryBtn}>{t('list.apply')}</button>
      </form>
      <p className="text-[length:var(--text-subhead)] text-[color:var(--label-secondary)]" aria-live="polite">{t('list.count', { count: total })}</p>
      {rows.length === 0 ? (
        <p>{t('users.empty')}</p>
      ) : (
        <ul className="space-y-3">
          {rows.map((u) => (
            <li key={u.id} className="space-y-2 rounded-[var(--radius-card)] bg-[color:var(--surface)] p-4">
              <p className="break-all font-semibold">{u.email ?? t('users.noEmail')}</p>
              <p className="text-[length:var(--text-subhead)] text-[color:var(--label-secondary)]">
                {t('users.meta', { role: t(`users.role.${u.role}`), date: dateFmt.format(u.createdAt) })}
              </p>
              {u.role === 'ADMIN' ? (
                u.id === userId ? (
                  <p className="text-[length:var(--text-footnote)] text-[color:var(--label-secondary)]">{t('users.you')}</p>
                ) : (
                  <AdminAction kind={{ type: 'user', id: u.id, action: 'removeAdmin' }} />
                )
              ) : (
                <AdminAction kind={{ type: 'user', id: u.id, action: 'makeAdmin' }} />
              )}
            </li>
          ))}
        </ul>
      )}
      <Pager page={p.page} total={total} locale={locale} href={href} />
    </div>
  );
}
