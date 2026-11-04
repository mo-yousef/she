'use client';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { removeReviewReply, replyToReview } from '@/app/actions/review-reply';

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
      <label htmlFor={id} className="block text-[length:var(--text-subhead)] font-medium">
        {t('label')}
      </label>
      <textarea
        id={id}
        rows={3}
        autoComplete="off"
        value={text}
        aria-describedby={`${id}-hint ${id}-count`}
        onChange={(e) => setText(e.target.value)}
        className="mt-1 block min-h-11 w-full rounded-[var(--radius-input)] border border-[color:var(--control-border)] bg-[color:var(--surface)] px-3 text-[length:var(--text-body)] text-[color:var(--label)]"
      />
      <div className="mt-1 flex justify-between gap-3 text-[length:var(--text-footnote)] text-[color:var(--label-secondary)]">
        <span id={`${id}-hint`}>{t('hint')}</span>
        <span id={`${id}-count`} className="tabular-nums">
          {text.length} / {MAX}
        </span>
      </div>
      <div className="mt-3 flex flex-col gap-3 sm:flex-row">
        <button
          type="submit"
          disabled={busy !== null}
          className="inline-flex min-h-11 items-center justify-center rounded-[var(--radius-button)] bg-[color:var(--tint)] px-5 font-semibold text-[color:var(--tint-contrast)] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy === 'save' ? t('saving') : t('save')}
        </button>
        {hasReply ? (
          <button
            type="button"
            onClick={remove}
            disabled={busy !== null}
            className="inline-flex min-h-11 items-center justify-center rounded-[var(--radius-button)] border border-[color:var(--control-border)] px-5 font-semibold disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy === 'remove' ? t('removing') : t('remove')}
          </button>
        ) : null}
      </div>
      <p
        role={status?.kind === 'error' ? 'alert' : 'status'}
        aria-live="polite"
        className={`mt-2 text-[length:var(--text-footnote)] font-medium ${
          status?.kind === 'error' ? 'text-[color:var(--danger)]' : 'text-[color:var(--success)]'
        }`}
      >
        {status?.text}
      </p>
    </form>
  );
}
