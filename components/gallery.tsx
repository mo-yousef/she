'use client';

import { useRef, useState } from 'react';
import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { wrapIndex } from '@/lib/wrap-index';

export interface GalleryPhoto {
  id: string;
  url: string;
  alt: string;
}

// Brand-coloured ring (inherited --b1 from .brand-scope) with a white halo so it
// stays visible on the dark scrim.
const controlClass =
  'flex h-11 w-11 items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/80 focus-visible:outline-[color:var(--b1)] focus-visible:shadow-[0_0_0_4px_#fff]';

/**
 * Photo grid + modal lightbox built on the native <dialog>: showModal() gives
 * the focus trap, inert background, Escape-to-close and focus return to the
 * opener. Arrow keys / buttons / touch swipe move between photos.
 */
export function Gallery({ photos, businessName }: { photos: GalleryPhoto[]; businessName: string }) {
  const t = useTranslations('business');
  const dialogRef = useRef<HTMLDialogElement>(null);
  const touchStartX = useRef<number | null>(null);
  const [index, setIndex] = useState(0);
  const [open, setOpen] = useState(false);

  if (photos.length === 0) {
    return (
      <div className="mt-4 flex aspect-[16/7] items-center justify-center rounded-[var(--radius-card)] bg-[color:var(--surface)] p-4 text-center text-[color:var(--label-secondary)] shadow-sm">
        {t('galleryComingSoon')}
      </div>
    );
  }

  const altFor = (p: GalleryPhoto, i: number) =>
    p.alt.trim() || t('galleryPhotoAlt', { name: businessName, n: i + 1 });
  const step = (delta: number) => setIndex((i) => wrapIndex(i, delta, photos.length));
  const current = photos[index] ?? photos[0];

  return (
    <>
      <ul className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
        {photos.map((p, i) => (
          <li key={p.id}>
            <button
              type="button"
              onClick={() => {
                setIndex(i);
                setOpen(true);
                dialogRef.current?.showModal();
              }}
              className="relative block aspect-square min-h-11 w-full overflow-hidden rounded-[var(--radius-card)]"
            >
              {/* The image alt is the button's accessible name. */}
              <Image
                src={p.url}
                alt={altFor(p, i)}
                fill
                priority={i === 0}
                loading={i === 0 ? undefined : 'lazy'}
                sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 280px"
                className="object-cover transition-transform duration-200 hover:scale-[1.03] motion-reduce:transition-none motion-reduce:hover:scale-100"
              />
            </button>
          </li>
        ))}
      </ul>

      <dialog
        ref={dialogRef}
        aria-label={t('galleryDialog', { name: businessName })}
        onClose={() => setOpen(false)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowLeft') {
            e.preventDefault();
            step(-1);
          } else if (e.key === 'ArrowRight') {
            e.preventDefault();
            step(1);
          }
        }}
        // Click on the dialog box itself (outside the content wrapper) = scrim click.
        onClick={(e) => {
          if (e.target === e.currentTarget) dialogRef.current?.close();
        }}
        onTouchStart={(e) => {
          touchStartX.current = e.touches[0]?.clientX ?? null;
        }}
        onTouchEnd={(e) => {
          const start = touchStartX.current;
          touchStartX.current = null;
          const endTouch = e.changedTouches[0];
          if (start == null || !endTouch) return;
          const dx = endTouch.clientX - start;
          if (Math.abs(dx) > 50) step(dx < 0 ? 1 : -1);
        }}
        className="m-0 h-dvh max-h-none w-screen max-w-none bg-transparent p-0 text-white backdrop:bg-black/90"
      >
        {open && current ? (
          <div className="relative h-full w-full">
            <Image
              key={current.id}
              src={current.url}
              alt={altFor(current, index)}
              fill
              sizes="100vw"
              className="pointer-events-none object-contain p-4 pb-20 sm:px-20"
            />
            <button
              type="button"
              onClick={() => dialogRef.current?.close()}
              aria-label={t('galleryClose')}
              // The photo content mounts after showModal(), so move focus in explicitly.
              autoFocus
              className={`absolute right-4 top-4 ${controlClass}`}
            >
              <X className="h-5 w-5" aria-hidden />
            </button>
            {photos.length > 1 ? (
              <>
                <button
                  type="button"
                  onClick={() => step(-1)}
                  aria-label={t('galleryPrev')}
                  className={`absolute left-4 top-1/2 -translate-y-1/2 ${controlClass}`}
                >
                  <ChevronLeft className="h-5 w-5" aria-hidden />
                </button>
                <button
                  type="button"
                  onClick={() => step(1)}
                  aria-label={t('galleryNext')}
                  className={`absolute right-4 top-1/2 -translate-y-1/2 ${controlClass}`}
                >
                  <ChevronRight className="h-5 w-5" aria-hidden />
                </button>
              </>
            ) : null}
            <p
              role="status"
              aria-live="polite"
              className="absolute inset-x-0 bottom-6 text-center text-[length:var(--text-subhead)]"
            >
              {t('galleryCounter', { n: index + 1, total: photos.length })}
            </p>
          </div>
        ) : null}
      </dialog>
    </>
  );
}
