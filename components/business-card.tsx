import Image from 'next/image';
import { getTranslations } from 'next-intl/server';
import { Clock } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { formatPrice } from '@/lib/money';
import { formatSlot } from '@/lib/format-datetime';
import type { BusinessCard as BusinessCardData } from '@/lib/search';
import { RatingStars } from './rating-stars';
import { FavouriteButton } from './favourite-button';

/**
 * Business result card (requirement §1.2). The cover uses the first photo, or a
 * gradient built from the two brand colours as a tasteful branded placeholder.
 * Open/closed is never colour-only: a labelled dot plus text carries meaning.
 */
export async function BusinessCard({
  card,
  locale,
  favourited,
}: {
  card: BusinessCardData;
  locale: string;
  favourited: boolean;
}) {
  const t = await getTranslations('card');
  const c = await getTranslations('common');
  const cat = await getTranslations('categories');
  const cities = await getTranslations('cities');

  return (
    <article className="group relative overflow-hidden rounded-[var(--radius-card)] bg-[color:var(--surface)] shadow-sm transition-transform hover:-translate-y-0.5">
      <div className="absolute right-3 top-3 z-10">
        <FavouriteButton businessId={card.id} initialFavourited={favourited} />
      </div>

      <Link
        href={`/b/${card.slug}`}
        locale={locale}
        className="block rounded-[var(--radius-card)] focus-visible:outline-offset-[-3px]"
      >
        <div
          className="relative aspect-[16/10] w-full"
          style={{
            background: `linear-gradient(135deg, ${card.brandPrimary}, ${card.brandAccent})`,
          }}
        >
          {card.coverUrl ? (
            <Image
              src={card.coverUrl}
              alt=""
              fill
              sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
              className="object-cover"
            />
          ) : null}
        </div>

        <div className="p-4">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h3 className="text-[length:var(--text-headline)] font-semibold tracking-tight">
                {card.name}
              </h3>
              <p className="mt-0.5 text-[length:var(--text-subhead)] text-[color:var(--label-secondary)]">
                {cat(card.category)} · {cities(card.city)}
              </p>
            </div>
          </div>

          <div className="mt-2 flex items-center justify-between gap-2">
            <RatingStars
              rating={card.ratingAvg}
              count={card.ratingCount}
              label={t('rating', { rating: card.ratingAvg.toFixed(1) })}
              reviewsLabel={t('reviews', { count: card.ratingCount })}
              newLabel={c('new')}
            />
            <OpenBadge open={card.openNow} openText={c('openNow')} closedText={c('closedNow')} />
          </div>

          <div className="mt-3 flex items-center justify-between gap-2 border-t border-[color:var(--separator)] pt-3">
            <span className="text-[length:var(--text-callout)] font-semibold">
              {card.fromPriceCents != null ? c('from', { price: formatPrice(card.fromPriceCents, locale) }) : ''}
            </span>
            <span className="inline-flex items-center gap-1 text-[length:var(--text-footnote)] text-[color:var(--label-secondary)]">
              <Clock className="h-3.5 w-3.5" aria-hidden />
              {card.nextSlotIso
                ? t('nextSlot', { when: formatSlot(card.nextSlotIso, locale) })
                : t('noSlots')}
            </span>
          </div>
        </div>
      </Link>
    </article>
  );
}

function OpenBadge({
  open,
  openText,
  closedText,
}: {
  open: boolean;
  openText: string;
  closedText: string;
}) {
  return (
    <span
      className="inline-flex items-center gap-1.5 text-[length:var(--text-footnote)] font-medium"
      style={{ color: open ? 'var(--success)' : 'var(--label-secondary)' }}
    >
      <span
        aria-hidden
        className="h-2 w-2 rounded-full"
        style={{ background: open ? 'var(--success)' : 'var(--label-secondary)' }}
      />
      {open ? openText : closedText}
    </span>
  );
}

export function BusinessCardSkeleton() {
  return (
    <div className="overflow-hidden rounded-[var(--radius-card)] bg-[color:var(--surface)] shadow-sm">
      <div className="aspect-[16/10] w-full animate-pulse bg-[color:var(--separator)]" />
      <div className="space-y-3 p-4">
        <div className="h-4 w-2/3 animate-pulse rounded bg-[color:var(--separator)]" />
        <div className="h-3 w-1/2 animate-pulse rounded bg-[color:var(--separator)]" />
        <div className="h-3 w-1/3 animate-pulse rounded bg-[color:var(--separator)]" />
      </div>
    </div>
  );
}
