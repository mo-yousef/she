import { useTranslations } from 'next-intl';
import { CheckCircle2, Clock3, FileEdit, AlertTriangle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

const ICON = { DRAFT: FileEdit, PENDING: Clock3, PUBLISHED: CheckCircle2, SUSPENDED: AlertTriangle } as const;
// Tone via icon + text (never colour alone); Badge supplies the shape and surface.
const TONE: Record<keyof typeof ICON, string> = {
  DRAFT: 'text-muted-foreground',
  PENDING: 'text-primary',
  PUBLISHED: 'text-success',
  SUSPENDED: 'text-destructive',
};

export function BusinessStatusBadge({ status }: { status: keyof typeof ICON }) {
  const t = useTranslations('dashboard.status');
  const Icon = ICON[status];
  return (
    <Badge variant="secondary" className={`gap-1.5 text-sm font-medium ${TONE[status]}`}>
      <Icon className="h-4 w-4" aria-hidden />
      {t(status)}
    </Badge>
  );
}
