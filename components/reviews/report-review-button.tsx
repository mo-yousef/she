'use client';
/**
 * "Report review" (task 6.8). Opens the confirmation sheet with a fixed reason list. A report does
 * NOT hide the review: it stays public until an admin decides, and the sheet says so.
 */
import { useId, useState } from 'react';
import { Flag } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { reportReview } from '@/app/actions/review-manage';
import { ConfirmSheet } from '@/components/manage/confirm-sheet';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { REPORT_REASONS, type ReportReason } from '@/lib/review-report';

export function ReportReviewButton({ reviewId }: { reviewId: string }) {
  const t = useTranslations('reviewsManage.report');
  const router = useRouter();
  const uid = useId();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<ReportReason>('spam');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function confirm() {
    setBusy(true);
    setError('');
    try {
      const res = await reportReview({ reviewId, reason });
      if (res.ok) {
        setOpen(false);
        router.refresh();
      } else setError(t(t.has(`error.${res.code}`) ? `error.${res.code}` : 'error.UNKNOWN'));
    } catch {
      setError(t('error.UNKNOWN'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <Button type="button" variant="outline" size="lg" onClick={() => { setError(''); setOpen(true); }}>
        <Flag className="h-4 w-4" aria-hidden />
        {t('button')}
      </Button>
      <ConfirmSheet open={open} title={t('title')} confirmLabel={busy ? t('reporting') : t('confirm')} keepLabel={t('keep')} busy={busy} onConfirm={confirm} onClose={() => !busy && setOpen(false)}>
        <p>{t('body')}</p>
        <Label htmlFor={`${uid}-reason`} className="mt-3">
          {t('reasonLabel')}
        </Label>
        <select id={`${uid}-reason`} className="mt-1 min-h-11 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30" value={reason} onChange={(e) => setReason(e.target.value as ReportReason)}>
          {REPORT_REASONS.map((r) => (
            <option key={r} value={r}>
              {t(`reasons.${r}`)}
            </option>
          ))}
        </select>
        <p role="alert" aria-live="assertive" className="mt-2 font-medium text-destructive">
          {error}
        </p>
      </ConfirmSheet>
    </div>
  );
}
