'use client';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { removeReviewReply, replyToReview } from '@/app/actions/review-reply';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

const MAX = 1000;

/**
 * Owner reply editor for one review (task 5.5). Mounted by the dashboard reviews screen
 * (task 6.8), NOT on the public page. The server action re-checks that the signed-in
 * user owns the review's business; this form only drives the UI. The reply is rendered
 * everywhere as plain text (React escapes it; no dangerouslySetInnerHTML).
 */
export function OwnerReplyForm({ reviewId, initialReply }: { reviewId: string; initialReply: string | null }) {
  const t = useTranslations('review.ownerReply');
  const [text, setText] = useState(initialReply ?? '');
  const [hasReply, setHasReply] = useState(!!initialReply);
  const [busy, setBusy] = useState<'save' | 'remove' | null>(null);
  const [status, setStatus] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed) return setStatus({ kind: 'error', text: t('error.empty') });
    if (trimmed.length > MAX) return setStatus({ kind: 'error', text: t('error.tooLong', { max: MAX }) });
    setBusy('save');
    setStatus(null);
    try {
      const res = await replyToReview({ reviewId, body: trimmed });
      if (res.ok) {
        setHasReply(true);
        setStatus({ kind: 'ok', text: t('saved') });
      } else setStatus({ kind: 'error', text: t(`error.${res.code}`) });
    } catch {
      setStatus({ kind: 'error', text: t('error.UNKNOWN') });
    } finally {
      setBusy(null);
    }
  }

  async function remove() {
    setBusy('remove');
    setStatus(null);
    try {
      const res = await removeReviewReply({ reviewId });
      if (res.ok) {
        setText('');
        setHasReply(false);
        setStatus({ kind: 'ok', text: t('removed') });
      } else setStatus({ kind: 'error', text: t(`error.${res.code}`) });
    } catch {
      setStatus({ kind: 'error', text: t('error.UNKNOWN') });
    } finally {
      setBusy(null);
    }
  }

  const id = `reply-${reviewId}`;
  return (
    <form onSubmit={save} noValidate>
      <Label htmlFor={id}>{t('label')}</Label>
      <Textarea
        id={id}
        rows={3}
        autoComplete="off"
        value={text}
        aria-describedby={`${id}-hint ${id}-count`}
        onChange={(e) => setText(e.target.value)}
        className="mt-1"
      />
      <div className="mt-1 flex justify-between gap-3 text-xs text-muted-foreground">
        <span id={`${id}-hint`}>{t('hint')}</span>
        <span id={`${id}-count`} className="tabular-nums">
          {text.length} / {MAX}
        </span>
      </div>
      <div className="mt-3 flex flex-col gap-3 sm:flex-row">
        <Button type="submit" size="lg" disabled={busy !== null}>
          {busy === 'save' ? t('saving') : t('save')}
        </Button>
        {hasReply ? (
          <Button type="button" variant="outline" size="lg" onClick={remove} disabled={busy !== null}>
            {busy === 'remove' ? t('removing') : t('remove')}
          </Button>
        ) : null}
      </div>
      <p
        role={status?.kind === 'error' ? 'alert' : 'status'}
        aria-live="polite"
        className={`mt-2 text-xs font-medium ${status?.kind === 'error' ? 'text-destructive' : 'text-success'}`}
      >
        {status?.text}
      </p>
    </form>
  );
}
