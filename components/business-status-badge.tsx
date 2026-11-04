import { useTranslations } from 'next-intl';
import { CheckCircle2, Clock3, FileEdit, AlertTriangle } from 'lucide-react';

const ICON = { DRAFT: FileEdit, PENDING: Clock3, PUBLISHED: CheckCircle2, SUSPENDED: AlertTriangle } as const;
const TONE: Record<keyof typeof ICON, string> = {
  DRAFT: 'text-[color:var(--label-secondary)]',
  PENDING: 'text-[color:var(--tint)]',
  PUBLISHED: 'text-[color:var(--success)]',
  SUSPENDED: 'text-[color:var(--danger)]',
};

export function BusinessStatusBadge({ status }: { status: keyof typeof ICON }) {
  const t = useTranslations('dashboard.status');
  const Icon = ICON[status];
  return (
    <span className={`inline-flex items-center gap-1.5 text-[length:var(--text-subhead)] font-medium ${TONE[status]}`}>
      <Icon className="h-4 w-4" aria-hidden />
      {t(status)}
    </span>
  );
}
