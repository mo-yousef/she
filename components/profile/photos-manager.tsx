'use client';
/**
 * Photos manager (task 6.7 part 2). The server page passes the ordered list; every action
 * revalidates the page so props are the single source of truth (no optimistic copy). Alt text keeps
 * a per-photo draft so typed text is never lost on error. Reordering uses buttons only
 * (shortcut: no drag and drop, docs/shortcuts.md). Edge buttons use aria-disabled so keyboard
 * focus is not dropped when a photo reaches the first or last position. No glass, no motion.
 */
import { useRef, useState } from 'react';
import Image from 'next/image';
import { ArrowLeft, ArrowRight, ImagePlus, Star, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { addPhoto, createUploadSignature, deletePhoto, movePhoto, setCover, updatePhotoAlt } from '@/app/actions/photos';
import { Field, dangerBtn, fieldAria, inputClass, primaryBtn, secondaryBtn } from '@/components/calendar/fields';
import { ConfirmSheet } from '@/components/manage/confirm-sheet';
import { ALLOWED_PHOTO_MIME, MAX_ALT_LENGTH, MAX_PHOTOS, MAX_PHOTO_BYTES, hasPhotoSlot } from '@/lib/photos-schema';

export interface PhotoDto {
  id: string;
  url: string;
  alt: string;
}
type R = { ok: true; warnings?: string[] } | { ok: false; code: string; errors?: Record<string, string> };

const MB = MAX_PHOTO_BYTES / (1024 * 1024);

export function PhotosManager({ photos, uploadsConfigured }: { photos: PhotoDto[]; uploadsConfigured: boolean }) {
  const t = useTranslations('profile.photos');
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const summaryRef = useRef<HTMLParagraphElement>(null);
  const total = photos.length;

  function errorText(res: Extract<R, { ok: false }>): string {
    const detail = Object.values(res.errors ?? {})[0];
    const key = detail && t.has(`error.${detail}`) ? detail : t.has(`error.${res.code}`) ? res.code : 'UNKNOWN';
    return t(`error.${key}`, { mb: MB, max: key === 'altTooLong' ? MAX_ALT_LENGTH : MAX_PHOTOS });
  }

  /** Runs one action: busy flag, one live-region message, typed text kept on error. */
  async function act(fn: () => Promise<R>, ok: string): Promise<boolean> {
    setBusy(true);
    setStatus('');
    setError('');
    try {
      const res = await fn();
      if (res.ok) {
        setStatus(res.warnings?.includes('NO_PHOTOS') ? `${ok} ${t('noPhotosWarning')}` : ok);
        return true;
      }
      setError(errorText(res));
    } catch {
      setError(t('error.UNKNOWN'));
    } finally {
      setBusy(false);
    }
    return false;
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow choosing the same file again after an error
    if (!file) return;
    setStatus('');
    setError('');
    if (!(ALLOWED_PHOTO_MIME as readonly string[]).includes(file.type)) return setError(t('error.typeNotAllowed'));
    if (file.size > MAX_PHOTO_BYTES) return setError(t('error.tooLarge', { mb: MB }));
    await act(async () => {
      const sig = await createUploadSignature();
      if (!sig.ok) return sig;
      const u = sig.upload;
      const body = new FormData();
      body.append('file', file);
      body.append('api_key', u.apiKey);
      body.append('timestamp', String(u.timestamp));
      body.append('folder', u.folder);
      body.append('allowed_formats', u.allowedFormats);
      body.append('signature', u.signature);
      const resp = await fetch(`https://api.cloudinary.com/v1_1/${encodeURIComponent(u.cloudName)}/image/upload`, { method: 'POST', body });
      if (!resp.ok) return { ok: false, code: 'uploadFailed' } as const;
      const up = (await resp.json()) as { secure_url?: string; public_id?: string; format?: string; bytes?: number };
      return addPhoto({ url: up.secure_url, publicId: up.public_id, format: up.format, bytes: up.bytes });
    }, t('uploaded'));
    summaryRef.current?.focus();
  }

  const saveAlt = (id: string) => {
    const value = drafts[id];
    const current = photos.find((p) => p.id === id);
    if (value === undefined || !current || value.trim() === current.alt) return;
    void act(() => updatePhotoAlt(id, value), t('altSaved')).then((ok) => {
      if (ok) setDrafts((d) => Object.fromEntries(Object.entries(d).filter(([k]) => k !== id)));
    });
  };

  const atLimit = !hasPhotoSlot(total);
  const canUpload = uploadsConfigured && !atLimit;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 rounded-[var(--radius-card)] bg-[color:var(--surface)] p-4">
        <div className="min-w-0 flex-1 space-y-1">
          <p ref={summaryRef} tabIndex={-1} className="font-semibold outline-none">
            {t('count', { n: total, max: MAX_PHOTOS })}
          </p>
          <p className="text-[length:var(--text-footnote)] text-[color:var(--label-secondary)]">
            {!uploadsConfigured ? t('notConfigured') : atLimit ? t('full', { max: MAX_PHOTOS }) : t('formats', { mb: MB })}
          </p>
        </div>
        {uploadsConfigured ? (
          <label className={`${primaryBtn} cursor-pointer has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 ${busy || atLimit ? 'pointer-events-none opacity-60' : ''}`}>
            <ImagePlus className="h-5 w-5" aria-hidden />
            {busy ? t('uploading') : t('add')}
            <input type="file" accept={ALLOWED_PHOTO_MIME.join(',')} className="sr-only" disabled={!canUpload || busy} onChange={onFile} />
          </label>
        ) : null}
      </div>

      <div role="status" aria-live="polite" className="text-[length:var(--text-subhead)]">
        {status}
      </div>
      {error ? (
        <p role="alert" className="text-[length:var(--text-subhead)] text-[color:var(--danger)]">
          {error}
        </p>
      ) : null}

      {total === 0 ? (
        <p className="rounded-[var(--radius-card)] bg-[color:var(--surface)] p-6 text-center text-[color:var(--label-secondary)]">{t('empty')}</p>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {photos.map((p, i) => {
            const n = i + 1;
            const where = t('position', { n, total });
            const value = drafts[p.id] ?? p.alt;
            const fid = `photo-alt-${p.id}`;
            const move = (dir: 'up' | 'down') => {
              const to = dir === 'up' ? n - 1 : n + 1;
              if (to < 1 || to > total) return;
              void act(() => movePhoto(p.id, dir), t('moved', { n: to, total }));
            };
            const edge = 'aria-disabled:cursor-not-allowed aria-disabled:opacity-50';
            return (
              <li key={p.id} className="overflow-hidden rounded-[var(--radius-card)] bg-[color:var(--surface)]" aria-label={where}>
                <div className="relative aspect-[4/3] bg-[color:var(--bg)]">
                  <Image src={p.url} alt={p.alt.trim() || t('fallbackAlt', { n })} fill sizes="(min-width: 1024px) 30vw, (min-width: 640px) 45vw, 100vw" className="object-cover" />
                  {i === 0 ? (
                    <span className="absolute left-2 top-2 inline-flex min-h-8 items-center gap-1 rounded-full bg-[color:var(--tint)] px-3 text-[length:var(--text-footnote)] font-semibold text-[color:var(--tint-contrast)]">
                      <Star className="h-4 w-4" aria-hidden />
                      {t('cover')}
                    </span>
                  ) : null}
                </div>
                <div className="space-y-3 p-3">
                  <p className="text-[length:var(--text-footnote)] text-[color:var(--label-secondary)]">{where}</p>
                  <form
                    className="space-y-2"
                    onSubmit={(e) => {
                      e.preventDefault();
                      saveAlt(p.id);
                    }}
                  >
                    <Field id={fid} label={t('altLabel')} hint={value.trim() ? undefined : t('altHint')}>
                      <input
                        {...fieldAria(fid, value.trim() ? undefined : t('altHint'))}
                        type="text"
                        autoComplete="off"
                        maxLength={MAX_ALT_LENGTH}
                        className={inputClass}
                        value={value}
                        onChange={(e) => setDrafts((d) => ({ ...d, [p.id]: e.target.value }))}
                        onBlur={() => saveAlt(p.id)}
                      />
                    </Field>
                    <button type="submit" disabled={busy} className={secondaryBtn}>
                      {t('altSave')}
                    </button>
                  </form>
                  <div className="flex flex-wrap gap-2">
                    <button type="button" aria-disabled={i === 0 || busy} aria-label={`${t('moveEarlier')}, ${where}`} onClick={() => !busy && move('up')} className={`${secondaryBtn} ${edge}`}>
                      <ArrowLeft className="h-4 w-4" aria-hidden />
                      {t('moveEarlier')}
                    </button>
                    <button type="button" aria-disabled={i === total - 1 || busy} aria-label={`${t('moveLater')}, ${where}`} onClick={() => !busy && move('down')} className={`${secondaryBtn} ${edge}`}>
                      {t('moveLater')}
                      <ArrowRight className="h-4 w-4" aria-hidden />
                    </button>
                    {i > 0 ? (
                      <button type="button" disabled={busy} aria-label={`${t('setCover')}, ${where}`} onClick={() => void act(() => setCover(p.id), t('coverSet', { n: 1 }))} className={secondaryBtn}>
                        <Star className="h-4 w-4" aria-hidden />
                        {t('setCover')}
                      </button>
                    ) : null}
                    <button type="button" disabled={busy} aria-label={`${t('delete')}, ${where}`} onClick={() => setConfirmId(p.id)} className={dangerBtn}>
                      <Trash2 className="h-4 w-4" aria-hidden />
                      {t('delete')}
                    </button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <ConfirmSheet
        open={confirmId !== null}
        title={t('deleteTitle')}
        confirmLabel={t('deleteConfirm')}
        keepLabel={t('deleteKeep')}
        busy={busy}
        onClose={() => setConfirmId(null)}
        onConfirm={async () => {
          if (!confirmId) return;
          await act(() => deletePhoto(confirmId), t('deleted'));
          setConfirmId(null);
          summaryRef.current?.focus();
        }}
      >
        {t('deleteBody')}
      </ConfirmSheet>
    </div>
  );
}
