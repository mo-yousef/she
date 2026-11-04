'use client';
import { ErrorState } from '@/components/error-state';

export default function Error(props: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErrorState {...props} area="admin" />;
}
