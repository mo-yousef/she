import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { ADMIN_PAGE_SIZE } from '@/lib/admin-params';
/** Previous / next links for an admin list; `href(page)` builds the URL with the current filters. */
export async function Pager({ page, total, href, locale }: { page: number; total: number; href: (p: number) => string; locale: string }) {
  const t = await getTranslations('admin.list');
  const pageCount = Math.max(1, Math.ceil(total / ADMIN_PAGE_SIZE));
  const cls = 'inline-flex min-h-11 items-center rounded-[var(--radius-button)] border border-[color:var(--control-border)] px-4 font-medium';
  return (
    <nav aria-label={t('pagination')} className="flex items-center justify-between gap-3">
      {page > 1 ? (
        <Link href={href(page - 1)} locale={locale} className={cls}>
          {t('previous')}
        </Link>
      ) : (
        <span />
      )}
      <span className="text-[length:var(--text-subhead)] text-[color:var(--label-secondary)]">{t('pageOf', { page, pages: pageCount })}</span>
      {page < pageCount ? (
        <Link href={href(page + 1)} locale={locale} className={cls}>
          {t('next')}
        </Link>
      ) : (
        <span />
      )}
    </nav>
  );
}
