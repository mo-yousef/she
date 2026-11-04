import { Star } from 'lucide-react';

/**
 * Rating display. Accessibility: the numeric rating is exposed to screen
 * readers via aria-label; the stars are decorative. Never colour-only — the
 * number is always shown alongside.
 */
export function RatingStars({
  rating,
  count,
  label,
  reviewsLabel,
  newLabel,
}: {
  rating: number;
  count: number;
  label: string; // "Rated {rating} out of 5"
  reviewsLabel: string; // pluralized review count
  newLabel: string; // "New"
}) {
  if (count === 0) {
    return (
      <span className="inline-flex items-center gap-1 text-[length:var(--text-subhead)] text-[color:var(--label-secondary)]">
        <Star className="h-4 w-4" aria-hidden />
        {newLabel}
      </span>
    );
  }

  return (
    <span
      className="inline-flex items-center gap-1 text-[length:var(--text-subhead)]"
      aria-label={label}
    >
      <Star className="h-4 w-4 fill-current text-[color:var(--tint)]" aria-hidden />
      <span className="font-semibold text-[color:var(--label)]">{rating.toFixed(1)}</span>
      <span className="text-[color:var(--label-secondary)]">({reviewsLabel})</span>
    </span>
  );
}
