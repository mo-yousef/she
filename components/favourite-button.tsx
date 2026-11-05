'use client';

import { useState, useTransition } from 'react';
import { Heart } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { toggleFavourite } from '@/app/actions/favourites';

/**
 * Heart toggle with optimistic UI. If the user is not signed in, the server
 * action returns UNAUTHENTICATED and we send them to the account page to sign
 * in — the favourite is not silently dropped.
 */
export function FavouriteButton({
  businessId,
  initialFavourited,
}: {
  businessId: string;
  initialFavourited: boolean;
}) {
  const t = useTranslations('card');
  const locale = useLocale();
  const router = useRouter();
  const [favourited, setFavourited] = useState(initialFavourited);
  const [failed, setFailed] = useState(false);
  const [isPending, startTransition] = useTransition();

  function onClick() {
    if (isPending) return; // guard instead of `disabled` so keyboard focus is never dropped
    const optimistic = !favourited;
    setFavourited(optimistic);
    setFailed(false);
    startTransition(async () => {
      try {
        const res = await toggleFavourite({ businessId });
        if (!res.ok) {
          setFavourited(!optimistic); // revert
          if (res.error === 'UNAUTHENTICATED') {
            router.push('/signin', { locale });
          } else {
            setFailed(true);
          }
          return;
        }
        setFavourited(res.favourited);
      } catch {
        // Network / server failure: roll back and tell the user.
        setFavourited(!optimistic);
        setFailed(true);
      }
    });
  }

  return (
    <div className="relative inline-flex">
      <button
        type="button"
        onClick={onClick}
        aria-disabled={isPending}
        aria-pressed={favourited}
        aria-label={favourited ? t('removeFavourite') : t('addFavourite')}
        className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-[color:var(--surface)] text-[color:var(--label)] shadow-sm transition-transform hover:scale-105 focus-visible:shadow-[0_0_0_2px_var(--surface)] aria-disabled:opacity-60 motion-reduce:transition-none motion-reduce:hover:scale-100"
      >
        <Heart
          className={`h-5 w-5 ${favourited ? 'fill-[color:var(--danger)] text-[color:var(--danger)]' : ''}`}
          aria-hidden
        />
      </button>
      {/* Visible and announced: a failed save must not be screen-reader-only. */}
      <span
        role="status"
        className={
          failed
            ? 'absolute right-0 top-12 w-44 rounded-[var(--radius-input)] bg-[color:var(--surface)] px-2 py-1 text-[length:var(--text-footnote)] text-[color:var(--danger)] shadow-sm'
            : 'sr-only'
        }
      >
        {failed ? t('favouriteError') : ''}
      </span>
    </div>
  );
}
