import { MessageCircle, Phone } from 'lucide-react';
import { useTranslations } from 'next-intl';

const link =
  'inline-flex min-h-11 items-center gap-1.5 rounded-[var(--radius-button)] border border-[color:var(--control-border)] px-4 text-[length:var(--text-footnote)] font-medium';

/** Tap-to-call and WhatsApp for the business (same links as the business page). Usable from server or client. */
export function ContactLinks({
  phone,
  whatsapp,
}: {
  phone: string | null;
  whatsapp: string | null;
}) {
  const c = useTranslations('common');
  const b = useTranslations('business');
  const t = useTranslations('booked');
  if (!phone && !whatsapp) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {phone ? (
        <a href={`tel:${phone}`} className={link}>
          <Phone className="h-4 w-4" aria-hidden />
          {c('call')}
        </a>
      ) : null}
      {whatsapp ? (
        <a
          href={`https://wa.me/${whatsapp.replace(/\D/g, '')}`}
          target="_blank"
          rel="noopener noreferrer"
          className={link}
        >
          <MessageCircle className="h-4 w-4" aria-hidden />
          {b('whatsapp')}
          <span className="sr-only"> ({t('externalLink')})</span>
        </a>
      ) : null}
    </div>
  );
}
