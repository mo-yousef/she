'use client';
/**
 * One admin action button (task 7.1). Destructive actions open the shared confirm sheet (safe "keep"
 * choice first); the rest run directly. Result errors are shown inline in a live region.
 */
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { adminBusinessAction, adminReviewAction, adminRoleAction } from '@/app/actions/admin';
import { ConfirmSheet } from '@/components/manage/confirm-sheet';
import { dangerBtn, secondaryBtn } from '@/components/calendar/fields';
import type { BusinessAction, ReviewAction } from '@/lib/admin-params';
export type AdminActionKind =
  | { type: 'business'; id: string; action: BusinessAction }
  | { type: 'review'; id: string; action: ReviewAction }
  | { type: 'user'; id: string; action: 'makeAdmin' | 'removeAdmin' };
const CONFIRM = new Set(['business.suspend', 'business.reject', 'review.hide', 'user.removeAdmin', 'user.makeAdmin']);
export function AdminAction({ kind }: { kind: AdminActionKind }) {
  const t = useTranslations('admin.action');
  const e = useTranslations('admin.error');
  const router = useRouter();
  const key = `${kind.type}.${kind.action}`;
  const needsConfirm = CONFIRM.has(key);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function run() {
    setBusy(true);
    setError('');
    try {
      const res =
        kind.type === 'business'
          ? await adminBusinessAction(kind.id, kind.action)
          : kind.type === 'review'
            ? await adminReviewAction(kind.id, kind.action)
            : await adminRoleAction(kind.id, kind.action === 'makeAdmin');
      if (res.ok) {
        setOpen(false);
        router.refresh();
      } else {
        setOpen(false);
        setError(e(e.has(res.code) ? res.code : 'UNKNOWN'));
      }
    } catch {
      setOpen(false);
      setError(e('UNKNOWN'));
    } finally {
      setBusy(false);
    }
  }
  const destructive = key === 'business.suspend' || key === 'business.reject' || key === 'review.hide' || key === 'user.removeAdmin';
  return (
    <span className="inline-flex flex-col items-start gap-1">
      <button type="button" disabled={busy} onClick={needsConfirm ? () => setOpen(true) : run} className={destructive ? dangerBtn : secondaryBtn}>
        {t(`${key}.label`)}
      </button>
      {error ? (
        <span role="alert" className="text-[length:var(--text-footnote)] text-[color:var(--danger)]">
          {error}
        </span>
      ) : null}
      {needsConfirm ? (
        <ConfirmSheet open={open} title={t(`${key}.title`)} confirmLabel={t(`${key}.label`)} keepLabel={t('keep')} busy={busy} onConfirm={run} onClose={() => !busy && setOpen(false)}>
          {t(`${key}.body`)}
        </ConfirmSheet>
      ) : null}
    </span>
  );
}
